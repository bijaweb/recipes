import { readFileSync } from "fs";
import { db, plannerProteinsTable, plannerPairingsTable, pool } from "@workspace/db";

// Seeds the planner's reference data from the Blue Apron corpus analysis:
// recipe-planner/protein_pairings.json (global, per-protein-family top
// sauces/veg/carbs/cuisines) and protein_cuisine_pairings.json (the same,
// but recomputed within just one protein+cuisine slice, so picking a
// "flair" actually changes the suggestions rather than just labeling them).
// Full-refresh: wipes and reinserts both tables each run, since nothing
// else references these rows by id.

interface PairingItem {
  item: string;
  recipe_count: number;
  weighted_score: number;
}

interface GlobalFamilyStats {
  recipe_count: number;
  avg_rating: number | null;
  top_sauces: PairingItem[];
  top_veg: PairingItem[];
  top_carbs: PairingItem[];
  top_cuisines: PairingItem[];
}

interface CuisineSliceStats {
  family_key: string;
  cuisine: string;
  recipe_count: number;
  avg_rating: number | null;
  top_sauces: PairingItem[];
  top_veg: PairingItem[];
  top_carbs: PairingItem[];
}

const PROTEIN_META: Record<string, { label: string; icon: string }> = {
  chicken: { label: "Chicken", icon: "🍗" },
  beef: { label: "Beef", icon: "🥩" },
  pork: { label: "Pork", icon: "🥓" },
  egg: { label: "Egg", icon: "🥚" },
  white_fish: { label: "White Fish", icon: "🐟" },
  plant_based: { label: "Plant-Based", icon: "🌱" },
  shrimp: { label: "Shrimp", icon: "🍤" },
  salmon: { label: "Salmon", icon: "🍣" },
  turkey: { label: "Turkey", icon: "🦃" },
  shellfish: { label: "Shellfish", icon: "🦀" },
  duck: { label: "Duck", icon: "🦆" },
  lamb: { label: "Lamb", icon: "🐑" },
  tuna: { label: "Tuna", icon: "🐠" },
};

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const globalPath = args[0] ?? "./protein_pairings.json";
  const cuisinePath = args[1] ?? "./protein_cuisine_pairings.json";

  const globalData = JSON.parse(readFileSync(globalPath, "utf-8")) as Record<string, GlobalFamilyStats>;
  const cuisineData = JSON.parse(readFileSync(cuisinePath, "utf-8")) as Record<string, CuisineSliceStats>;

  await db.delete(plannerPairingsTable);
  await db.delete(plannerProteinsTable);

  const families = Object.entries(globalData).sort((a, b) => b[1].recipe_count - a[1].recipe_count);

  for (const [familyKey, stats] of families) {
    const meta = PROTEIN_META[familyKey];
    if (!meta) {
      console.warn(`No label/icon configured for protein family "${familyKey}", skipping`);
      continue;
    }

    await db.insert(plannerProteinsTable).values({
      familyKey,
      label: meta.label,
      icon: meta.icon,
      recipeCount: stats.recipe_count,
      avgRating: stats.avg_rating,
      sortOrder: families.findIndex(([k]) => k === familyKey),
    });

    const rows: (typeof plannerPairingsTable.$inferInsert)[] = [];
    const addRole = (role: string, items: PairingItem[]) => {
      items.forEach((it, i) => {
        rows.push({
          familyKey,
          cuisineFilter: null,
          role,
          itemName: it.item,
          recipeCount: it.recipe_count,
          weightedScore: it.weighted_score,
          sortOrder: i,
        });
      });
    };
    addRole("sauce", stats.top_sauces);
    addRole("veg", stats.top_veg);
    addRole("carb", stats.top_carbs);
    addRole("cuisine", stats.top_cuisines);

    if (rows.length > 0) {
      await db.insert(plannerPairingsTable).values(rows);
    }
  }

  let cuisineRowCount = 0;
  for (const slice of Object.values(cuisineData)) {
    const rows: (typeof plannerPairingsTable.$inferInsert)[] = [];
    const addRole = (role: string, items: PairingItem[]) => {
      items.forEach((it, i) => {
        rows.push({
          familyKey: slice.family_key,
          cuisineFilter: slice.cuisine,
          role,
          itemName: it.item,
          recipeCount: it.recipe_count,
          weightedScore: it.weighted_score,
          sortOrder: i,
        });
      });
    };
    addRole("sauce", slice.top_sauces);
    addRole("veg", slice.top_veg);
    addRole("carb", slice.top_carbs);

    if (rows.length > 0) {
      await db.insert(plannerPairingsTable).values(rows);
      cuisineRowCount += rows.length;
    }
  }

  console.log(`Seeded ${families.length} proteins, ${Object.keys(cuisineData).length} protein+cuisine slices (${cuisineRowCount} pairing rows)`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
