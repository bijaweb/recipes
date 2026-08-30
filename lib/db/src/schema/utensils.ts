import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";

// Mostly empty at import time -- the source sheets don't list equipment
// separately from the procedure text. Meant to be filled in over time
// (manually, or by a future edit UI), not auto-extracted.
export const utensilsTable = pgTable("recipes_utensils", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
});

export type InsertUtensil = typeof utensilsTable.$inferInsert;
export type UtensilRecord = typeof utensilsTable.$inferSelect;
