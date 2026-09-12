import { readFileSync } from "fs";
import { eq, sql } from "drizzle-orm";
import { db, recipesTable, ingredientsTable, stepsTable, pool } from "@workspace/db";
import { generateRecipeFromIngredients } from "@workspace/ai";

// Bulk-imports the dpapathanasiou/recipes GitHub dataset (MIT-licensed
// compilation of recipe JSON files) as real catalog recipes. Only each
// recipe's title and factual ingredient list are read from the source --
// the source's own directions/instructions text is never read, stored, or
// shown to the model. Every recipe's steps here are written from scratch
// by generateRecipeFromIngredients, which has no source wording to copy.
//
// Resumable: recipes already present (sourceSheet = "github-import" with
// this exact title) are skipped, so a re-run after a crash or Ctrl-C only
// processes what's left. Safe to run with limited concurrency against the
// Anthropic API; per-recipe failures are logged and skipped rather than
// aborting the whole batch.

const SOURCE_SHEET = "github-import";
const CONCURRENCY = 12;

interface SourceRecipe {
  title: string;
  url: string;
  primary_protein_family: string;
  raw_ingredients: string[];
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
    const { recipe, usage } = await generateRecipeFromIngredients({
      title: src.title,
      rawIngredients: src.raw_ingredients,
    });
    stats.inputTokens += usage.input_tokens ?? 0;
    stats.outputTokens += usage.output_tokens ?? 0;
    stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    stats.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;

    const slug = await uniqueSlug(recipe.name || src.title);
    const [row] = await db
      .insert(recipesTable)
      .values({
        name: recipe.name || src.title,
        slug,
        category: recipe.category || src.primary_protein_family,
        yieldText: recipe.yieldText,
        yieldServings: recipe.yieldServings,
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
    console.error(`  [failed] ${src.title}: ${(err as Error).message}`);
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
  const file = args.find((a) => !a.startsWith("--")) ?? "./github_recipes_for_import.jsonl";
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
  const todo = recipes.filter((r) => !existingTitles.has(r.title));
  console.log(`${existingTitles.size} already imported, ${todo.length} remaining`);

  const stats: Stats = { attempted: 0, imported: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const start = Date.now();

  const PROGRESS_EVERY = 25;
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
  // Sonnet 5: $2/1M input, $10/1M output, cache write $2.50/1M, cache read $0.20/1M (approx)
  const costUsd =
    (stats.inputTokens * 2 +
      stats.outputTokens * 10 +
      stats.cacheWriteTokens * 2.5 +
      stats.cacheReadTokens * 0.2) /
    1_000_000;

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
