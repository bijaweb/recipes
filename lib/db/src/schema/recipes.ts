import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";

// The recipe catalog is shared: every signed-in user sees the same set of
// recipes (unlike favorites, which are per-user -- see favorites.ts).
export const recipesTable = pgTable("recipes_recipes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  category: text("category").notNull().default(""),
  // Drives the Meals/Dessert toggle on the search page -- an explicit,
  // user-editable flag rather than something derived from `category` at
  // read time, since category is free text and not reliably one or the
  // other (e.g. "Sauces, Glazes & Preserves" covers both a dessert coulis
  // and a savory pan sauce).
  isDessert: boolean("is_dessert").notNull().default(false),
  // Free-form yield text as written in the source (e.g. "1 dozen", "2 lb 8 oz
  // or 1213 grams"), plus a best-effort numeric serving count when one could
  // be parsed out of it, used as the baseline for the serving-size scaler.
  yieldText: text("yield_text").notNull().default(""),
  yieldServings: integer("yield_servings"),
  sourceSheet: text("source_sheet").notNull().default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type InsertRecipe = typeof recipesTable.$inferInsert;
export type RecipeRecord = typeof recipesTable.$inferSelect;
