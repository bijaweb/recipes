import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod/v4";

const MODEL = "claude-opus-5";

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
