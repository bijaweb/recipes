import { Router, type IRouter } from "express";
import { asc, count, eq, ilike, or, sql } from "drizzle-orm";
import { db, ingredientCatalogTable, type IngredientCatalogRecord } from "@workspace/db";
import { ListIngredientCatalogResponse, DeleteIngredientCatalogItemResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/require-auth";

const router: IRouter = Router();

function toApi(row: IngredientCatalogRecord) {
  return {
    id: String(row.id),
    name: row.name,
    pluralName: row.pluralName,
    category: row.category,
    aliases: row.aliases,
  };
}

router.get("/ingredient-catalog", requireAuth, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const whereClause = q
    ? or(
        ilike(ingredientCatalogTable.name, `%${q}%`),
        ilike(ingredientCatalogTable.category, `%${q}%`),
        sql`${ingredientCatalogTable.aliases}::text ILIKE ${"%" + q + "%"}`,
      )
    : undefined;

  const [rows, totalRows] = await Promise.all([
    db
      .select()
      .from(ingredientCatalogTable)
      .where(whereClause)
      .orderBy(asc(ingredientCatalogTable.name))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(ingredientCatalogTable).where(whereClause),
  ]);

  res.json(
    ListIngredientCatalogResponse.parse({
      ingredients: rows.map(toApi),
      total: totalRows[0]?.total ?? 0,
    }),
  );
});

router.delete("/ingredient-catalog/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }

  await db.delete(ingredientCatalogTable).where(eq(ingredientCatalogTable.id, id));

  res.json(DeleteIngredientCatalogItemResponse.parse({ success: true }));
});

export default router;
