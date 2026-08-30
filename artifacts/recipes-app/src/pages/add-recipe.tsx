import { useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Plus, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import {
  useParseRecipeText,
  useCreateRecipe,
  getListCategoriesQueryKey,
  getSearchRecipesQueryKey,
  getGetSearchShortcutsQueryKey,
  type IngredientDraft,
} from '@workspace/api-client-react';
import { UNIT_LABELS } from '@/lib/units';

const emptyIngredient: IngredientDraft = { amountText: '', product: '', notes: '' };

export default function AddRecipe() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();

  const [pasteText, setPasteText] = useState('');
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [yieldText, setYieldText] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([{ ...emptyIngredient }]);
  const [steps, setSteps] = useState<string[]>(['']);

  const parseRecipe = useParseRecipeText();
  const createRecipe = useCreateRecipe();

  const applyDraft = (draft: {
    name: string;
    category: string;
    yieldText: string;
    ingredients: IngredientDraft[];
    steps: string[];
  }) => {
    setName(draft.name);
    setCategory(draft.category);
    setYieldText(draft.yieldText);
    setIngredients(draft.ingredients.length ? draft.ingredients : [{ ...emptyIngredient }]);
    setSteps(draft.steps.length ? draft.steps : ['']);
  };

  const parse = () => {
    if (!pasteText.trim()) return;
    parseRecipe.mutate(
      { data: { text: pasteText.trim() } },
      {
        onSuccess: (res) => applyDraft(res.recipe),
        onError: () => toast({ description: "Couldn't parse that text — try again or fill the fields in manually below.", variant: 'destructive' }),
      },
    );
  };

  const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  };

  const save = () => {
    if (!name.trim()) {
      toast({ description: 'Give the recipe a name first.', variant: 'destructive' });
      return;
    }
    const cleanIngredients = ingredients
      .filter((ing) => ing.amountText.trim() || ing.product.trim())
      .map((ing) => ({ ...ing, notes: ing.notes ?? '' }));
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);

    createRecipe.mutate(
      {
        data: {
          name: name.trim(),
          category: category.trim(),
          yieldText: yieldText.trim(),
          ingredients: cleanIngredients,
          steps: cleanSteps,
        },
      },
      {
        onSuccess: (res) => {
          void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          void qc.invalidateQueries({ queryKey: getSearchRecipesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
          toast({ description: `Saved "${res.recipe.name}"` });
          navigate(`/recipe/${res.recipe.slug}`);
        },
        onError: () => toast({ description: 'Could not save the recipe.', variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="font-serif text-xl">Add Recipe</p>
      </header>

      <div className="mx-auto max-w-[640px] space-y-4 px-4 py-4">
        <Card className="p-4">
          <h2 className="mb-1 flex items-center gap-1.5 font-serif text-lg">
            <Sparkles className="h-4 w-4 text-accent" />
            Paste &amp; parse
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Paste a recipe's ingredients and steps below and Claude will fill in the fields for you — or skip this and type
            everything in manually.
          </p>
          <Textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            placeholder="Paste ingredients and steps here..."
            className="mb-3 min-h-[140px]"
          />
          <Button onClick={parse} disabled={!pasteText.trim() || parseRecipe.isPending} className="w-full">
            {parseRecipe.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Parse with AI
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-serif text-lg">Details</h2>
          <div className="space-y-1">
            <label className="text-xs font-semibold text-muted-foreground">Name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Recipe name" />
          </div>
          <div className="flex gap-3">
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Category</label>
              <Input value={category} onChange={(e) => setCategory(e.target.value)} placeholder="e.g. Dessert" />
            </div>
            <div className="flex-1 space-y-1">
              <label className="text-xs font-semibold text-muted-foreground">Yield</label>
              <Input value={yieldText} onChange={(e) => setYieldText(e.target.value)} placeholder="e.g. 4 servings" />
            </div>
          </div>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-serif text-lg">Ingredients</h2>
          {ingredients.map((ing, i) => (
            <div key={i} className="space-y-2 rounded-lg border border-border p-2.5">
              <div className="flex gap-2">
                <Input
                  value={ing.amountText}
                  onChange={(e) => updateIngredient(i, { amountText: e.target.value })}
                  placeholder="Amount"
                  className="w-24"
                />
                <select
                  value={ing.unit ?? ''}
                  onChange={(e) => updateIngredient(i, { unit: e.target.value || undefined })}
                  className="h-9 w-24 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                >
                  <option value="">unit</option>
                  {Object.keys(UNIT_LABELS).map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
                <Input
                  value={ing.product}
                  onChange={(e) => updateIngredient(i, { product: e.target.value })}
                  placeholder="Ingredient"
                  className="flex-1"
                />
                <button
                  type="button"
                  onClick={() => setIngredients((prev) => prev.filter((_, idx) => idx !== i))}
                  aria-label="Remove ingredient"
                  className="shrink-0 p-1 text-muted-foreground hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Input
                value={ing.notes ?? ''}
                onChange={(e) => updateIngredient(i, { notes: e.target.value })}
                placeholder="Notes (optional) — e.g. sifted"
              />
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setIngredients((prev) => [...prev, { ...emptyIngredient }])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add ingredient
          </Button>
        </Card>

        <Card className="space-y-3 p-4">
          <h2 className="font-serif text-lg">Steps</h2>
          {steps.map((step, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="mt-2 shrink-0 text-sm font-semibold text-primary">{i + 1}.</span>
              <Textarea
                value={step}
                onChange={(e) => setSteps((prev) => prev.map((s, idx) => (idx === i ? e.target.value : s)))}
                placeholder="Describe this step..."
                className="min-h-[44px] flex-1"
              />
              <button
                type="button"
                onClick={() => setSteps((prev) => prev.filter((_, idx) => idx !== i))}
                aria-label="Remove step"
                className="mt-2 shrink-0 p-1 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setSteps((prev) => [...prev, ''])}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add step
          </Button>
        </Card>

        <Button onClick={save} disabled={createRecipe.isPending} className="w-full">
          {createRecipe.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save Recipe
        </Button>
      </div>
    </div>
  );
}
