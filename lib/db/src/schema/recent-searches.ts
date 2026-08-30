import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { recipesTable } from "./recipes";

// Powers the "recently searched" shortcuts shown under the search box.
// Only the 3 most recent per user are ever read; old rows are pruned
// opportunistically rather than being load-bearing to keep around.
export const recentSearchesTable = pgTable("recipes_recent_searches", {
  id: serial("id").primaryKey(),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  query: text("query").notNull(),
  recipeId: integer("recipe_id").references(() => recipesTable.id, { onDelete: "set null" }),
  searchedAt: timestamp("searched_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertRecentSearch = typeof recentSearchesTable.$inferInsert;
export type RecentSearchRecord = typeof recentSearchesTable.$inferSelect;
