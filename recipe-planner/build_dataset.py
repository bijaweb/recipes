import json, math, re
from collections import Counter, defaultdict
from classify import classify_item, protein_family, load_recipes

def main():
    recipes = load_recipes()

    # ---- classify every unique item once ----
    item_counts = Counter()
    for r in recipes:
        for ing in (r.get("ingredients") or []):
            it = (ing.get("item") or "").strip()
            if it:
                item_counts[it] += 1

    role_of = {}
    fam_of = {}
    hit_of = {}
    for item in item_counts:
        role, hit = classify_item(item)
        role_of[item] = role
        hit_of[item] = hit
        if role == "protein":
            fam_of[item] = protein_family(item)

    # ---- decompose every recipe ----
    tagged = []
    for r in recipes:
        buckets = defaultdict(list)
        families_present = set()
        for ing in (r.get("ingredients") or []):
            item = (ing.get("item") or "").strip()
            if not item:
                continue
            role = role_of.get(item, "unclassified")
            buckets[role].append(item)
            if role == "protein":
                families_present.add(fam_of.get(item, "other"))

        if len(families_present) == 0:
            primary_family = "vegetarian_no_protein_tag"
        elif len(families_present) == 1:
            primary_family = next(iter(families_present))
        else:
            primary_family = "mixed:" + "+".join(sorted(families_present))

        rating_value = r.get("rating_value")
        rating_count = r.get("rating_count") or 0
        quality_score = None
        if rating_value is not None and rating_count:
            quality_score = round(rating_value * math.log1p(rating_count), 3)

        cuisines = r.get("cuisine") or []
        cuisines_norm = sorted({c.strip().title() for c in cuisines if c and c.strip()})

        tagged.append({
            "slug": r.get("slug"),
            "name": r.get("name"),
            "cuisine": cuisines_norm,
            "primary_protein_family": primary_family,
            "protein_items": buckets.get("protein", []),
            "sauce_items": buckets.get("sauce", []),
            "veg_items": buckets.get("veg", []),
            "carb_items": buckets.get("carb", []),
            "dairy_items": buckets.get("dairy", []),
            "fruit_items": buckets.get("fruit", []),
            "seasoning_items": buckets.get("seasoning", []),
            "topping_items": buckets.get("topping", []),
            "pantry_items": buckets.get("pantry", []),
            "unclassified_items": buckets.get("unclassified", []),
            "rating_value": rating_value,
            "rating_count": rating_count,
            "quality_score": quality_score,
            "total_time_min": r.get("total_time_min"),
            "date_published": r.get("date_published"),
        })

    with open("recipes_tagged.jsonl", "w", encoding="utf-8") as f:
        for t in tagged:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")

    # ---- role map artifact (for reuse / manual review) ----
    role_map_out = {}
    for item, cnt in item_counts.items():
        role_map_out[item] = {
            "role": role_of[item],
            "protein_family": fam_of.get(item),
            "matched_on": hit_of[item],
            "row_count": cnt,
        }
    with open("ingredient_role_map.json", "w", encoding="utf-8") as f:
        json.dump(role_map_out, f, indent=2, ensure_ascii=False)

    # ---- pairing aggregation per protein family ----
    fam_stats = defaultdict(lambda: {
        "recipe_count": 0,
        "sauce": Counter(), "veg": Counter(), "carb": Counter(), "cuisine": Counter(),
        "sauce_w": Counter(), "veg_w": Counter(), "carb_w": Counter(), "cuisine_w": Counter(),
        "ratings": [],
    })

    SIMPLE_FAMILIES = {"chicken","turkey","duck","beef","pork","lamb","salmon","shrimp",
                       "tuna","white_fish","shellfish","plant_based","egg"}

    for t in tagged:
        fam = t["primary_protein_family"]
        if fam not in SIMPLE_FAMILIES:
            continue  # skip vegetarian_no_protein_tag / mixed / other for the pairing table
        s = fam_stats[fam]
        s["recipe_count"] += 1
        w = t["quality_score"] or 1.0
        if t["rating_value"]:
            s["ratings"].append(t["rating_value"])
        for it in t["sauce_items"]:
            s["sauce"][it] += 1
            s["sauce_w"][it] += w
        for it in t["veg_items"]:
            s["veg"][it] += 1
            s["veg_w"][it] += w
        for it in t["carb_items"]:
            s["carb"][it] += 1
            s["carb_w"][it] += w
        for c in t["cuisine"]:
            s["cuisine"][c] += 1
            s["cuisine_w"][c] += w

    def top_n(counter_w, counter_n, n=12):
        out = []
        for item, wsum in counter_w.most_common(n):
            out.append({"item": item, "recipe_count": counter_n[item], "weighted_score": round(wsum, 1)})
        return out

    pairings = {}
    for fam, s in fam_stats.items():
        avg_rating = round(sum(s["ratings"]) / len(s["ratings"]), 2) if s["ratings"] else None
        pairings[fam] = {
            "recipe_count": s["recipe_count"],
            "avg_rating": avg_rating,
            "top_sauces": top_n(s["sauce_w"], s["sauce"]),
            "top_veg": top_n(s["veg_w"], s["veg"]),
            "top_carbs": top_n(s["carb_w"], s["carb"]),
            "top_cuisines": top_n(s["cuisine_w"], s["cuisine"], n=8),
        }

    with open("protein_pairings.json", "w", encoding="utf-8") as f:
        json.dump(pairings, f, indent=2, ensure_ascii=False)

    # ---- console summary ----
    print("=== Recipes tagged:", len(tagged), "===")
    fam_counter = Counter(t["primary_protein_family"] for t in tagged)
    print("\nPrimary protein family distribution:")
    for fam, n in fam_counter.most_common(20):
        print(f"  {fam:35s} {n:5d}")

    print("\n=== Sample: chicken pairings ===")
    if "chicken" in pairings:
        p = pairings["chicken"]
        print(f"recipe_count={p['recipe_count']} avg_rating={p['avg_rating']}")
        print("Top sauces:", [x["item"] for x in p["top_sauces"][:8]])
        print("Top veg:", [x["item"] for x in p["top_veg"][:8]])
        print("Top carbs:", [x["item"] for x in p["top_carbs"][:8]])
        print("Top cuisines:", [x["item"] for x in p["top_cuisines"][:8]])

if __name__ == "__main__":
    main()
