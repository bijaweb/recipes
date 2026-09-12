import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";

// The shared household weekly calendar: which recipes are planned for which
// calendar date. Shared (no userId) like the recipe catalog itself -- one
// plan for the household, not one per person. A day can hold any number of
// recipes (e.g. multiple meals), ordered by sortOrder.
export const mealPlanTable = pgTable("recipes_meal_plan", {
  id: serial("id").primaryKey(),
  date: date("date", { mode: "string" }).notNull(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertMealPlanEntry = typeof mealPlanTable.$inferInsert;
export type MealPlanRecord = typeof mealPlanTable.$inferSelect;
