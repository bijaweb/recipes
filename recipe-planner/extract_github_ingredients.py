import json, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from classify import classify_item, protein_family

RAW_DIR = "/root/scratch/recipes-github/index"
OUT = "github_recipes_for_import.jsonl"

SIMPLE_FAMILIES = {
    "chicken", "turkey", "duck", "beef", "pork", "lamb", "salmon", "shrimp",
    "tuna", "white_fish", "shellfish", "plant_based", "egg",
}

import re
TRADEMARK_RE = re.compile(r"[®™©]")


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
            # NOTE: "directions" is intentionally never read from `data` here.
            yield title, ingredients, url


def main():
    kept = 0
    skipped = 0
    with open(OUT, "w", encoding="utf-8") as out:
        for title, ingredients, url in load_raw_recipes():
            clean_ingredients = []
            families_present = set()
            has_meal_component = False
            for raw in ingredients:
                if not isinstance(raw, str) or not raw.strip():
                    continue
                if raw.strip().endswith(":"):
                    continue
                item = TRADEMARK_RE.sub("", raw).strip()
                role, _hit = classify_item(item)
                if role == "protein":
                    families_present.add(protein_family(item))
                if role in ("sauce", "veg", "carb"):
                    has_meal_component = True
                clean_ingredients.append(item)

            if len(families_present) != 1:
                skipped += 1
                continue
            primary_family = next(iter(families_present))
            if primary_family not in SIMPLE_FAMILIES or not has_meal_component:
                skipped += 1
                continue

            out.write(json.dumps({
                "title": title,
                "url": url,
                "primary_protein_family": primary_family,
                "raw_ingredients": clean_ingredients,
            }, ensure_ascii=False) + "\n")
            kept += 1

    print(f"kept {kept}, skipped {skipped}")


if __name__ == "__main__":
    main()
