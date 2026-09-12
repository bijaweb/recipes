import json, math, re, sys
from collections import Counter, defaultdict
from classify import classify_item

IN = "recipes_tagged.jsonl"
OUT_GLOBAL = "protein_pairings.json"
OUT_CUISINE = "protein_cuisine_pairings.json"

SIMPLE_FAMILIES = {
    "chicken", "turkey", "duck", "beef", "pork", "lamb", "salmon", "shrimp",
    "tuna", "white_fish", "shellfish", "plant_based", "egg",
}

MIN_COUNT_GLOBAL = 5   # families have hundreds of recipes
MIN_COUNT_CUISINE = 2  # cuisine slices are much smaller
MIN_CUISINE_SLICE_RECIPES = 5

ITEM_BUCKET_KEYS = [
    "protein_items", "sauce_items", "veg_items", "carb_items", "dairy_items",
    "fruit_items", "seasoning_items", "topping_items", "pantry_items", "unclassified_items",
]


def load_tagged():
    rows = []
    with open(IN, encoding="utf-8") as f:
        for line in f:
            rows.append(json.loads(line))
    return rows


# Strips package-size/container prefixes Blue Apron bakes into ingredient
# names -- "14-Oz Can Whole Peeled Yellow Tomatoes" and "14-Ounce Can Whole
# Peeled Yellow Tomatoes" are the same ingredient (whole peeled tomatoes),
# just two spellings of the same can size; a user picking a pairing chip
# wants "Whole Peeled Yellow Tomatoes", not a can-size label. Stripping
# this also merges what would otherwise be duplicate pairing entries.
PACKAGE_PREFIX_RE = re.compile(
    r"^\d[\d./]*\s*-?\s*(fl\.?\s*)?"
    r"(oz\.?|ounces?|lbs?\.?|pounds?|g\.?|grams?|kg\.?|ml\.?|l\.?|liters?)\s*"
    r"(can|jar|bag|box|package|pkg\.?|bottle|container|bunch|head|clove|cloves|pack)?\s*(of\s+)?",
    re.IGNORECASE,
)


def clean_pairing_name(name: str) -> str:
    cleaned = PACKAGE_PREFIX_RE.sub("", name).strip()
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned if cleaned else name


# Prep-instruction adjectives ("Grated Carrots", "Finely Chopped Celery")
# splinter what's really one ingredient into many differently-worded pairing
# entries, diluting each one's rank against generically-worded items. Strip
# them repeatedly so "Finely Diced Red Onion" reduces all the way down.
PREP_DESCRIPTOR_RE = re.compile(
    r"^(grated|shredded|sliced|chopped|diced|minced|julienned|cubed|halved|quartered|"
    r"trimmed|peeled|cored|seeded|deveined|crumbled|crushed|mashed|pureed|whole|fresh|"
    r"frozen|baby|large|medium|small|finely|coarsely|roughly|thinly|unpeeled)\s+",
    re.IGNORECASE,
)


def strip_prep_descriptors(name: str) -> str:
    prev = None
    while prev != name:
        prev = name
        name = PREP_DESCRIPTOR_RE.sub("", name).strip()
    return name if name else prev


# Bell peppers and carrots are named a dozen slightly different ways
# ("Red Pepper", "Sweet Peppers", "Bell Pepper" / "Carrots", "Baby Carrots")
# that all mean the same vegetable; merging them into one canonical label is
# the difference between them ever cracking a top-8 list or not.
BELL_PEPPER_RE = re.compile(r"^(red|green|yellow|orange|sweet|bell)\s*(bell\s*)?peppers?$", re.IGNORECASE)
CARROT_RE = re.compile(r"^(baby\s*)?carrots?$", re.IGNORECASE)


def canonicalize_veg(name: str) -> str:
    cleaned = strip_prep_descriptors(name)
    if BELL_PEPPER_RE.match(cleaned):
        return "Bell Pepper"
    if CARROT_RE.match(cleaned):
        return "Carrots"
    return cleaned


def reclassify(row):
    """Pool every item this recipe was ever bucketed under, then re-run the
    (now condiment/sauce/pantry-corrected) classifier over each one, and
    strip package-size prefixes. Returns new sauce/veg/carb/condiment
    lists; other buckets are left as originally tagged since nothing about
    their classification changed."""
    pool = []
    for key in ITEM_BUCKET_KEYS:
        pool.extend(row.get(key) or [])

    sauce, veg, carb, condiment = [], [], [], []
    for raw_item in pool:
        role, _hit = classify_item(raw_item)
        item = clean_pairing_name(raw_item)
        if role == "sauce":
            sauce.append(strip_prep_descriptors(item))
        elif role == "veg":
            veg.append(canonicalize_veg(item))
        elif role == "carb":
            carb.append(strip_prep_descriptors(item))
        elif role == "condiment":
            condiment.append(item)
    return sauce, veg, carb, condiment


def rank_by_lift(local_counter_n, local_counter_w, slice_total, global_freq, min_count, n=12):
    # Pure lift blows up for items seen only 3-4 times that happen to never
    # occur elsewhere (a demi-glace mentioned in one product SKU name, say)
    # -- distinctive, but on a sample too thin to actually recommend. Scale
    # lift by log(1+count) (same damping the original weighted_score used
    # for rating_count) so an item needs BOTH real distinctiveness AND a
    # reasonable number of recipes behind it to rank at the top.
    scored = []
    for item, count in local_counter_n.items():
        if count < min_count:
            continue
        local_freq = count / slice_total
        base = global_freq.get(item, local_freq)  # item never seen elsewhere -> no penalty
        lift = local_freq / base if base > 0 else 0
        score = lift * math.log1p(count)
        scored.append((item, count, local_counter_w[item], lift, score))
    scored.sort(key=lambda x: -x[4])
    return [
        {"item": item, "recipe_count": count, "weighted_score": round(w, 1), "lift": round(lift, 2)}
        for item, count, w, lift, _score in scored[:n]
    ]


def main():
    rows = load_tagged()

    # Reclassify every recipe's sauce/veg/carb/condiment buckets in place.
    simple_rows = []
    for r in rows:
        fam = r.get("primary_protein_family")
        if fam not in SIMPLE_FAMILIES:
            continue
        sauce, veg, carb, condiment = reclassify(r)
        r["sauce_items"] = sauce
        r["veg_items"] = veg
        r["carb_items"] = carb
        r["condiment_items"] = condiment
        simple_rows.append(r)

    print(f"{len(simple_rows)} recipes with a simple protein family (of {len(rows)} total)")

    # ---- global baseline frequencies (denominator for lift), pooled across
    # every simple-family recipe regardless of protein or cuisine ----
    global_total = len(simple_rows)
    global_counts = {"sauce": Counter(), "veg": Counter(), "carb": Counter()}
    for r in simple_rows:
        for role, key in (("sauce", "sauce_items"), ("veg", "veg_items"), ("carb", "carb_items")):
            for item in set(r.get(key) or []):  # set() -- count recipes containing it, not raw occurrences
                global_counts[role][item] += 1
    global_freq = {
        role: {item: count / global_total for item, count in counts.items()}
        for role, counts in global_counts.items()
    }

    # ---- per-protein-family global pairings (cuisineFilter = null) ----
    fam_stats = defaultdict(lambda: {
        "recipe_count": 0, "condiment_recipe_count": 0,
        "sauce": Counter(), "veg": Counter(), "carb": Counter(), "cuisine": Counter(),
        "sauce_w": Counter(), "veg_w": Counter(), "carb_w": Counter(), "cuisine_w": Counter(),
        "ratings": [],
    })
    for r in simple_rows:
        fam = r["primary_protein_family"]
        s = fam_stats[fam]
        s["recipe_count"] += 1
        if r.get("condiment_items"):
            s["condiment_recipe_count"] += 1
        w = r.get("quality_score") or 1.0
        if r.get("rating_value"):
            s["ratings"].append(r["rating_value"])
        for it in set(r.get("sauce_items") or []):
            s["sauce"][it] += 1
            s["sauce_w"][it] += w
        for it in set(r.get("veg_items") or []):
            s["veg"][it] += 1
            s["veg_w"][it] += w
        for it in set(r.get("carb_items") or []):
            s["carb"][it] += 1
            s["carb_w"][it] += w
        for c in r.get("cuisine") or []:
            s["cuisine"][c] += 1
            s["cuisine_w"][c] += w

    def top_n_freq(counter_w, counter_n, n=8):
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
            "top_sauces": rank_by_lift(s["sauce"], s["sauce_w"], s["recipe_count"], global_freq["sauce"], MIN_COUNT_GLOBAL),
            "top_veg": rank_by_lift(s["veg"], s["veg_w"], s["recipe_count"], global_freq["veg"], MIN_COUNT_GLOBAL),
            "top_carbs": rank_by_lift(s["carb"], s["carb_w"], s["recipe_count"], global_freq["carb"], MIN_COUNT_GLOBAL),
            "top_cuisines": top_n_freq(s["cuisine_w"], s["cuisine"], n=8),
        }

    with open(OUT_GLOBAL, "w", encoding="utf-8") as f:
        json.dump(pairings, f, indent=2, ensure_ascii=False)

    print("\n=== Global (lift-ranked) sample: beef ===")
    if "beef" in pairings:
        print("Top sauces:", [x["item"] for x in pairings["beef"]["top_sauces"][:8]])

    # ---- per protein+cuisine pairings, same lift baseline ----
    cstats = defaultdict(lambda: {
        "recipe_count": 0,
        "sauce": Counter(), "veg": Counter(), "carb": Counter(),
        "sauce_w": Counter(), "veg_w": Counter(), "carb_w": Counter(),
        "ratings": [],
    })
    for r in simple_rows:
        fam = r["primary_protein_family"]
        cuisines = r.get("cuisine") or []
        if not cuisines:
            continue
        w = r.get("quality_score") or 1.0
        rating = r.get("rating_value")
        for cuisine in cuisines:
            s = cstats[(fam, cuisine)]
            s["recipe_count"] += 1
            if rating:
                s["ratings"].append(rating)
            for it in set(r.get("sauce_items") or []):
                s["sauce"][it] += 1
                s["sauce_w"][it] += w
            for it in set(r.get("veg_items") or []):
                s["veg"][it] += 1
                s["veg_w"][it] += w
            for it in set(r.get("carb_items") or []):
                s["carb"][it] += 1
                s["carb_w"][it] += w

    cuisine_pairings = {}
    kept, dropped = 0, 0
    for (fam, cuisine), s in cstats.items():
        if s["recipe_count"] < MIN_CUISINE_SLICE_RECIPES:
            dropped += 1
            continue
        kept += 1
        avg_rating = round(sum(s["ratings"]) / len(s["ratings"]), 2) if s["ratings"] else None
        cuisine_pairings[f"{fam}|{cuisine}"] = {
            "family_key": fam,
            "cuisine": cuisine,
            "recipe_count": s["recipe_count"],
            "avg_rating": avg_rating,
            "top_sauces": rank_by_lift(s["sauce"], s["sauce_w"], s["recipe_count"], global_freq["sauce"], MIN_COUNT_CUISINE, n=8),
            "top_veg": rank_by_lift(s["veg"], s["veg_w"], s["recipe_count"], global_freq["veg"], MIN_COUNT_CUISINE, n=8),
            "top_carbs": rank_by_lift(s["carb"], s["carb_w"], s["recipe_count"], global_freq["carb"], MIN_COUNT_CUISINE, n=8),
        }

    with open(OUT_CUISINE, "w", encoding="utf-8") as f:
        json.dump(cuisine_pairings, f, indent=2, ensure_ascii=False)

    print(f"\nKept {kept} protein+cuisine combos (>= {MIN_CUISINE_SLICE_RECIPES} recipes), dropped {dropped} as too thin")
    print("\n=== Cuisine-filtered (lift-ranked) sample: beef|Mexican ===")
    key = "beef|Mexican"
    if key in cuisine_pairings:
        print("Top sauces:", [x["item"] for x in cuisine_pairings[key]["top_sauces"]])
        print("Top veg:", [x["item"] for x in cuisine_pairings[key]["top_veg"]])
        print("Top carbs:", [x["item"] for x in cuisine_pairings[key]["top_carbs"]])


if __name__ == "__main__":
    main()
