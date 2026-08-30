import { pgTable, serial, integer, text, doublePrecision } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";

// One row per ingredient line. amountValue/unit are populated only when the
// source amount could be parsed into a scalable, convertible quantity (a
// plain number, optionally a fraction); free-form amounts like "to taste"
// keep amountText but leave amountValue/unit null, and the frontend falls
// back to showing amountText as-is (no scaling/unit conversion for those).
export const ingredientsTable = pgTable("recipes_ingredients", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  amountText: text("amount_text").notNull().default(""),
  amountValue: doublePrecision("amount_value"),
  unit: text("unit"),
  product: text("product").notNull().default(""),
  notes: text("notes").notNull().default(""),
});

export type InsertIngredient = typeof ingredientsTable.$inferInsert;
export type IngredientRecord = typeof ingredientsTable.$inferSelect;
