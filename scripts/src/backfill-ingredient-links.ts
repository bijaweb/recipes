import { sql } from "drizzle-orm";
import { db, ingredientsTable, pool } from "@workspace/db";

// One-off backfill: link existing recipes_ingredients rows (free-text
// `product`) to the ingredient catalog where there's a confident exact
// match (case-insensitive, against name/plural_name/aliases). This is the
// same matching planner.ts uses for newly-built recipes; running it once
// here is what lets the shopping list work for recipes that already
// existed before the catalog did. Conservative on purpose -- no fuzzy
// matching, so most heavily-modified ingredient lines (with prep
// descriptors, typos, etc.) will simply stay unmatched rather than risk a
// wrong link.

async function main() {
  await db.execute(sql`
    UPDATE recipes_ingredients ri
    SET ingredient_catalog_id = ic.id
    FROM recipes_ingredient_catalog ic
    WHERE ri.ingredient_catalog_id IS NULL
      AND ri.product <> ''
      AND (
        lower(trim(ri.product)) = lower(ic.name)
        OR lower(trim(ri.product)) = lower(ic.plural_name)
        OR ic.aliases::jsonb ? lower(trim(ri.product))
      )
  `);

  const [{ total }] = (
    await db.select({ total: sql<number>`count(*)` }).from(ingredientsTable).where(sql`product <> ''`)
  ) as { total: number }[];
  const [{ linked }] = (
    await db
      .select({ linked: sql<number>`count(*)` })
      .from(ingredientsTable)
      .where(sql`product <> '' AND ingredient_catalog_id IS NOT NULL`)
  ) as { linked: number }[];

  console.log(`Backfill complete. ${total} ingredient lines total, ${linked} now linked to the catalog.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
