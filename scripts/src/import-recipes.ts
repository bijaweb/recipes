import XLSX from "xlsx";
import { db, recipesTable, ingredientsTable, stepsTable, pool } from "@workspace/db";

// Imports every recipe-shaped tab from one or more xlsx workbooks into the
// shared recipes catalog. All three source workbooks (Basic Recipes, Pastry
// Recipes, Basque) use the same per-tab template:
//
//   Row 0        : recipe title (col A only)
//   Row 1..N     : optional "Recipe Yield[: ...]" line(s) (col A)
//   Header row   : "(Recipe )Amount" | "Unit" | "Product" | "Notes" | (blank) | "Procedure"
//   Legend row   : units legend / half-batch helper -- no Product, no Amount -- skipped
//   Data rows    : one ingredient (Amount/Unit/Product/Notes) and/or one
//                  procedure step (Procedure) per row, independently --
//                  a row can carry just an ingredient, just a step, both,
//                  or neither (blank separator).
//
// Tabs that don't match this template (form-response logs, "Sheet2",
// "Template", etc.) are skipped. Sub-recipe sections within one tab (e.g. a
// "Custard filling" divider row) are flattened into the same recipe, per
// the "import everything flat" decision -- no attempt to split them out.

interface ParsedRecipe {
  name: string;
  yieldText: string;
  ingredients: { amountText: string; unit: string; product: string; notes: string }[];
  steps: string[];
}

const CATEGORY_RULES: [RegExp, string][] = [
  [/\bcookie|biscotti|macaroon|tuile|snickerdoodle|shortbread\b/i, "Cookies"],
  [/\bcake|torte|genoise|sponge|financier\b/i, "Cakes"],
  [/\bpie|tart|galette\b/i, "Pies & Tarts"],
  [/\bdoughnut|donut|beignet|churro|fritter\b/i, "Doughnuts & Fried Dough"],
  [/\bice cream|gelato|sorbet|granita|parfait|bombe|frozen\b/i, "Frozen Desserts"],
  [/\bcandy|caramel|toffee|brittle|nougat|truffle|marshmallow|fudge|praline\b/i, "Candy & Confections"],
  [/\bcustard|pudding|creme|cremeux|panna cotta|bavaroi|mousse|flan\b/i, "Custards, Creams & Puddings"],
  [/\bsauce|glaze|coulis|curd|ganache|compote|jam|jelly|preserve|marmalade\b/i, "Sauces, Glazes & Preserves"],
  [/\bcroissant|danish|puff pastry|laminated|napoleon|palmier\b/i, "Laminated Dough"],
  [/\bsourdough|starter|baguette|ciabatta|focaccia|pizza dough|rye|pretzel|bagel|brioche|challah|milk bread\b/i, "Yeast Breads"],
  [/\bbread|roll|muffin|scone|biscuit\b/i, "Quick Breads & Rolls"],
  [/\bmeringue|dacquoise|japonaise\b/i, "Meringues"],
  [/\bbuttercream|icing|frosting|fondant|gumpaste|pastillage\b/i, "Icings & Buttercreams"],
  [/\bchocolate|cocoa\b/i, "Chocolate"],
  [/\bvegan|gluten free|dairy free|sugar free|lactose free\b/i, "Allergen-Free"],
  [/\bfoam|gel|sphere|caviar|air\b/i, "Modern Pastry"],
];

function guessCategory(name: string): string {
  for (const [pattern, category] of CATEGORY_RULES) {
    if (pattern.test(name)) return category;
  }
  return "Other";
}

function slugify(name: string, disambiguator: string): string {
  const base = name
    .toLowerCase()
    .replace(/'/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${base}-${disambiguator}`;
}

function cellStr(v: unknown): string {
  return v === undefined || v === null ? "" : String(v).trim();
}

function parseTab(rows: unknown[][]): ParsedRecipe | null {
  let headerIdx = -1;
  for (let i = 0; i < rows.length; i++) {
    const c0 = cellStr(rows[i]?.[0]).toLowerCase();
    const c1 = cellStr(rows[i]?.[1]).toLowerCase();
    if (c0.includes("amount") && c1 === "unit") {
      headerIdx = i;
      break;
    }
  }
  if (headerIdx === -1) return null;

  const name = cellStr(rows[0]?.[0]);
  if (!name) return null;
  // A handful of tabs use "Copy of X" from a Google Sheets duplicate.
  const cleanName = name.replace(/^Copy of\s+/i, "").trim();

  const yieldParts: string[] = [];
  for (let i = 1; i < headerIdx; i++) {
    const v = cellStr(rows[i]?.[0]);
    if (v) yieldParts.push(v);
  }
  const yieldText = yieldParts.join(" ").replace(/^Recipe Yield:?\s*/i, "").trim();

  const ingredients: ParsedRecipe["ingredients"] = [];
  const steps: string[] = [];

  for (let i = headerIdx + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const amount = cellStr(row[0]);
    const unit = cellStr(row[1]);
    const product = cellStr(row[2]);
    const notes = cellStr(row[3]);
    const procedure = cellStr(row[5]);

    if (!amount && !unit && !product && !notes && !procedure) continue; // blank row

    // A section-header row for an embedded sub-recipe (e.g. "Custard
    // filling") repeats its label in whichever of Amount/Product holds text
    // and again in Procedure, with everything else blank.
    const label = product || amount;
    const isSectionDivider =
      !unit && !notes && label && procedure && label.toLowerCase() === procedure.toLowerCase() && (!product || !amount);
    if (isSectionDivider) {
      steps.push(`— ${label} —`);
      continue;
    }

    if (product || amount) {
      ingredients.push({ amountText: amount, unit, product, notes });
    }
    if (procedure) {
      steps.push(procedure.replace(/^\d+[.)]\s*/, ""));
    }
  }

  if (ingredients.length === 0 && steps.length === 0) return null;

  return { name: cleanName, yieldText, ingredients, steps };
}

function parseAmount(amountText: string): number | null {
  const cleaned = amountText.trim();
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function normalizeUnit(unit: string): string | null {
  const u = unit.trim().toLowerCase();
  const map: Record<string, string> = {
    g: "g",
    gram: "g",
    grams: "g",
    kg: "kg",
    oz: "oz",
    lb: "lb",
    lbs: "lb",
    tsp: "tsp",
    tbsp: "tbsp",
    "fl.oz": "fl_oz",
    "fl oz": "fl_oz",
    qt: "qt",
    gal: "gal",
    ml: "ml",
    l: "l",
    each: "each",
    e: "each",
  };
  return map[u] ?? (u ? u : null);
}

interface ImportStats {
  tabsSeen: number;
  parsed: number;
  skippedNoTemplate: number;
  imported: number;
  duplicatesSkipped: number;
}

async function importWorkbook(path: string, sourceLabel: string, seenNames: Set<string>, stats: ImportStats) {
  const wb = XLSX.readFile(path);
  for (const sheetName of wb.SheetNames) {
    stats.tabsSeen++;
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" }) as unknown[][];
    const parsed = parseTab(rows);
    if (!parsed) {
      stats.skippedNoTemplate++;
      continue;
    }
    stats.parsed++;

    const dedupeKey = parsed.name.trim().toLowerCase();
    if (seenNames.has(dedupeKey)) {
      stats.duplicatesSkipped++;
      console.log(`  [dup skipped] ${parsed.name} (${sourceLabel} / ${sheetName})`);
      continue;
    }
    seenNames.add(dedupeKey);

    const slug = slugify(parsed.name, String(stats.imported + 1));
    const category = guessCategory(parsed.name);

    const [recipe] = await db
      .insert(recipesTable)
      .values({
        name: parsed.name,
        slug,
        category,
        yieldText: parsed.yieldText,
        sourceSheet: sourceLabel,
      })
      .returning();

    if (parsed.ingredients.length > 0) {
      await db.insert(ingredientsTable).values(
        parsed.ingredients.map((ing, idx) => ({
          recipeId: recipe.id,
          position: idx,
          amountText: ing.amountText,
          amountValue: parseAmount(ing.amountText),
          unit: normalizeUnit(ing.unit),
          product: ing.product,
          notes: ing.notes,
        })),
      );
    }

    if (parsed.steps.length > 0) {
      await db.insert(stepsTable).values(
        parsed.steps.map((instruction, idx) => ({
          recipeId: recipe.id,
          position: idx,
          instruction,
        })),
      );
    }

    stats.imported++;
    console.log(`  [imported] ${parsed.name} (${category}) -- ${parsed.ingredients.length} ingredients, ${parsed.steps.length} steps`);
  }
}

async function main() {
  const files = process.argv.slice(2).filter((a) => a !== "--");
  if (files.length === 0) {
    console.error("Usage: pnpm --filter @workspace/scripts run import-recipes -- <file1.xlsx> [file2.xlsx ...]");
    process.exit(1);
  }

  const seenNames = new Set<string>();
  const stats: ImportStats = { tabsSeen: 0, parsed: 0, skippedNoTemplate: 0, imported: 0, duplicatesSkipped: 0 };

  for (const file of files) {
    const label = file.split("/").pop()?.replace(/\.xlsx$/i, "") ?? file;
    console.log(`\n=== ${label} ===`);
    await importWorkbook(file, label, seenNames, stats);
  }

  console.log("\n--- Summary ---");
  console.log(stats);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
