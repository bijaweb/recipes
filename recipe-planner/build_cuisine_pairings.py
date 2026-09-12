import json, math
from collections import Counter, defaultdict

IN = "recipes_tagged.jsonl"
OUT = "protein_cuisine_pairings.json"
MIN_RECIPES = 5  # below this, a protein+cuisine slice is too thin to trust

SIMPLE_FAMILIES = {
    "chicken", "turkey", "duck", "beef", "pork", "lamb", "salmon", "shrimp",
    "tuna", "white_fish", "shellfish", "plant_based", "egg",
}


def load_tagged():
    rows = []
    with open(IN, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


def top_n(counter_w, counter_n, n=8):
    out = []
    for item, wsum in counter_w.most_common(n):
        out.append({"item": item, "recipe_count": counter_n[item], "weighted_score": round(wsum, 1)})
    return out


def main():
    rows = load_tagged()

    stats = defaultdict(lambda: {
        "recipe_count": 0,
        "sauce": Counter(), "veg": Counter(), "carb": Counter(),
        "sauce_w": Counter(), "veg_w": Counter(), "carb_w": Counter(),
        "ratings": [],
    })

    for r in rows:
        fam = r.get("primary_protein_family")
        if fam not in SIMPLE_FAMILIES:
            continue
        cuisines = r.get("cuisine") or []
        if not cuisines:
            continue

        w = r.get("quality_score") or 1.0
        rating = r.get("rating_value")

        for cuisine in cuisines:
            key = (fam, cuisine)
            s = stats[key]
            s["recipe_count"] += 1
            if rating:
                s["ratings"].append(rating)
            for it in r.get("sauce_items", []):
                s["sauce"][it] += 1
                s["sauce_w"][it] += w
            for it in r.get("veg_items", []):
                s["veg"][it] += 1
                s["veg_w"][it] += w
            for it in r.get("carb_items", []):
                s["carb"][it] += 1
                s["carb_w"][it] += w

    pairings = {}
    kept = 0
    dropped = 0
    for (fam, cuisine), s in stats.items():
        if s["recipe_count"] < MIN_RECIPES:
            dropped += 1
            continue
        kept += 1
        avg_rating = round(sum(s["ratings"]) / len(s["ratings"]), 2) if s["ratings"] else None
        pairings[f"{fam}|{cuisine}"] = {
            "family_key": fam,
            "cuisine": cuisine,
            "recipe_count": s["recipe_count"],
            "avg_rating": avg_rating,
            "top_sauces": top_n(s["sauce_w"], s["sauce"]),
            "top_veg": top_n(s["veg_w"], s["veg"]),
            "top_carbs": top_n(s["carb_w"], s["carb"]),
        }

    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(pairings, f, indent=2, ensure_ascii=False)

    print(f"kept {kept} protein+cuisine combos (>= {MIN_RECIPES} recipes), dropped {dropped} as too thin")
    by_fam = defaultdict(list)
    for key in pairings:
        fam, cuisine = key.split("|", 1)
        by_fam[fam].append((cuisine, pairings[key]["recipe_count"]))
    for fam in sorted(by_fam):
        combos = sorted(by_fam[fam], key=lambda x: -x[1])
        print(f"  {fam:12s} " + ", ".join(f"{c}({n})" for c, n in combos))


if __name__ == "__main__":
    main()
