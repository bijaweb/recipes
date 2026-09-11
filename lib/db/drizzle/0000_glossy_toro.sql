CREATE TABLE "recipes_users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"google_id" text NOT NULL,
	"name" text,
	"picture" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_users_email_unique" UNIQUE("email"),
	CONSTRAINT "recipes_users_google_id_unique" UNIQUE("google_id")
);
--> statement-breakpoint
CREATE TABLE "recipes_recipes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"yield_text" text DEFAULT '' NOT NULL,
	"yield_servings" integer,
	"source_sheet" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_recipes_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "recipes_ingredients" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"position" integer NOT NULL,
	"amount_text" text DEFAULT '' NOT NULL,
	"amount_value" double precision,
	"unit" text,
	"product" text DEFAULT '' NOT NULL,
	"notes" text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes_ingredient_catalog" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plural_name" text DEFAULT '' NOT NULL,
	"category" text DEFAULT '' NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_ingredient_catalog_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "recipes_steps" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"position" integer NOT NULL,
	"instruction" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes_utensils" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipe_id" integer NOT NULL,
	"name" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipes_favorites" (
	"user_id" integer NOT NULL,
	"recipe_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipes_favorites_user_id_recipe_id_pk" PRIMARY KEY("user_id","recipe_id")
);
--> statement-breakpoint
CREATE TABLE "recipes_recent_searches" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"query" text NOT NULL,
	"recipe_id" integer,
	"searched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "recipes_ingredients" ADD CONSTRAINT "recipes_ingredients_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_steps" ADD CONSTRAINT "recipes_steps_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_utensils" ADD CONSTRAINT "recipes_utensils_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_favorites" ADD CONSTRAINT "recipes_favorites_user_id_recipes_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."recipes_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_favorites" ADD CONSTRAINT "recipes_favorites_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_recent_searches" ADD CONSTRAINT "recipes_recent_searches_user_id_recipes_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."recipes_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes_recent_searches" ADD CONSTRAINT "recipes_recent_searches_recipe_id_recipes_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes_recipes"("id") ON DELETE set null ON UPDATE no action;