CREATE TABLE "recipes_planner_proteins" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_key" text NOT NULL,
	"label" text NOT NULL,
	"icon" text NOT NULL,
	"recipe_count" integer DEFAULT 0 NOT NULL,
	"avg_rating" double precision,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "recipes_planner_proteins_family_key_unique" UNIQUE("family_key")
);
--> statement-breakpoint
CREATE TABLE "recipes_planner_pairings" (
	"id" serial PRIMARY KEY NOT NULL,
	"family_key" text NOT NULL,
	"cuisine_filter" text,
	"role" text NOT NULL,
	"item_name" text NOT NULL,
	"recipe_count" integer DEFAULT 0 NOT NULL,
	"weighted_score" double precision DEFAULT 0 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes_meal_plan" (
	"id" serial PRIMARY KEY NOT NULL,
	"date" date NOT NULL,
	"recipe_id" integer NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes_ingredients" ADD COLUMN "ingredient_catalog_id" integer;--> statement-breakpoint
ALTER TABLE "recipes_meal_plan" ADD CONSTRAINT "recipes_meal_plan_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_ingredients" ADD CONSTRAINT "recipes_ingredients_ingredient_catalog_id_recipes_ingredient_catalog_id_fk" FOREIGN KEY ("ingredient_catalog_id") REFERENCES "public"."recipes_ingredient_catalog"("id") ON DELETE set null ON UPDATE no action;