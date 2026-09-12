import json, math, os, re, sys
from collections import defaultdict
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify_item, protein_family

RAW_DIR = "/root/scratch/recipes-github/index"
OUT = "recipes_tagged_github.jsonl"

SIMPLE_FAMILIES = {
    "chicken", "turkey", "duck", "beef", "pork", "lamb", "salmon", "shrimp",
    "tuna", "white_fish", "shellfish", "plant_based", "egg",
}

# Cuisine tags are literal, conservative title matches only -- this raw
# corpus has no structured cuisine field (unlike the Blue Apron data), so
# guessing from ingredients would be too noisy. A word actually present in
# the recipe's own title is a safe, low-risk signal.
CUISINE_WORDS = [
    "French", "Italian", "Mexican", "Chinese", "Japanese", "Thai", "Indian",
    "Greek", "Spanish", "Vietnamese", "Korean", "Mediterranean", "Moroccan",
    "German", "Cajun", "Caribbean", "Cuban", "Lebanese", "Turkish", "Filipino",
]
CUISINE_RE = [(w, re.compile(r"\b" + re.escape(w) + r"\b", re.IGNORECASE)) for w in CUISINE_WORDS]

TRADEMARK_RE = re.compile(r"[®™©]")
PAREN_RE = re.compile(r"\([^)]*\)")
LEADING_QTY_RE = re.compile(
    r"^\s*\d[\d./\s]*\s*"                                    # leading number / fraction
    r"(-\s*)?"
    r"(fl\.?\s*)?"
    r"(cups?|tsp\.?|tbs\.?|teaspoons?|tbsp\.?|tablespoons?|oz\.?|ounces?|lbs?\.?|pounds?|"
    r"g\.?|grams?|kg\.?|ml\.?|l\.?|liters?|inch(es)?|cloves?|cans?|jars?|bags?|"
    r"boxes?|packages?|packets?|pkgs?\.?|bottles?|containers?|bunche?s?|heads?|packs?|slices?|"
    r"pieces?|stalks?|sprigs?|large|medium|small)?\b\s*"        # \b so "pack" can't eat into "packet"
    r"(of\s+)?",
    re.IGNORECASE,
)


def normalize_ingredient(raw: str) -> str:
    s = raw.strip()
    s = PAREN_RE.sub("", s)
    s = TRADEMARK_RE.sub("", s)
    s = s.split(",")[0]
    s = LEADING_QTY_RE.sub("", s)
    s = re.sub(r"^[.,;:\-]+\s*", "", s)  # leftover punctuation from a stripped abbreviation, e.g. "Tbs."
    s = re.sub(r"\s+", " ", s).strip(" -")
    if not s:
        return raw.strip()
    # Title-cased to match the existing corpus's item-label convention (e.g.
    # "Beef Demi-Glace") -- this raw dataset is all lowercase natural-language
    # text, and leaving it that way would split identical items into separate,
    # differently-cased pairing entries instead of merging their counts.
    return s.title()


def load_raw_recipes():
    seen_urls = set()
    for root, _dirs, files in os.walk(RAW_DIR):
        for fname in files:
            if not fname.endswith(".json"):
                continue
            path = os.path.join(root, fname)
            try:
                with open(path, encoding="utf-8") as f:
                    data = json.load(f)
            except (json.JSONDecodeError, UnicodeDecodeError):
                continue
            title = (data.get("title") or "").strip()
            ingredients = data.get("ingredients") or []
            if not title or not ingredients:
                continue
            url = data.get("url") or path
            if url in seen_urls:
                continue
            seen_urls.add(url)
            yield title, ingredients


def main():
    tagged = []
    fam_counter = defaultdict(int)
    role_counter = defaultdict(int)
    skipped = 0

    for title, ingredients in load_raw_recipes():
        buckets = defaultdict(list)
        families_present = set()
        for raw in ingredients:
            if not isinstance(raw, str) or not raw.strip():
                continue
            if raw.strip().endswith(":"):
                continue  # a section header ("Glaze:", "For the Crust:"), not an ingredient
            item = normalize_ingredient(raw)
            if not item:
                continue
            role, _hit = classify_item(item)
            role_counter[role] += 1
            buckets[role].append(item)
            if role == "protein":
                families_present.add(protein_family(item))

        if len(families_present) == 0:
            primary_family = "vegetarian_no_protein_tag"
        elif len(families_present) == 1:
            primary_family = next(iter(families_present))
        else:
            primary_family = "mixed:" + "+".join(sorted(families_present))

        has_meal_component = bool(buckets.get("sauce") or buckets.get("veg") or buckets.get("carb"))
        if primary_family not in SIMPLE_FAMILIES or not has_meal_component:
            # Desserts/baked goods/drinks routinely pick up a stray "egg" or
            # "pork" (bacon) protein tag despite being nothing like a plated
            # dinner. A recipe with zero sauce/veg/carb items contributes
            # nothing to those pairing tables anyway, and worse, still
            # inflates its family's recipe-count denominator, which quietly
            # suppresses the lift score of every real dish in that family.
            skipped += 1
            continue
        fam_counter[primary_family] += 1

        cuisines = sorted({w for w, pattern in CUISINE_RE if pattern.search(title)})

        tagged.append({
            "slug": None,
            "name": title,
            "cuisine": cuisines,
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
            "rating_value": None,
            "rating_count": 0,
            "quality_score": None,
            "total_time_min": None,
            "date_published": None,
        })

    with open(OUT, "w", encoding="utf-8") as f:
        for t in tagged:
            f.write(json.dumps(t, ensure_ascii=False) + "\n")

    print(f"=== Loaded recipes with usable protein family: {len(tagged)} (skipped {skipped} vegetarian/mixed/other) ===")
    print("\nPrimary protein family distribution (kept):")
    for fam in sorted(SIMPLE_FAMILIES, key=lambda k: -fam_counter[k]):
        print(f"  {fam:15s} {fam_counter[fam]:6d}")
    print("\nRole coverage across all ingredient rows:")
    total_rows = sum(role_counter.values())
    for role, cnt in sorted(role_counter.items(), key=lambda kv: -kv[1]):
        print(f"  {role:15s} {cnt:7d}  ({100*cnt/total_rows:.1f}%)")
    with_cuisine = sum(1 for t in tagged if t["cuisine"])
    print(f"\nRecipes with a literal cuisine-word title match: {with_cuisine}")


if __name__ == "__main__":
    main()
