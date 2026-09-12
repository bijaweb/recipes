import { readFileSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { db, recipesTable, ingredientsTable, pool } from "@workspace/db";

// Simple, no-AI import of the Blue Apron recipe corpus: name, ingredients
// (quantity + item -- facts), category, and servings only. The source's
// own "steps" text is Blue Apron's own written expression (scraped via
// Wayback Machine) and is intentionally never read here -- steps are left
// blank rather than reproduced. All recipes are tagged isDessert = false
// (Meals) per request.
//
// Resumable: recipes already present (sourceSheet = "blue-apron-import"
// with this exact name) are skipped.

const SOURCE_SHEET = "blue-apron-import";

interface SourceRecipe {
  name: string;
  servings?: string;
  cuisine?: string[];
  category?: string[];
  ingredients: { quantity?: string; item: string }[];
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "recipe"
  );
}

async function uniqueSlug(name: string, taken: Set<string>): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;
  while (taken.has(candidate)) {
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
  taken.add(candidate);
  return candidate;
}

const FRACTIONS: Record<string, number> = {
  "⅛": 0.125,
  "¼": 0.25,
  "⅓": 1 / 3,
  "⅜": 0.375,
  "½": 0.5,
  "⅝": 0.625,
  "⅔": 2 / 3,
  "¾": 0.75,
  "⅞": 0.875,
};

const UNIT_MAP: Record<string, string> = {
  g: "g",
  gram: "g",
  grams: "g",
  kg: "kg",
  oz: "oz",
  ounce: "oz",
  ounces: "oz",
  lb: "lb",
  lbs: "lb",
  pound: "lb",
  pounds: "lb",
  ml: "ml",
  l: "l",
  liter: "l",
  liters: "l",
  tsp: "tsp",
  tsps: "tsp",
  teaspoon: "tsp",
  teaspoons: "tsp",
  tbsp: "tbsp",
  tbsps: "tbsp",
  tablespoon: "tbsp",
  tablespoons: "tbsp",
  cup: "cup",
  cups: "cup",
  "fl oz": "fl_oz",
  "fl. oz": "fl_oz",
  qt: "qt",
  quart: "qt",
  quarts: "qt",
  gal: "gal",
  gallon: "gal",
  gallons: "gal",
};

function parseQuantity(quantity: string | undefined): { amountValue: number | undefined; unit: string | undefined } {
  if (!quantity) return { amountValue: undefined, unit: undefined };
  const trimmed = quantity.trim();

  // "1½" or "1 ½" style mixed fraction
  const mixedMatch = trimmed.match(/^(\d+)\s*([⅛¼⅓⅜½⅝⅔¾⅞])\s*(.*)$/);
  // bare unicode fraction "⅔ cup"
  const fracMatch = trimmed.match(/^([⅛¼⅓⅜½⅝⅔¾⅞])\s*(.*)$/);
  // plain "1/2 cup"
  const slashMatch = trimmed.match(/^(\d+)\/(\d+)\s*(.*)$/);
  // plain number, optional decimal, optional unit word(s)
  const plainMatch = trimmed.match(/^(\d+(?:\.\d+)?)\s*(.*)$/);

  let value: number | undefined;
  let rest = "";
  if (mixedMatch) {
    value = Number.parseInt(mixedMatch[1], 10) + FRACTIONS[mixedMatch[2]];
    rest = mixedMatch[3];
  } else if (fracMatch) {
    value = FRACTIONS[fracMatch[1]];
    rest = fracMatch[2];
  } else if (slashMatch) {
    value = Number.parseInt(slashMatch[1], 10) / Number.parseInt(slashMatch[2], 10);
    rest = slashMatch[3];
  } else if (plainMatch) {
    value = Number.parseFloat(plainMatch[1]);
    rest = plainMatch[2];
  } else {
    return { amountValue: undefined, unit: undefined };
  }

  const unitWord = rest.trim().toLowerCase().replace(/\.$/, "");
  const unit = unitWord ? UNIT_MAP[unitWord] : "each";
  return { amountValue: value, unit };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: pnpm --filter @workspace/scripts run import-blue-apron-simple -- <file.jsonl>");
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : undefined;

  const lines = readFileSync(file, "utf-8").trim().split("\n");
  // This source file is missing the final closing brace on every line --
  // confirmed uniform across all 7,949 records (every line already ends in
  // "}" from the innermost object, so an endsWith check can't detect this;
  // just always append the missing one).
  let recipes: SourceRecipe[] = lines.map((l) => JSON.parse(`${l}}`));
  if (limit) recipes = recipes.slice(0, limit);

  console.log(`Loaded ${recipes.length} source recipes from ${file}`);

  const existingRows = await db
    .select({ name: recipesTable.name, slug: recipesTable.slug })
    .from(recipesTable)
    .where(sql`${recipesTable.sourceSheet} = ${SOURCE_SHEET}`);
  const existingTitles = new Set(existingRows.map((r) => r.name));
  const allSlugs = new Set((await db.select({ slug: recipesTable.slug }).from(recipesTable)).map((r) => r.slug));

  const todo = recipes.filter((r) => !existingTitles.has(r.name));
  console.log(`${existingTitles.size} already imported, ${todo.length} remaining`);

  let imported = 0;
  let skipped = 0;
  for (const src of todo) {
    if (!src.name.trim() || !src.ingredients?.length) {
      skipped++;
      continue;
    }
    const slug = await uniqueSlug(src.name, allSlugs);
    const [row] = await db
      .insert(recipesTable)
      .values({
        name: src.name,
        slug,
        category: src.category?.[0] || src.cuisine?.[0] || "",
        yieldText: src.servings || "",
        isDessert: false,
        sourceSheet: SOURCE_SHEET,
      })
      .returning();

    await db.insert(ingredientsTable).values(
      src.ingredients.map((ing, idx) => {
        const { amountValue, unit } = parseQuantity(ing.quantity);
        return {
          recipeId: row.id,
          position: idx,
          amountText: ing.quantity || "",
          amountValue,
          unit,
          product: ing.item,
          notes: "",
        };
      }),
    );

    imported++;
    if (imported % 500 === 0) console.log(`  ${imported}/${todo.length} imported`);
  }

  console.log(`\nDone. Imported ${imported}, skipped ${skipped} (missing name/ingredients).`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
