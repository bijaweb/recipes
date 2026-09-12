import { Router, type IRouter } from "express";
import { and, asc, eq, gte, isNull, lte, ne, sql } from "drizzle-orm";
import {
  db,
  plannerProteinsTable,
  plannerPairingsTable,
  mealPlanTable,
  recipesTable,
  ingredientsTable,
  ingredientCatalogTable,
  type PlannerPairingRecord,
} from "@workspace/db";
import {
  ListPlannerProteinsResponse,
  GetPlannerPairingsResponse,
  BuildPlannerRecipeBody,
  BuildPlannerRecipeResponse,
  ListMealPlanResponse,
  AddMealPlanEntryBody,
  AddMealPlanEntryResponse,
  MoveMealPlanEntryBody,
  MoveMealPlanEntryResponse,
  RemoveMealPlanEntryResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/require-auth";
import { favoritedRecipeIds, toSummary, buildRecipeDetail, uniqueSlug } from "./recipes";

const router: IRouter = Router();

router.get("/planner/proteins", async (_req, res): Promise<void> => {
  const rows = await db
    .select()
    .from(plannerProteinsTable)
    .orderBy(asc(plannerProteinsTable.sortOrder));

  res.json(
    ListPlannerProteinsResponse.parse({
      proteins: rows.map((r) => ({
        familyKey: r.familyKey,
        label: r.label,
        icon: r.icon,
        recipeCount: r.recipeCount,
        avgRating: r.avgRating ?? undefined,
      })),
    }),
  );
});

function toPairingItem(r: PlannerPairingRecord) {
  return { name: r.itemName, recipeCount: r.recipeCount, weightedScore: r.weightedScore };
}

router.get("/planner/pairings", async (req, res): Promise<void> => {
  const familyKey = typeof req.query.familyKey === "string" ? req.query.familyKey : "";
  const cuisine = typeof req.query.cuisine === "string" && req.query.cuisine.trim() ? req.query.cuisine.trim() : null;
  if (!familyKey) {
    res.status(404).json({ error: "Unknown protein family" });
    return;
  }

  const [protein] = await db.select().from(plannerProteinsTable).where(eq(plannerProteinsTable.familyKey, familyKey));
  if (!protein) {
    res.status(404).json({ error: "Unknown protein family" });
    return;
  }

  const cuisineOptions = await db
    .select()
    .from(plannerPairingsTable)
    .where(
      and(eq(plannerPairingsTable.familyKey, familyKey), eq(plannerPairingsTable.role, "cuisine"), isNull(plannerPairingsTable.cuisineFilter)),
    )
    .orderBy(asc(plannerPairingsTable.sortOrder));

  const cuisineCondition = cuisine
    ? eq(plannerPairingsTable.cuisineFilter, cuisine)
    : isNull(plannerPairingsTable.cuisineFilter);

  let rows = await db
    .select()
    .from(plannerPairingsTable)
    .where(and(eq(plannerPairingsTable.familyKey, familyKey), cuisineCondition, ne(plannerPairingsTable.role, "cuisine")))
    .orderBy(asc(plannerPairingsTable.sortOrder));

  // If this protein+cuisine slice doesn't exist (too few recipes to have
  // been seeded), fall back to the protein's global, unfiltered pairings
  // rather than showing an empty picker.
  if (cuisine && rows.length === 0) {
    rows = await db
      .select()
      .from(plannerPairingsTable)
      .where(
        and(eq(plannerPairingsTable.familyKey, familyKey), isNull(plannerPairingsTable.cuisineFilter), ne(plannerPairingsTable.role, "cuisine")),
      )
      .orderBy(asc(plannerPairingsTable.sortOrder));
  }

  const byRole = (role: string) => rows.filter((r) => r.role === role).map(toPairingItem);

  res.json(
    GetPlannerPairingsResponse.parse({
      familyKey,
      sauces: byRole("sauce"),
      veg: byRole("veg"),
      carbs: byRole("carb"),
      cuisines: cuisineOptions.map(toPairingItem),
    }),
  );
});

// Best-effort link to the shared ingredient catalog for a planner-picked
// component (e.g. "Jasmine Rice"). Many won't match -- the Blue Apron
// corpus's Title Case, brand-specific naming and the Mealie-derived
// catalog's generic lowercase naming are two independently-built systems
// (see recipe-planner notes); this is a best-effort connection, not a
// guarantee, and most rows will end up with no match.
async function findCatalogMatch(text: string): Promise<number | null> {
  const lower = text.trim().toLowerCase();
  if (!lower) return null;
  const [row] = await db
    .select({ id: ingredientCatalogTable.id })
    .from(ingredientCatalogTable)
    .where(
      sql`lower(${ingredientCatalogTable.name}) = ${lower}
        OR lower(${ingredientCatalogTable.pluralName}) = ${lower}
        OR ${ingredientCatalogTable.aliases}::jsonb ? ${lower}`,
    );
  return row?.id ?? null;
}

router.post("/planner/build", requireAuth, async (req, res): Promise<void> => {
  const parsed = BuildPlannerRecipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { proteinLabel, sauce, veg, carb } = parsed.data;

  const name = `${proteinLabel} with ${sauce}, ${veg} & ${carb}`;
  const slug = await uniqueSlug(name);

  const [recipe] = await db
    .insert(recipesTable)
    .values({
      name,
      slug,
      category: "Planner",
      yieldText: "",
      sourceSheet: "planner",
    })
    .returning();

  const components = [proteinLabel, sauce, veg, carb];
  const matches = await Promise.all(components.map(findCatalogMatch));

  await db.insert(ingredientsTable).values(
    components.map((product, position) => ({
      recipeId: recipe.id,
      position,
      amountText: "",
      product,
      notes: "",
      ingredientCatalogId: matches[position],
    })),
  );

  const detail = await buildRecipeDetail(recipe, req.user!.id);
  res.json(BuildPlannerRecipeResponse.parse({ recipe: detail }));
});

router.get("/planner/calendar", requireAuth, async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : "";
  const to = typeof req.query.to === "string" ? req.query.to : "";
  if (!from || !to) {
    res.status(400).json({ error: "from and to are required (YYYY-MM-DD)" });
    return;
  }

  const rows = await db
    .select({
      id: mealPlanTable.id,
      date: mealPlanTable.date,
      sortOrder: mealPlanTable.sortOrder,
      recipe: recipesTable,
    })
    .from(mealPlanTable)
    .innerJoin(recipesTable, eq(recipesTable.id, mealPlanTable.recipeId))
    .where(and(gte(mealPlanTable.date, from), lte(mealPlanTable.date, to)))
    .orderBy(asc(mealPlanTable.date), asc(mealPlanTable.sortOrder));

  const favorited = await favoritedRecipeIds(req.user!.id, rows.map((r) => r.recipe.id));

  res.json(
    ListMealPlanResponse.parse({
      entries: rows.map((r) => ({
        id: String(r.id),
        date: r.date,
        sortOrder: r.sortOrder,
        recipe: toSummary(r.recipe, favorited.has(r.recipe.id)),
      })),
    }),
  );
});

router.post("/planner/calendar", requireAuth, async (req, res): Promise<void> => {
  const parsed = AddMealPlanEntryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const recipeId = Number(parsed.data.recipeId);
  if (!Number.isInteger(recipeId)) {
    res.status(400).json({ error: "Invalid recipeId" });
    return;
  }

  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, recipeId));
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  const [{ maxOrder }] = await db
    .select({ maxOrder: sql<number>`coalesce(max(${mealPlanTable.sortOrder}), -1)` })
    .from(mealPlanTable)
    .where(eq(mealPlanTable.date, parsed.data.date));

  const [entry] = await db
    .insert(mealPlanTable)
    .values({ date: parsed.data.date, recipeId, sortOrder: maxOrder + 1 })
    .returning();

  const favorited = await favoritedRecipeIds(req.user!.id, [recipe.id]);

  res.json(
    AddMealPlanEntryResponse.parse({
      entry: {
        id: String(entry.id),
        date: entry.date,
        sortOrder: entry.sortOrder,
        recipe: toSummary(recipe, favorited.has(recipe.id)),
      },
    }),
  );
});

router.patch("/planner/calendar/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const parsed = MoveMealPlanEntryBody.safeParse(req.body);
  if (!Number.isInteger(id) || !parsed.success) {
    res.status(400).json({ error: "Invalid request" });
    return;
  }

  const updates: Partial<typeof mealPlanTable.$inferInsert> = { date: parsed.data.date };
  if (parsed.data.sortOrder !== undefined) updates.sortOrder = parsed.data.sortOrder;

  const [entry] = await db.update(mealPlanTable).set(updates).where(eq(mealPlanTable.id, id)).returning();
  if (!entry) {
    res.status(404).json({ error: "Not found" });
    return;
  }

  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.id, entry.recipeId));
  const favorited = await favoritedRecipeIds(req.user!.id, recipe ? [recipe.id] : []);

  res.json(
    MoveMealPlanEntryResponse.parse({
      entry: {
        id: String(entry.id),
        date: entry.date,
        sortOrder: entry.sortOrder,
        recipe: toSummary(recipe!, favorited.has(recipe!.id)),
      },
    }),
  );
});

router.delete("/planner/calendar/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  await db.delete(mealPlanTable).where(eq(mealPlanTable.id, id));
  res.json(RemoveMealPlanEntryResponse.parse({ success: true }));
});

export default router;
