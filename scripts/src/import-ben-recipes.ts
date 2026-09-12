import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { sql } from "drizzle-orm";
import { db, recipesTable, ingredientsTable, stepsTable, pool } from "@workspace/db";

// Imports Ben's own recipe collection (personal meal-kit order history,
// exported as CSV) as real catalog recipes -- full ingredient lists AND full
// step text. Unlike the third-party Blue Apron corpus import, these are
// recipes Ben actually cooked and exported himself, so there's no
// wording-reuse concern: step text is kept verbatim.
//
// The source CSV's `ingredients`/`steps` columns are a nonstandard,
// inconsistently-quoted Python-dict-repr format -- e.g.
//   [{'position': 1, 'quantity': 10 oz, 'item': Thinly Sliced Beef}, ...]
//   [{'number': 1, 'title': 'Prepare the peppers:', 'text': "..."}, ...]
// Some string values are single-quoted (with backslash-escaped apostrophes),
// others are bare/unquoted, inconsistently across rows -- confirmed by
// checking every row in the source file. splitTopLevelDicts/parseKvDict below
// tokenize each column the same way regardless of quoting style.
//
// `total_time_min`/`calories` have no columns in the recipes schema; rather
// than drop them, they're folded into the existing free-text `yieldText`
// field (e.g. "2 Servings • 30 min • 440 cal"), which the recipe detail page
// already displays verbatim as "Yield: ...". `yieldServings` (used by the
// serving-size scaler) is parsed from the leading number of `servings` only,
// so this doesn't affect scaling.
//
// Resumable: recipes already present (sourceSheet = "ben-recipes-import"
// with this exact name) are skipped.

const SOURCE_SHEET = "ben-recipes-import";

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "recipe"
  );
}

function uniqueSlug(name: string, taken: Set<string>): string {
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

// Splits a "[{...}, {...}]" column into its individual "{...}" dict strings
// by brace depth alone -- values in this source never contain literal braces.
function splitTopLevelDicts(listStr: string): string[] {
  const s = listStr.trim();
  if (!s.startsWith("[") || !s.endsWith("]")) return [];
  const inner = s.slice(1, -1);
  const dicts: string[] = [];
  let depth = 0;
  let start = -1;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0) dicts.push(inner.slice(start, i + 1));
    }
  }
  return dicts;
}

// Parses one "{'k1': v1, 'k2': v2, ...}" dict string given its keys in known,
// fixed order. Each value may or may not be single-quoted (mixed within the
// same column across rows); quoted values may contain backslash-escaped
// apostrophes ("you\\'d like").
function parseKvDict(dictStr: string, keys: string[]): Record<string, string> {
  const body = dictStr.slice(1, -1);
  const result: Record<string, string> = {};
  let pos = 0;
  for (let ki = 0; ki < keys.length; ki++) {
    const key = keys[ki];
    const prefix = `'${key}':`;
    const idx = body.indexOf(prefix, pos);
    pos = idx + prefix.length;
    while (pos < body.length && body[pos] === " ") pos++;
    const isLast = ki === keys.length - 1;
    let value: string;
    if (body[pos] === "'") {
      pos++;
      const buf: string[] = [];
      while (pos < body.length) {
        const ch = body[pos];
        if (ch === "\\" && pos + 1 < body.length) {
          buf.push(body.slice(pos, pos + 2));
          pos += 2;
          continue;
        }
        if (ch === "'") break;
        buf.push(ch);
        pos++;
      }
      value = buf
        .join("")
        .replace(/\\'/g, "'")
        .replace(/\\\\/g, "\\");
      pos++;
    } else {
      let end: number;
      if (isLast) {
        end = body.length;
      } else {
        const nextPrefix = `, '${keys[ki + 1]}':`;
        end = body.indexOf(nextPrefix, pos);
      }
      value = body.slice(pos, end).trim();
      pos = end;
    }
    result[key] = value;
    while (pos < body.length && (body[pos] === "," || body[pos] === " ")) pos++;
  }
  return result;
}

function parseBracketScalar(s: string): string[] {
  const t = s.trim();
  if (!t.startsWith("[") || !t.endsWith("]")) return t ? [t] : [];
  const inner = t.slice(1, -1).trim();
  return inner ? inner.split(",").map((p) => p.trim()) : [];
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

// Same base unit vocabulary as import-blue-apron-simple.ts, extended with the
// count-style units (clove, bunch, head, ear, slice, stalk, sprig, pinch,
// each) that show up throughout this source's ingredient quantities.
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
  clove: "clove",
  cloves: "clove",
  bunch: "bunch",
  bunches: "bunch",
  "large bunch": "bunch",
  "small bunch": "bunch",
  head: "head",
  heads: "head",
  ear: "ear",
  ears: "ear",
  slice: "slice",
  slices: "slice",
  stalk: "stalk",
  stalks: "stalk",
  sprig: "sprig",
  sprigs: "sprig",
  pinch: "pinch",
  each: "each",
};

function parseQuantity(quantity: string | undefined): { amountValue: number | undefined; unit: string | undefined } {
  if (!quantity) return { amountValue: undefined, unit: undefined };
  const trimmed = quantity.trim();

  const mixedMatch = trimmed.match(/^(\d+)\s*([⅛¼⅓⅜½⅝⅔¾⅞])\s*(.*)$/);
  const fracMatch = trimmed.match(/^([⅛¼⅓⅜½⅝⅔¾⅞])\s*(.*)$/);
  const slashMatch = trimmed.match(/^(\d+)\/(\d+)\s*(.*)$/);
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

interface SourceRow {
  name: string;
  servings: string;
  total_time_min: string;
  calories: string;
  cuisine: string;
  category: string;
  ingredients: string;
  steps: string;
}

interface ParsedIngredient {
  amountText: string;
  amountValue: number | undefined;
  unit: string | undefined;
  product: string;
}

interface ParsedRecipe {
  name: string;
  category: string;
  yieldText: string;
  yieldServings: number | undefined;
  ingredients: ParsedIngredient[];
  steps: string[];
}

function parseRow(row: SourceRow): ParsedRecipe {
  const ingredients: ParsedIngredient[] = splitTopLevelDicts(row.ingredients).map((d) => {
    const kv = parseKvDict(d, ["position", "quantity", "item"]);
    const { amountValue, unit } = parseQuantity(kv.quantity);
    return { amountText: kv.quantity, amountValue, unit, product: kv.item };
  });

  const steps: string[] = splitTopLevelDicts(row.steps).map((d) => {
    const kv = parseKvDict(d, ["number", "title", "text"]);
    return [kv.title, kv.text].filter(Boolean).join(" ").trim();
  });

  const cuisine = parseBracketScalar(row.cuisine);
  const category = parseBracketScalar(row.category);

  const servingsMatch = row.servings.match(/^(\d+)/);
  const yieldServings = servingsMatch ? Number.parseInt(servingsMatch[1], 10) : undefined;

  const yieldParts = [
    row.servings.trim(),
    row.total_time_min.trim() ? `${row.total_time_min.trim()} min` : "",
    row.calories.trim() ? `${row.calories.trim()} cal` : "",
  ].filter(Boolean);

  return {
    name: row.name.trim(),
    category: cuisine[0] || category[0] || "",
    yieldText: yieldParts.join(" • "),
    yieldServings,
    ingredients,
    steps,
  };
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  const dryRun = args.includes("--dry-run");
  if (!file) {
    console.error("Usage: pnpm --filter @workspace/scripts run import-ben-recipes -- <file.csv> [--dry-run]");
    process.exit(1);
  }

  const raw = readFileSync(file, "utf-8");
  const sourceRows = parse(raw, { columns: true, skip_empty_lines: true }) as SourceRow[];
  console.log(`Loaded ${sourceRows.length} source recipes from ${file}`);

  const parsed = sourceRows.map(parseRow).filter((r) => r.name && r.ingredients.length > 0);
  const skipped = sourceRows.length - parsed.length;
  if (skipped > 0) console.log(`Skipping ${skipped} rows missing a name or ingredients.`);

  if (dryRun) {
    const totalIngredients = parsed.reduce((n, r) => n + r.ingredients.length, 0);
    const totalSteps = parsed.reduce((n, r) => n + r.steps.length, 0);
    console.log(`[dry run] Would import ${parsed.length} recipes, ${totalIngredients} ingredients, ${totalSteps} steps.`);
    console.log("[dry run] Sample:", JSON.stringify(parsed[0], null, 2));
    return;
  }

  const existingRows = await db
    .select({ name: recipesTable.name })
    .from(recipesTable)
    .where(sql`${recipesTable.sourceSheet} = ${SOURCE_SHEET}`);
  const existingTitles = new Set(existingRows.map((r) => r.name));
  const allSlugs = new Set((await db.select({ slug: recipesTable.slug }).from(recipesTable)).map((r) => r.slug));

  const todo = parsed.filter((r) => !existingTitles.has(r.name));
  console.log(`${existingTitles.size} already imported, ${todo.length} remaining`);

  let imported = 0;
  for (const recipe of todo) {
    const slug = uniqueSlug(recipe.name, allSlugs);
    const [row] = await db
      .insert(recipesTable)
      .values({
        name: recipe.name,
        slug,
        category: recipe.category,
        yieldText: recipe.yieldText,
        yieldServings: recipe.yieldServings,
        isDessert: false,
        sourceSheet: SOURCE_SHEET,
      })
      .returning();

    await db.insert(ingredientsTable).values(
      recipe.ingredients.map((ing, idx) => ({
        recipeId: row.id,
        position: idx,
        amountText: ing.amountText,
        amountValue: ing.amountValue,
        unit: ing.unit,
        product: ing.product,
        notes: "",
      })),
    );

    if (recipe.steps.length > 0) {
      await db.insert(stepsTable).values(
        recipe.steps.map((instruction, idx) => ({ recipeId: row.id, position: idx, instruction })),
      );
    }

    imported++;
    if (imported % 100 === 0) console.log(`  ${imported}/${todo.length} imported`);
  }

  console.log(`\nDone. Imported ${imported}.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
