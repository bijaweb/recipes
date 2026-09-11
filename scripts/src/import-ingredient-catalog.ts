import { readFileSync } from "fs";
import { parse } from "csv-parse/sync";
import { db, ingredientCatalogTable, pool } from "@workspace/db";

// Imports the Mealie-derived ingredient catalog CSV (name, plural_name,
// role, category, aliases -- aliases pipe-joined) into the shared
// recipes_ingredient_catalog table. `role` isn't stored -- it isn't part of
// the canonical upstream dataset (see the CSV's own provenance) and this
// app's Ingredients page has no use for it yet. Safe to re-run: existing
// names are updated in place rather than duplicated.

interface Row {
  name: string;
  plural_name: string;
  role: string;
  category: string;
  aliases: string;
}

async function main() {
  const file = process.argv.slice(2).find((a) => a !== "--");
  if (!file) {
    console.error("Usage: pnpm --filter @workspace/scripts run import-ingredient-catalog -- <ingredients.csv>");
    process.exit(1);
  }

  const rows = parse(readFileSync(file, "utf-8"), {
    columns: true,
    skip_empty_lines: true,
  }) as Row[];

  console.log(`Read ${rows.length} rows from ${file}`);

  let written = 0;
  let skipped = 0;

  for (const row of rows) {
    const name = row.name?.trim();
    if (!name) {
      skipped++;
      continue;
    }

    const pluralName = row.plural_name?.trim() || name;
    const category = row.category?.trim() || "";
    const aliases = row.aliases?.trim()
      ? row.aliases.split("|").map((a) => a.trim()).filter(Boolean)
      : [];

    await db
      .insert(ingredientCatalogTable)
      .values({ name, pluralName, category, aliases })
      .onConflictDoUpdate({
        target: ingredientCatalogTable.name,
        set: { pluralName, category, aliases },
      });

    written++;
  }

  console.log("\n--- Summary ---");
  console.log({ totalRows: rows.length, written, skipped });
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
