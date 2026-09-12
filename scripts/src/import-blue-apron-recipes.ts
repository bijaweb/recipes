import { readFileSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { db, recipesTable, ingredientsTable, stepsTable, pool } from "@workspace/db";
import { generateRecipeFromIngredients } from "@workspace/ai";

// Imports the Blue Apron recipe corpus (scraped via Wayback Machine snapshots)
// as real catalog recipes, all tagged as meals (not desserts). Only each
// recipe's name, ingredient list (quantity + item -- facts), servings, and
// cuisine are ever read from the source. The source's own "steps"/"text"
// fields and "notes" field are intentionally never read here: the file's own
// embedded metadata says "Step wording is Blue Apron's expression --
// paraphrase before republishing," so every recipe's directions here are
// written from scratch by generateRecipeFromIngredients, which has no
// source wording to draw from at all.
//
// Resumable: recipes already present (sourceSheet = "blue-apron-import"
// with this exact title) are skipped.

const SOURCE_SHEET = "blue-apron-import";
const CONCURRENCY = 12;

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

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name);
  let candidate = base;
  let suffix = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const [existing] = await db.select({ id: recipesTable.id }).from(recipesTable).where(eq(recipesTable.slug, candidate));
    if (!existing) return candidate;
    suffix += 1;
    candidate = `${base}-${suffix}`;
  }
}

interface Stats {
  attempted: number;
  imported: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

async function importOne(src: SourceRecipe, stats: Stats) {
  stats.attempted++;
  try {
    const rawIngredients = src.ingredients.map((ing) => (ing.quantity ? `${ing.quantity} ${ing.item}` : ing.item));
    const { recipe, usage } = await generateRecipeFromIngredients({
      title: src.name,
      rawIngredients,
      servingsHint: src.servings,
      cuisineHint: src.cuisine?.[0],
    });
    stats.inputTokens += usage.input_tokens ?? 0;
    stats.outputTokens += usage.output_tokens ?? 0;
    stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    stats.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;

    const slug = await uniqueSlug(recipe.name || src.name);
    const [row] = await db
      .insert(recipesTable)
      .values({
        name: recipe.name || src.name,
        slug,
        category: recipe.category || src.category?.[0] || "",
        yieldText: recipe.yieldText,
        yieldServings: recipe.yieldServings,
        isDessert: false,
        sourceSheet: SOURCE_SHEET,
      })
      .returning();

    if (recipe.ingredients.length > 0) {
      await db.insert(ingredientsTable).values(
        recipe.ingredients.map((ing, idx) => ({
          recipeId: row.id,
          position: idx,
          amountText: ing.amountText,
          amountValue: ing.amountValue,
          unit: ing.unit,
          product: ing.product,
          notes: ing.notes,
        })),
      );
    }
    if (recipe.steps.length > 0) {
      await db.insert(stepsTable).values(
        recipe.steps.map((instruction, idx) => ({ recipeId: row.id, position: idx, instruction })),
      );
    }
    stats.imported++;
  } catch (err) {
    stats.failed++;
    console.error(`  [failed] ${src.name}: ${(err as Error).message}`);
  }
}

async function runPool<T>(items: T[], concurrency: number, worker: (item: T) => Promise<void>) {
  let idx = 0;
  async function next(): Promise<void> {
    const i = idx++;
    if (i >= items.length) return;
    await worker(items[i]);
    return next();
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => next()));
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: pnpm --filter @workspace/scripts run import-blue-apron-recipes -- <file.jsonl> [--limit=N]");
    process.exit(1);
  }
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : undefined;

  const lines = readFileSync(file, "utf-8").trim().split("\n");
  let recipes: SourceRecipe[] = lines.map((l) => JSON.parse(l));
  if (limit) recipes = recipes.slice(0, limit);

  console.log(`Loaded ${recipes.length} source recipes from ${file}`);

  const existingTitles = new Set(
    (
      await db
        .select({ name: recipesTable.name })
        .from(recipesTable)
        .where(sql`${recipesTable.sourceSheet} = ${SOURCE_SHEET}`)
    ).map((r) => r.name),
  );
  const todo = recipes.filter((r) => !existingTitles.has(r.name));
  console.log(`${existingTitles.size} already imported, ${todo.length} remaining`);

  const stats: Stats = { attempted: 0, imported: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const start = Date.now();

  let lastLogged = 0;
  const progressTimer = setInterval(() => {
    if (stats.attempted === lastLogged) return;
    lastLogged = stats.attempted;
    const elapsedSec = (Date.now() - start) / 1000;
    const rate = stats.attempted / elapsedSec;
    const remaining = todo.length - stats.attempted;
    const etaMin = rate > 0 ? remaining / rate / 60 : 0;
    console.log(
      `[progress] ${stats.attempted}/${todo.length} (imported ${stats.imported}, failed ${stats.failed}) -- ` +
        `${rate.toFixed(2)}/s, ETA ${etaMin.toFixed(1)} min`,
    );
  }, 10_000);

  await runPool(todo, CONCURRENCY, (r) => importOne(r, stats));
  clearInterval(progressTimer);

  const elapsedMin = (Date.now() - start) / 60000;
  const costUsd =
    (stats.inputTokens * 2 + stats.outputTokens * 10 + stats.cacheWriteTokens * 2.5 + stats.cacheReadTokens * 0.2) / 1_000_000;

  console.log("\n--- Summary ---");
  console.log(stats);
  console.log(`Elapsed: ${elapsedMin.toFixed(1)} min`);
  console.log(`Estimated cost: $${costUsd.toFixed(2)}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
