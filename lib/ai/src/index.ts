import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";

const MODEL = "claude-opus-5";
// Recipe generation is latency-sensitive (the user waits on it live) and
// Sonnet-tier models generally run at meaningfully higher raw output
// throughput than Opus-tier -- tried by explicit user request after
// Fast Mode turned out to be unavailable on this account (0 rate limit).
const PLANNER_MODEL = "claude-sonnet-5";

const IngredientDraftSchema = z.object({
  amountText: z.string().describe("The amount exactly as written, e.g. '2 1/2 cups' or 'to taste'."),
  amountValue: z
    .number()
    .optional()
    .describe("A single scalable numeric amount (convert fractions like 1/2 to 0.5), omitted for vague amounts like 'to taste'."),
  unit: z
    .enum(["g", "kg", "oz", "lb", "ml", "l", "tsp", "tbsp", "cup", "fl_oz", "qt", "gal", "each"])
    .optional()
    .describe("Normalized unit, only when amountValue is set and the amount uses one of these units."),
  product: z.string().describe("The ingredient itself, e.g. 'all-purpose flour'."),
  notes: z.string().describe("Prep notes such as 'sifted' or 'room temperature'; empty string if none."),
});

const RecipeDraftSchema = z.object({
  name: z.string().describe("The recipe's title."),
  category: z.string().describe("A short category such as 'Dessert', 'Bread', or 'Sauce'; empty string if unclear."),
  yieldText: z.string().describe("Yield or servings as written, e.g. '4 servings' or '1 dozen'; empty string if not stated."),
  yieldServings: z.number().optional().describe("A numeric serving count, only if one can be parsed from yieldText."),
  ingredients: z.array(IngredientDraftSchema),
  steps: z.array(z.string()).describe("Each cooking step as its own string, in order."),
});

export type RecipeDraft = z.infer<typeof RecipeDraftSchema>;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const workspaceId = process.env.ANTHROPIC_WORKSPACE_ID;
    client = new Anthropic(workspaceId ? { defaultHeaders: { "anthropic-workspace-id": workspaceId } } : {});
  }
  return client;
}

// Extracts structured recipe data from pasted, often messily-formatted
// recipe text (copied from a note, a cookbook, an email, etc.) so the user
// doesn't have to fill in every ingredient row and step by hand.
export async function parseRecipeText(text: string): Promise<RecipeDraft> {
  const response = await getClient().messages.parse({
    model: MODEL,
    max_tokens: 4096,
    output_config: { effort: "medium", format: zodOutputFormat(RecipeDraftSchema) },
    system:
      "You extract structured recipe data from pasted recipe text. Only use information present in the text -- " +
      "never invent ingredients, amounts, or steps that aren't there. Preserve the original wording of steps and " +
      "ingredient names; only normalize the amount/unit fields.",
    messages: [{ role: "user", content: `Extract this recipe:\n\n${text}` }],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Claude did not return a parseable recipe.");
  }
  return parsed;
}

// Generates a brand-new, complete recipe centered on a protein/sauce/
// vegetable/carb combo the planner suggested -- with real ingredient
// quantities scaled to servings, and numbered steps that name the actual
// technique and timing for each component. Never reuses another source's
// recipe text; this is written from scratch by the model, which is also
// why it's the planner's answer to "just a title, not a full recipe."
export async function generatePlannerRecipe(input: {
  proteinLabel: string;
  sauce: string;
  veg: string;
  carb: string;
  cuisine?: string;
  servings?: number;
}): Promise<RecipeDraft> {
  const servings = input.servings ?? 4;
  const cuisineNote = input.cuisine ? ` with a ${input.cuisine} flair` : "";

  // The instruction text below never varies between calls -- only the
  // user message does -- so it's cached (Claude Opus 5's minimum cacheable
  // prefix is 512 tokens; this block clears that comfortably). After the
  // first call, repeat builds within the cache's 5-minute window skip
  // reprocessing this whole block, cutting time-to-first-token and cost on
  // the ~90% of input tokens it accounts for.
  const SYSTEM_PROMPT =
    "You are a home-cooking recipe developer. Write one complete, realistic recipe built around the given " +
    "protein, sauce, vegetable, and carb components. Include real, specific ingredient quantities scaled to " +
    "the requested serving count (round to sensible kitchen amounts), and detailed numbered steps that name " +
    "the actual cooking technique and timing for each component -- how the protein is seared/roasted/braised " +
    "and for how long and at what heat, how the sauce is made, how the vegetable is cooked, how the carb is " +
    "prepared -- not just a restatement of the four component names. You may add reasonable supporting " +
    "ingredients (oil, aromatics, salt, pepper, acid, herbs) that a real recipe for this dish would need, but " +
    "the given protein/sauce/veg/carb must remain the centerpiece of their respective role. Write this recipe " +
    "from scratch -- never reproduce another company's or publication's exact recipe text.\n\n" +
    "Unit selection is an absolute rule, not a preference: 'ml' and 'l' may ONLY be used for something " +
    "that is actually poured as a liquid in real quantity -- stock, milk, wine, water, oil, vinegar, " +
    "cream, juice. Every solid, powdered, or granular ingredient gets a weight or count unit instead, " +
    "with NO exceptions for small quantities: kosher salt, table salt, brown sugar, granulated sugar, " +
    "cornstarch, flour, baking soda, baking powder, and spices are never 'ml' or 'l', full stop -- prefer " +
    "'g' for these (e.g. '3 g kosher salt', '15 g brown sugar', '6 g cornstarch'), or 'tsp'/'tbsp' only " +
    "when a measuring spoon is genuinely the more natural real-world measure (a pinch of cinnamon, a " +
    "capful of extract). Butter and other solid fats get 'tbsp', 'g', or 'oz' -- never 'ml'. Ingredients " +
    "normally weighed (meat, cheese, produce) get 'g', 'kg', 'oz', or 'lb'; discrete items get 'each' " +
    "(eggs, garlic cloves, chiles). Before writing any ingredient's unit, ask: 'would this ever actually " +
    "be poured from a liquid measuring cup?' -- if the honest answer is no, the unit cannot be 'ml' or 'l', " +
    "regardless of how small the amount is.";

  const response = await getClient().messages.parse({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    output_config: { effort: "medium", format: zodOutputFormat(RecipeDraftSchema) },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content:
          `Build a recipe for ${servings} servings${cuisineNote}, centered on:\n` +
          `- Protein: ${input.proteinLabel}\n` +
          `- Sauce: ${input.sauce}\n` +
          `- Vegetable: ${input.veg}\n` +
          `- Carb: ${input.carb}`,
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Claude did not return a parseable recipe.");
  }
  return parsed;
}

// Turns a bare title + raw ingredient list (no directions -- those are never
// passed in, and the source's is never seen or stored) into a complete,
// original recipe: normalized ingredient amounts/units, and brand-new
// step-by-step directions written from scratch based on general cooking
// knowledge for this type of dish. Used to bulk-import third-party
// ingredient-list datasets as real recipes without reproducing any
// scraped instructional text -- the model has no source wording to copy
// even if it wanted to.
const UNIT_RULES =
  "Unit selection is an absolute rule, not a preference: 'ml' and 'l' may ONLY be used for something " +
  "that is actually poured as a liquid in real quantity -- stock, milk, wine, water, oil, vinegar, " +
  "cream, juice. Every solid, powdered, or granular ingredient gets a weight or count unit instead, " +
  "with NO exceptions for small quantities: kosher salt, table salt, brown sugar, granulated sugar, " +
  "cornstarch, flour, baking soda, baking powder, and spices are never 'ml' or 'l', full stop -- prefer " +
  "'g' for these (e.g. '3 g kosher salt', '15 g brown sugar', '6 g cornstarch'), or 'tsp'/'tbsp' only " +
  "when a measuring spoon is genuinely the more natural real-world measure (a pinch of cinnamon, a " +
  "capful of extract). Butter and other solid fats get 'tbsp', 'g', or 'oz' -- never 'ml'. Ingredients " +
  "normally weighed (meat, cheese, produce) get 'g', 'kg', 'oz', or 'lb'; discrete items get 'each' " +
  "(eggs, garlic cloves, chiles). Before writing any ingredient's unit, ask: 'would this ever actually " +
  "be poured from a liquid measuring cup?' -- if the honest answer is no, the unit cannot be 'ml' or 'l', " +
  "regardless of how small the amount is.";

const INGREDIENT_TO_RECIPE_SYSTEM_PROMPT =
  "You are a home-cooking recipe developer. You will be given a dish's title and its ingredient list " +
  "(amounts and products only) -- you have NOT been given and will never see this dish's original " +
  "directions, so there is nothing to copy or paraphrase from; write completely original, from-scratch " +
  "step-by-step directions based on standard cooking technique and knowledge for a dish like this. Name " +
  "the actual technique and timing for each component (how things are seared/roasted/simmered/baked and " +
  "for how long and at what heat), not vague restatements. " +
  "Also normalize the given ingredient list into clean structured amount/unit/product/notes fields: keep " +
  "every ingredient and its real quantity (do not drop or invent ingredients), but clean up the product " +
  "name (strip package sizes, brand names, and prep instructions like 'cut into slices' out of the name " +
  "itself -- prep notes belong in the notes field, e.g. product 'chicken thighs', notes 'cut into 1-inch " +
  "pieces'). If no serving count is given, estimate a reasonable one from the ingredient quantities.\n\n" +
  UNIT_RULES;

export async function generateRecipeFromIngredients(input: {
  title: string;
  rawIngredients: string[];
}): Promise<{ recipe: RecipeDraft; usage: Anthropic.Usage }> {
  const response = await getClient().messages.parse({
    model: PLANNER_MODEL,
    max_tokens: 4096,
    output_config: { effort: "medium", format: zodOutputFormat(RecipeDraftSchema) },
    system: [{ type: "text", text: INGREDIENT_TO_RECIPE_SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content:
          `Dish title: ${input.title}\n\nIngredients as listed by the source (need normalizing):\n` +
          input.rawIngredients.map((i) => `- ${i}`).join("\n"),
      },
    ],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error("Claude did not return a parseable recipe.");
  }
  return { recipe: parsed, usage: response.usage };
}

