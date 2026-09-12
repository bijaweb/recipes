import { pgTable, serial, text, integer, doublePrecision } from "drizzle-orm/pg-core";

// The protein-family picker for the meal planner. Seeded once from the
// Blue Apron corpus analysis (recipe-planner/protein_pairings.json) via
// scripts/import-planner-data.ts. sortOrder ranks by recipe_count desc;
// the frontend shows the first 5 as icons and the rest behind search.
export const plannerProteinsTable = pgTable("recipes_planner_proteins", {
  id: serial("id").primaryKey(),
  familyKey: text("family_key").notNull().unique(),
  label: text("label").notNull(),
  icon: text("icon").notNull(),
  recipeCount: integer("recipe_count").notNull().default(0),
  avgRating: doublePrecision("avg_rating"),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type InsertPlannerProtein = typeof plannerProteinsTable.$inferInsert;
export type PlannerProteinRecord = typeof plannerProteinsTable.$inferSelect;
