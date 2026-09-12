import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";
import { eq, sql } from "drizzle-orm";
import { db, recipesTable, pool } from "@workspace/db";

// One-off backfill: classifies every existing recipe as dessert or not,
// using its name + category (both short, factual, and the user's own
// recipe-box data -- nothing copyrighted or scraped). Category alone isn't
// reliable ("Sauces, Glazes & Preserves" covers both a dessert coulis and a
// savory pan sauce), so this looks at the actual recipe name too.

const client = new Anthropic();

const ClassificationSchema = z.object({
  results: z.array(z.object({ id: z.number(), isDessert: z.boolean() })),
});

const CHUNK_SIZE = 120;

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function classifyChunk(rows: { id: number; name: string; category: string }[]) {
  const response = await client.messages.parse({
    model: "claude-sonnet-5",
    max_tokens: 8192,
    output_config: { effort: "low", format: zodOutputFormat(ClassificationSchema) },
    system:
      "For each recipe (id, name, category), decide if it is a dessert/sweet-treat (cakes, cookies, pies, " +
      "candy, ice cream, sweet breads, dessert sauces/glazes/curds/jams eaten as a sweet, etc.) versus a " +
      "savory dish or meal component (mains, soups, savory breads/rolls, savory sauces, sides, breakfast " +
      "mains, etc.). Classify every id given; when genuinely torn, prefer the category as the tiebreaker.",
    messages: [
      {
        role: "user",
        content: rows.map((r) => `${r.id}\t${r.name}\t(category: ${r.category || "none"})`).join("\n"),
      },
    ],
  });
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("No parsed output");
  return parsed.results;
}

async function main() {
  const rows = await db.select({ id: recipesTable.id, name: recipesTable.name, category: recipesTable.category }).from(recipesTable);
  console.log(`Classifying ${rows.length} recipes...`);

  let updated = 0;
  for (const batch of chunk(rows, CHUNK_SIZE)) {
    const results = await classifyChunk(batch);
    for (const r of results) {
      await db.update(recipesTable).set({ isDessert: r.isDessert }).where(eq(recipesTable.id, r.id));
      updated++;
    }
    console.log(`  ${updated}/${rows.length} classified`);
  }

  const [{ count: dessertCount }] = await db
    .select({ count: sql<number>`count(*)` })
    .from(recipesTable)
    .where(eq(recipesTable.isDessert, true));
  console.log(`Done. ${dessertCount} of ${rows.length} classified as dessert.`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
