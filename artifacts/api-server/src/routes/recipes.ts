import { Router, type IRouter } from "express";
import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  db,
  recipesTable,
  ingredientsTable,
  stepsTable,
  utensilsTable,
  favoritesTable,
  recentSearchesTable,
  type RecipeRecord,
} from "@workspace/db";
import { parseRecipeText } from "@workspace/ai";
import {
  ListCategoriesResponse,
  GetSearchShortcutsResponse,
  SearchRecipesResponse,
  GetRecipeResponse,
  RenameCategoryBody,
  RenameCategoryResponse,
  DeleteRecipeResponse,
  ParseRecipeTextBody,
  ParseRecipeTextResponse,
  CreateRecipeBody,
  CreateRecipeResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

async function favoritedRecipeIds(userId: number, recipeIds: number[]): Promise<Set<number>> {
  if (recipeIds.length === 0) return new Set();
  const rows = await db
    .select({ recipeId: favoritesTable.recipeId })
    .from(favoritesTable)
    .where(and(eq(favoritesTable.userId, userId), inArray(favoritesTable.recipeId, recipeIds)));
  return new Set(rows.map((r) => r.recipeId));
}

function toSummary(r: RecipeRecord, favorited: boolean) {
  return {
    id: String(r.id),
    slug: r.slug,
    name: r.name,
    category: r.category,
    favorited,
  };
}

async function buildRecipeDetail(recipe: RecipeRecord, userId: number) {
  const [ingredients, steps, utensils, favorited] = await Promise.all([
    db.select().from(ingredientsTable).where(eq(ingredientsTable.recipeId, recipe.id)).orderBy(ingredientsTable.position),
    db.select().from(stepsTable).where(eq(stepsTable.recipeId, recipe.id)).orderBy(stepsTable.position),
    db.select().from(utensilsTable).where(eq(utensilsTable.recipeId, recipe.id)),
    favoritedRecipeIds(userId, [recipe.id]),
  ]);

  return {
    ...toSummary(recipe, favorited.has(recipe.id)),
    yieldText: recipe.yieldText,
    yieldServings: recipe.yieldServings ?? undefined,
    ingredients: ingredients.map((i) => ({
      id: String(i.id),
      amountText: i.amountText,
      amountValue: i.amountValue ?? undefined,
      unit: i.unit ?? undefined,
      product: i.product,
      notes: i.notes,
    })),
    steps: steps.map((s) => s.instruction),
    utensils: utensils.map((u) => u.name),
  };
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "recipe"
  );
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db.select({ id: recipesTable.id }).from(recipesTable).where(eq(recipesTable.slug, candidate));
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

router.get("/categories", async (_req, res): Promise<void> => {
  const rows = await db
    .selectDistinct({ category: recipesTable.category })
    .from(recipesTable)
    .where(sql`${recipesTable.category} <> ''`);
  res.json(ListCategoriesResponse.parse({ categories: rows.map((r) => r.category).sort() }));
});

router.get("/recipes/shortcuts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.user!.id;

  const recentRows = await db.execute(sql`
    SELECT r.* FROM ${recipesTable} r
    JOIN (
      SELECT recipe_id, max(searched_at) AS last_searched
      FROM ${recentSearchesTable}
      WHERE user_id = ${userId} AND recipe_id IS NOT NULL
      GROUP BY recipe_id
      ORDER BY last_searched DESC
      LIMIT 3
    ) latest ON latest.recipe_id = r.id
    ORDER BY latest.last_searched DESC
  `);
  const recent = recentRows.rows as unknown as RecipeRecord[];

  const randomRows = await db.execute(sql`
    SELECT * FROM ${recipesTable}
    ORDER BY random()
    LIMIT 5
  `);
  const random = randomRows.rows as unknown as RecipeRecord[];

  const favorited = await favoritedRecipeIds(userId, [...recent, ...random].map((r) => r.id));

  res.json(
    GetSearchShortcutsResponse.parse({
      recent: recent.map((r) => toSummary(r, favorited.has(r.id))),
      random: random.map((r) => toSummary(r, favorited.has(r.id))),
    }),
  );
});

router.get("/recipes", requireAuth, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const category = typeof req.query.category === "string" ? req.query.category.trim() : "";

  const conditions = [];
  if (q) conditions.push(or(ilike(recipesTable.name, `%${q}%`), ilike(recipesTable.category, `%${q}%`)));
  if (category) conditions.push(eq(recipesTable.category, category));

  const rows = await db
    .select()
    .from(recipesTable)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(recipesTable.name)
    .limit(100);

  const favorited = await favoritedRecipeIds(req.user!.id, rows.map((r) => r.id));

  res.json(
    SearchRecipesResponse.parse({
      recipes: rows.map((r) => toSummary(r, favorited.has(r.id))),
    }),
  );
});

router.get("/recipes/:slug", requireAuth, async (req, res): Promise<void> => {
  const [recipe] = await db.select().from(recipesTable).where(eq(recipesTable.slug, String(req.params.slug)));
  if (!recipe) {
    res.status(404).json({ error: "Recipe not found" });
    return;
  }

  const detail = await buildRecipeDetail(recipe, req.user!.id);

  await db.insert(recentSearchesTable).values({
    userId: req.user!.id,
    recipeId: recipe.id,
    query: recipe.name,
  });

  res.json(GetRecipeResponse.parse({ recipe: detail }));
});

router.post("/recipes/parse", requireAuth, async (req, res): Promise<void> => {
  const parsed = ParseRecipeTextBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  try {
    const draft = await parseRecipeText(parsed.data.text);
    res.json(ParseRecipeTextResponse.parse({ recipe: draft }));
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "Failed to parse recipe text." });
  }
});

router.post("/recipes", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateRecipeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const data = parsed.data;

  const slug = await uniqueSlug(data.name);

  const [recipe] = await db
    .insert(recipesTable)
    .values({
      name: data.name.trim(),
      slug,
      category: data.category.trim(),
      yieldText: data.yieldText.trim(),
      yieldServings: data.yieldServings ?? null,
      sourceSheet: "manual",
    })
    .returning();

  if (data.ingredients.length > 0) {
    await db.insert(ingredientsTable).values(
      data.ingredients.map((ing, position) => ({
        recipeId: recipe.id,
        position,
        amountText: ing.amountText,
        amountValue: ing.amountValue ?? null,
        unit: ing.unit ?? null,
        product: ing.product,
        notes: ing.notes,
      })),
    );
  }
  if (data.steps.length > 0) {
    await db.insert(stepsTable).values(data.steps.map((instruction, position) => ({ recipeId: recipe.id, position, instruction })));
  }
  if (data.utensils && data.utensils.length > 0) {
    await db.insert(utensilsTable).values(data.utensils.map((name) => ({ recipeId: recipe.id, name })));
  }

  const detail = await buildRecipeDetail(recipe, req.user!.id);
  res.json(CreateRecipeResponse.parse({ recipe: detail }));
});

router.put("/categories/:category", requireAuth, async (req, res): Promise<void> => {
  const parsed = RenameCategoryBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  await db
    .update(recipesTable)
    .set({ category: parsed.data.name.trim() })
    .where(eq(recipesTable.category, String(req.params.category)));

  res.json(RenameCategoryResponse.parse({ success: true }));
});

router.delete("/recipes/:recipeId/delete", requireAuth, async (req, res): Promise<void> => {
  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId)) {
    res.status(400).json({ error: "Invalid recipe id" });
    return;
  }

  await db.delete(recipesTable).where(eq(recipesTable.id, recipeId));

  res.json(DeleteRecipeResponse.parse({ success: true }));
});

export default router;
