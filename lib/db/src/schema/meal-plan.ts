import { pgTable, serial, integer, date, timestamp } from "drizzle-orm/pg-core";
import { recipesTable } from "./recipes";
import { usersTable } from "./users";

// Each person's weekly calendar: which recipes are planned for which
// calendar date. Per user since 2026-10-30; people share one plan when an
// admin links them (usersTable.linkedUserId, resolved by resolveDataOwner).
// A day can hold any number of recipes (e.g. multiple meals), ordered by
// sortOrder.
export const mealPlanTable = pgTable("recipes_meal_plan", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  date: date("date", { mode: "string" }).notNull(),
  recipeId: integer("recipe_id")
    .notNull()
    .references(() => recipesTable.id, { onDelete: "cascade" }),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertMealPlanEntry = typeof mealPlanTable.$inferInsert;
export type MealPlanRecord = typeof mealPlanTable.$inferSelect;
