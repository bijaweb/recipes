import { Router, type IRouter } from "express";
import { and, eq, inArray } from "drizzle-orm";
import { db, favoritesTable, recipesTable } from "@workspace/db";
import { ListFavoritesResponse, AddFavoriteResponse, RemoveFavoriteResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

router.get("/favorites", requireAuth, async (req, res): Promise<void> => {
  const favRows = await db
    .select({ recipeId: favoritesTable.recipeId })
    .from(favoritesTable)
    .where(eq(favoritesTable.userId, req.user!.id));

  const recipeIds = favRows.map((r) => r.recipeId);
  const recipes = recipeIds.length
    ? await db.select().from(recipesTable).where(inArray(recipesTable.id, recipeIds)).orderBy(recipesTable.name)
    : [];

  res.json(
    ListFavoritesResponse.parse({
      recipes: recipes.map((r) => ({
        id: String(r.id),
        slug: r.slug,
        name: r.name,
        category: r.category,
        favorited: true,
      })),
    }),
  );
});

router.put("/favorites/:recipeId", requireAuth, async (req, res): Promise<void> => {
  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId)) {
    res.status(400).json({ error: "Invalid recipe id" });
    return;
  }

  await db
    .insert(favoritesTable)
    .values({ userId: req.user!.id, recipeId })
    .onConflictDoNothing();

  res.json(AddFavoriteResponse.parse({ success: true }));
});

router.delete("/favorites/:recipeId", requireAuth, async (req, res): Promise<void> => {
  const recipeId = Number(req.params.recipeId);
  if (!Number.isInteger(recipeId)) {
    res.status(400).json({ error: "Invalid recipe id" });
    return;
  }

  await db
    .delete(favoritesTable)
    .where(and(eq(favoritesTable.userId, req.user!.id), eq(favoritesTable.recipeId, recipeId)));

  res.json(RemoveFavoriteResponse.parse({ success: true }));
});

export default router;
