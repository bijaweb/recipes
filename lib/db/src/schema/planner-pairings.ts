import { pgTable, serial, text, integer, doublePrecision } from "drizzle-orm/pg-core";

// Per-protein-family pairing suggestions (sauce/veg/carb/cuisine), ranked by
// weightedScore = rating_value * log(1+rating_count) across the Blue Apron
// corpus -- so common, well-reviewed combos outrank rare ones. Seeded from
// recipe-planner/protein_pairings.json (cuisineFilter null = aggregated
// across all cuisines for that protein) and protein_cuisine_pairings.json
// (cuisineFilter set = recomputed within just that protein+cuisine slice,
// so picking a "flair" like Italian or Japanese actually changes the
// suggested sauce/veg/carb, not just the cuisine label itself).
export const plannerPairingsTable = pgTable("recipes_planner_pairings", {
  id: serial("id").primaryKey(),
  familyKey: text("family_key").notNull(),
  cuisineFilter: text("cuisine_filter"),
  role: text("role").notNull(), // 'sauce' | 'veg' | 'carb' | 'cuisine'
  itemName: text("item_name").notNull(),
  recipeCount: integer("recipe_count").notNull().default(0),
  weightedScore: doublePrecision("weighted_score").notNull().default(0),
  sortOrder: integer("sort_order").notNull().default(0),
});

export type InsertPlannerPairing = typeof plannerPairingsTable.$inferInsert;
export type PlannerPairingRecord = typeof plannerPairingsTable.$inferSelect;
