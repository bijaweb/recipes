import { eq, isNull, sql } from "drizzle-orm";
import { db, recipesTable, ingredientsTable, stepsTable, pool } from "@workspace/db";
import { generateRecipeFromIngredients } from "@workspace/ai";

// Adds AI-written, from-scratch steps to the already-imported Blue Apron
// recipes (name + ingredients only, no steps -- see import-blue-apron-simple.ts).
// Only reads each recipe's title and its own already-stored ingredient list
// (both facts, already in the DB) -- the source corpus's own directions text
// is never read here at all, so there is nothing to copy or paraphrase from.
// Existing ingredients/other fields are left untouched; this only inserts
// stepsTable rows.
//
// Resumable by construction: only recipes with zero existing steps are
// selected each run.

const CONCURRENCY = 12;

interface Stats {
  attempted: number;
  done: number;
  failed: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

async function processOne(recipe: { id: number; name: string; yieldText: string }, stats: Stats) {
  stats.attempted++;
  try {
    const ingredients = await db
      .select({ amountText: ingredientsTable.amountText, product: ingredientsTable.product })
      .from(ingredientsTable)
      .where(eq(ingredientsTable.recipeId, recipe.id))
      .orderBy(ingredientsTable.position);

    const rawIngredients = ingredients.map((i) => (i.amountText ? `${i.amountText} ${i.product}` : i.product));
    const { recipe: draft, usage } = await generateRecipeFromIngredients({
      title: recipe.name,
      rawIngredients,
      servingsHint: recipe.yieldText || undefined,
    });
    stats.inputTokens += usage.input_tokens ?? 0;
    stats.outputTokens += usage.output_tokens ?? 0;
    stats.cacheReadTokens += usage.cache_read_input_tokens ?? 0;
    stats.cacheWriteTokens += usage.cache_creation_input_tokens ?? 0;

    if (draft.steps.length > 0) {
      await db.insert(stepsTable).values(draft.steps.map((instruction, idx) => ({ recipeId: recipe.id, position: idx, instruction })));
    }
    stats.done++;
  } catch (err) {
    stats.failed++;
    console.error(`  [failed] ${recipe.name}: ${(err as Error).message}`);
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
  const limitArg = args.find((a) => a.startsWith("--limit="));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1], 10) : undefined;

  const rows = await db
    .select({ id: recipesTable.id, name: recipesTable.name, yieldText: recipesTable.yieldText })
    .from(recipesTable)
    .leftJoin(stepsTable, eq(stepsTable.recipeId, recipesTable.id))
    .where(sql`${recipesTable.sourceSheet} = 'blue-apron-import' AND ${isNull(stepsTable.id)}`)
    .groupBy(recipesTable.id);

  const todo = limit ? rows.slice(0, limit) : rows;
  console.log(`${todo.length} recipes need steps`);

  const stats: Stats = { attempted: 0, done: 0, failed: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
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
      `[progress] ${stats.attempted}/${todo.length} (done ${stats.done}, failed ${stats.failed}) -- ${rate.toFixed(2)}/s, ETA ${etaMin.toFixed(1)} min`,
    );
  }, 10_000);

  await runPool(todo, CONCURRENCY, (r) => processOne(r, stats));
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
