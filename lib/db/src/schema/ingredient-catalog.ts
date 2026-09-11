import { pgTable, serial, text, jsonb, timestamp } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

// A shared reference catalog of known ingredient names (e.g. "garlic",
// category "Vegetables & Greens"), distinct from recipes_ingredients which
// stores free-text ingredient lines within one specific recipe. Bulk-loaded
// once from a CSV via scripts/import-ingredient-catalog; backs the
// Settings -> Ingredients management page.
export const ingredientCatalogTable = pgTable("recipes_ingredient_catalog", {
  id: serial("id").primaryKey(),
  name: text("name").notNull().unique(),
  pluralName: text("plural_name").notNull().default(""),
  category: text("category").notNull().default(""),
  aliases: jsonb("aliases").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertIngredientCatalogEntry = typeof ingredientCatalogTable.$inferInsert;
export type IngredientCatalogRecord = typeof ingredientCatalogTable.$inferSelect;
