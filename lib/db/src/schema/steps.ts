import { pgTable, serial, integer, text } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";

export const stepsTable = pgTable("recipes_steps", {
  id: serial("id").primaryKey(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  position: integer("position").notNull(),
  instruction: text("instruction").notNull(),
});

export type InsertStep = typeof stepsTable.$inferInsert;
export type StepRecord = typeof stepsTable.$inferSelect;
