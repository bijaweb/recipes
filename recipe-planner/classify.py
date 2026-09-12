import json, re
from collections import Counter, defaultdict

IN = "recipes.jsonl"

def load_recipes():
    recipes = []
    with open(IN, encoding="utf-8") as f:
        for line in f:
            recipes.append(json.loads(line))
    return recipes

def word_in(text, words):
    # plural-tolerant single-word match: "pepper"->"peppers", "tomato"->"tomatoes",
    # "radish"->"radishes", "cherry"->"cherries" (y -> ies)
    for w in words:
        if re.search(r'\b' + re.escape(w) + r'(e?s)?\b', text):
            return w
        if w.endswith('y') and re.search(r'\b' + re.escape(w[:-1]) + r'ies\b', text):
            return w
    return None

# ---- Step 0: overrides checked before anything else (exact substring, ordered) ----
# maps a substring -> role  (checked with plain "in", case-insensitive, longest/most specific first)
OVERRIDES = [
    ("rice flour", "pantry"), ("rice wine", "sauce"), ("rice paper", "carb"),
    ("cauliflower rice", "carb"),
    ("chicken broth", "pantry"), ("chicken stock", "pantry"), ("chicken bone broth", "pantry"),
    ("chicken demi-glace", "pantry"), ("beef broth", "pantry"), ("beef stock", "pantry"),
    ("vegetable broth", "pantry"), ("vegetable stock", "pantry"), ("bouillon", "pantry"),
    ("fish sauce", "sauce"), ("fish stock", "pantry"),
    ("coconut milk", "pantry"), ("coconut cream", "pantry"), ("coconut aminos", "sauce"),
    ("bread crumb", "carb"), ("panko", "carb"), ("breadcrumb", "carb"),
    ("peanut butter", "pantry"), ("almond butter", "pantry"), ("apple butter", "pantry"),
    ("tomato paste", "pantry"), ("tomato sauce", "sauce"), ("crushed tomato", "veg"),
    ("nutritional yeast", "seasoning"),
    ("corn starch", "pantry"), ("cornstarch", "pantry"), ("corn syrup", "pantry"),
    ("sesame seed", "topping"), ("sesame oil", "pantry"),
    ("egg noodle", "carb"), ("egg roll", "carb"), ("egg white", "protein"), ("egg yolk", "protein"),
    ("aluminum tray", "other"), ("parchment", "other"), ("skewer", "other"), ("twine", "other"),
    ("mexican crema", "dairy"), ("crème anglaise", "pantry"), ("creme anglaise", "pantry"),
    ("caramel", "pantry"), ("kimchi", "sauce"), ("tamarind", "sauce"), ("spread", "sauce"),
    ("horseradish", "sauce"), ("cornichon", "veg"), ("kombu", "pantry"), ("agave", "pantry"),
    ("beyond burger", "protein"), ("crabmeat", "protein"), ("soppressata", "protein"),
    ("sopressa", "protein"), ("chestnut", "topping"), ("tempura mix", "carb"),
    ("empanada wrapper", "carb"), ("pastry round", "carb"), ("millet", "carb"),
    ("ras el hanout", "seasoning"), ("ras al hanout", "seasoning"), ("gochugaru", "seasoning"),
    ("lemongrass", "seasoning"), ("marjoram", "seasoning"),
    ("barramundi", "protein"), ("pollock", "protein"), ("hake fillet", "protein"),
    ("persimmon", "fruit"), ("prune", "fruit"), ("grapefruit", "fruit"), ("tangelo", "fruit"),
    ("kumquat", "fruit"), ("rhubarb", "fruit"), ("yuzu juice", "fruit"), ("yuzu", "sauce"),
    ("romaine", "veg"), ("kohlrabi", "veg"), ("tomatillo", "veg"), ("gai lan", "veg"),
    ("yu choy", "veg"), ("broccolini", "veg"), ("frisée", "veg"), ("frisee", "veg"),
    ("tatsoi", "veg"), ("escarole", "veg"), ("watercress", "veg"), ("celeriac", "veg"),
    ("microgreen", "veg"), ("endive", "veg"), ("sunchoke", "veg"), ("mizuna", "veg"),
    ("hominy", "veg"),
    ("spice blend", "seasoning"), ("seasoning blend", "seasoning"), ("spice mix", "seasoning"),
    ("garlic powder", "seasoning"), ("onion powder", "seasoning"),
    ("red pepper flake", "seasoning"), ("crushed red pepper", "seasoning"),
    ("black pepper", "seasoning"), ("white pepper", "seasoning"), ("pepper corn", "seasoning"),
]

# Real prepared/cooking sauces -- things a recipe actively makes or reduces,
# not condiments squeezed from a bottle at the table. "vinegar" and "ranch"
# were dropped from here (see CONDIMENT_KW / PANTRY_KW) after user feedback
# that plain condiments and pantry acids were crowding out real sauces like
# chimichurri in the planner's suggestions.
SAUCE_KW = ["sauce","glaze","dressing","vinaigrette","aioli","marinade","pesto","chutney",
            "salsa","relish","sofrito","gremolata","tzatziki","hoisin","gravy",
            "teriyaki","chimichurri","tapenade",
            "compound butter","chile paste","chili paste","curry paste","harissa","tahini",
            "romesco","béchamel","bechamel","demi-glace","sambal","gochujang","miso",
            "guacamole","mirin","yuzu kosho","furikake","verjus",
            "XO sauce","fry sauce","cocktail sauce","remoulade","au jus"]

# Bottled/table condiments -- checked as an override before SAUCE_KW so e.g.
# "mayonnaise" never gets picked up by the generic "sauce" substring match.
CONDIMENT_KW = ["mayonnaise","mustard","ketchup","ranch","dijonnaise","tabasco","sriracha",
                "hot sauce","worcestershire","horseradish sauce","steak sauce","bbq sauce",
                "barbecue sauce"]

PROTEIN_KW = ["chicken","beef","steak","pork","shrimp","salmon","fish","turkey","tofu",
              "sausage","bacon","cod","tilapia","tuna","lamb","duck","scallop","clam",
              "mussel","crab","lobster","tempeh","seitan","egg","eggs","chorizo",
              "prosciutto","ham","veal","bison","venison","quail","halibut","mahi",
              "trout","snapper","swordfish","anchovy","sardine","meatball","patty",
              "pepperoni","salami","pancetta","catfish","haddock","branzino","calamari",
              "octopus","meatloaf"]

CARB_KW = ["rice","pasta","noodle","potato","quinoa","couscous","bread","tortilla","orzo",
           "farro","barley","polenta","bun","wrap","naan","gnocchi","crouton","cracker",
           "pita","biscuit","oat","cornmeal","grits","dumpling","cornbread","spaghetti",
           "penne","fettuccine","linguine","macaroni","ravioli","udon","ramen","vermicelli",
           "bulgur","farfalle","rigatoni","ciabatta","baguette","english muffin","hash brown",
           "challah","dough","crust","freekeh","roll","brioche","tortellini","fusilli",
           "cavatelli","lasagna","matzo","flatbread","breadstick","tostada"]

DAIRY_KW = ["cheese","cream","butter","yogurt","milk","crème fraîche","creme fraiche",
            "mascarpone","ricotta","mozzarella","parmesan","cheddar","feta","buttermilk",
            "ghee","queso","gouda","brie","provolone","gruyere","halloumi","paneer","fromage"]

FRUIT_KW = ["lemon","lime","orange","apple","berry","mango","avocado","banana","pineapple",
            "peach","pear","grape","melon","cherry","fig","date","raisin","coconut",
            "cranberry","blueberry","strawberry","raspberry","blackberry","apricot","plum",
            "clementine","tangerine","kiwi","pomegranate",
            "watermelon","cantaloupe","nectarine","currant"]

VEG_KW = ["garlic","onion","scallion","carrot","pepper","broccoli","spinach","zucchini",
          "cucumber","mushroom","kale","cabbage","cauliflower","asparagus","green bean",
          "pea","eggplant","squash","corn","radish","beet","leek","fennel","artichoke",
          "celery","arugula","lettuce","greens","shallot","tomato","potato green",
          "brussels sprout","chard","bok choy","okra","jicama","turnip","parsnip",
          "sweet potato","yam","chile pepper","jalape","poblano","serrano","habanero",
          "mirepoix","aromatic","edamame pod"]

SEASONING_KW = ["spice","cumin","paprika","chili powder","seasoning","basil","thyme",
                "rosemary","oregano","cilantro","dill","mint","tarragon","sage","chive",
                "parsley","bay leaf","cinnamon","nutmeg","clove","cardamom","turmeric",
                "curry powder","za'atar","zaatar","sumac","five spice","peppercorn",
                "red pepper flakes","garlic powder","onion powder","herbes de provence",
                "salt","saffron","ginger","fennel seed","mustard seed","coriander"]

NUT_KW = ["almond","walnut","pecan","cashew","peanut","pistachio","hazelnut","pine nut",
          "pumpkin seed","sunflower seed","chia seed","flax seed","pepita"]

PANTRY_KW = ["oil","sugar","honey","flour","stock","broth","wine","beer","baking powder",
             "baking soda","gelatin","cocoa","chocolate","vanilla","water","maple syrup",
             "molasses","yeast","cornstarch","stock concentrate","demi glace","bouillon",
             "capers","olive","pickle","chickpea","bean","lentil","legume","vinegar"]
             # note: beans/lentils/chickpeas placed in pantry as a pragmatic default;
             # reviewed & re-tagged to protein below via LEGUME override since they can
             # act as a protein component in a plated meal.

LEGUME_KW = ["chickpea","lentil","black bean","kidney bean","pinto bean","cannellini",
             "garbanzo","edamame","white bean","navy bean","fava bean"]

def classify_item(raw_item):
    text = raw_item.lower()

    for sub, role in OVERRIDES:
        if sub in text:
            return role, sub

    if any(k in text for k in LEGUME_KW):
        hit = next(k for k in LEGUME_KW if k in text)
        return "protein", hit  # legumes tagged as protein-alternative

    if any(k in text for k in CONDIMENT_KW):
        hit = next(k for k in CONDIMENT_KW if k in text)
        return "condiment", hit

    hit = word_in(text, SAUCE_KW) or next((k for k in SAUCE_KW if k in text and " " in k), None)
    if hit:
        return "sauce", hit

    hit = word_in(text, PROTEIN_KW)
    if hit:
        return "protein", hit

    hit = word_in(text, CARB_KW)
    if hit:
        return "carb", hit

    hit = word_in(text, DAIRY_KW) or next((k for k in DAIRY_KW if k in text and " " in k), None)
    if hit:
        return "dairy", hit

    hit = word_in(text, FRUIT_KW)
    if hit:
        return "fruit", hit

    hit = word_in(text, VEG_KW) or next((k for k in VEG_KW if k in text and " " in k), None)
    if hit:
        return "veg", hit

    hit = word_in(text, SEASONING_KW) or next((k for k in SEASONING_KW if k in text and " " in k), None)
    if hit:
        return "seasoning", hit

    hit = word_in(text, NUT_KW) or next((k for k in NUT_KW if k in text and " " in k), None)
    if hit:
        return "topping", hit

    hit = word_in(text, PANTRY_KW)
    if hit:
        return "pantry", hit

    return "unclassified", None


PROTEIN_FAMILY_RULES = [
    ("chicken", "chicken"), ("turkey", "turkey"), ("duck", "duck"), ("quail","duck"),
    ("beef", "beef"), ("steak", "beef"), ("bison","beef"), ("veal","beef"), ("meatloaf","beef"),
    ("pork", "pork"), ("bacon", "pork"), ("ham", "pork"), ("prosciutto","pork"),
    ("pancetta","pork"), ("chorizo","pork"), ("sausage", "pork"), ("pepperoni","pork"), ("salami","pork"),
    ("lamb", "lamb"), ("venison","lamb"),
    ("salmon", "salmon"),
    ("shrimp", "shrimp"),
    ("tuna", "tuna"),
    ("cod","white_fish"), ("tilapia","white_fish"), ("halibut","white_fish"),
    ("catfish","white_fish"), ("haddock","white_fish"), ("branzino","white_fish"),
    ("mahi","white_fish"), ("trout","white_fish"), ("snapper","white_fish"),
    ("swordfish","white_fish"), ("anchovy","white_fish"), ("sardine","white_fish"), ("fish","white_fish"),
    ("scallop", "shellfish"), ("clam", "shellfish"), ("mussel", "shellfish"),
    ("crab", "shellfish"), ("lobster", "shellfish"), ("calamari","shellfish"), ("octopus","shellfish"),
    ("tofu", "plant_based"), ("tempeh", "plant_based"), ("seitan", "plant_based"),
    ("chickpea","plant_based"), ("lentil","plant_based"), ("black bean","plant_based"),
    ("kidney bean","plant_based"), ("pinto bean","plant_based"), ("cannellini","plant_based"),
    ("garbanzo","plant_based"), ("edamame","plant_based"), ("white bean","plant_based"),
    ("navy bean","plant_based"), ("fava bean","plant_based"),
    ("egg", "egg"), ("meatball","beef"), ("patty","beef"),
]

def protein_family(raw_item):
    text = raw_item.lower()
    for kw, fam in PROTEIN_FAMILY_RULES:
        if kw in text:
            return fam
    return "other"


def main():
    recipes = load_recipes()

    # unique items + counts
    item_counts = Counter()
    for r in recipes:
        for ing in (r.get("ingredients") or []):
            it = (ing.get("item") or "").strip()
            if it:
                item_counts[it] += 1

    role_map = {}
    hit_map = {}
    for item in item_counts:
        role, hit = classify_item(item)
        role_map[item] = role
        hit_map[item] = hit

    role_totals = Counter()
    for item, cnt in item_counts.items():
        role_totals[role_map[item]] += cnt

    print("=== Role coverage (ingredient ROWS, 87341 total) ===")
    for role, cnt in role_totals.most_common():
        print(f"{role:15s} {cnt:6d}  ({100*cnt/sum(item_counts.values()):.1f}%)")

    unclassified = [item for item in item_counts if role_map[item] == "unclassified"]
    unclassified.sort(key=lambda i: -item_counts[i])
    print(f"\n=== Unclassified: {len(unclassified)} distinct items, {sum(item_counts[i] for i in unclassified)} rows ===")
    for item in unclassified[:60]:
        print(f"{item_counts[item]:5d}  {item}")

    with open("role_map_debug.json", "w") as f:
        json.dump({item: {"role": role_map[item], "matched_on": hit_map[item], "count": item_counts[item]}
                   for item in item_counts}, f, indent=2)

if __name__ == "__main__":
    main()
