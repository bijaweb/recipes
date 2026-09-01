import { useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/use-auth';
import {
  useGetRecipe,
  useAddFavorite,
  useRemoveFavorite,
  useUpdateRecipe,
  getListFavoritesQueryKey,
  getGetSearchShortcutsQueryKey,
  getGetRecipeQueryKey,
  getListCategoriesQueryKey,
  getSearchRecipesQueryKey,
  type IngredientDraft,
} from '@workspace/api-client-react';
import { convertAmount, formatAmount, unitLabel, UNIT_LABELS, type UnitSystem } from '@/lib/units';

const SCALES = [0.5, 1, 2, 3, 4];
const emptyIngredient: IngredientDraft = { amountText: '', product: '', notes: '' };

export default function RecipeDetail() {
  const [, params] = useRoute('/recipe/:slug');
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [system, setSystem] = useState<UnitSystem>('metric');
  const [scale, setScale] = useState(1);
  const [isEditing, setIsEditing] = useState(false);

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [yieldText, setYieldText] = useState('');
  const [ingredients, setIngredients] = useState<IngredientDraft[]>([]);
  const [steps, setSteps] = useState<string[]>([]);

  const slug = params?.slug ?? '';
  const { data, isLoading, isError } = useGetRecipe(slug, { query: { enabled: !!slug, queryKey: getGetRecipeQueryKey(slug) } });
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();
  const updateRecipe = useUpdateRecipe();

  const recipe = data?.recipe;

  const toggleFavorite = () => {
    if (!recipe) return;
    const action = recipe.favorited ? removeFavorite : addFavorite;
    action.mutate(
      { recipeId: recipe.id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipe.slug) });
          void qc.invalidateQueries({ queryKey: getListFavoritesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
        },
      },
    );
  };

  const startEditing = () => {
    if (!recipe) return;
    setName(recipe.name);
    setCategory(recipe.category);
    setYieldText(recipe.yieldText);
    setIngredients(
      recipe.ingredients.length
        ? recipe.ingredients.map((ing) => ({
            amountText: ing.amountText,
            amountValue: ing.amountValue,
            unit: ing.unit,
            product: ing.product,
            notes: ing.notes,
          }))
        : [{ ...emptyIngredient }],
    );
    setSteps(recipe.steps.length ? [...recipe.steps] : ['']);
    setIsEditing(true);
  };

  const updateIngredient = (index: number, patch: Partial<IngredientDraft>) => {
    setIngredients((prev) => prev.map((ing, i) => (i === index ? { ...ing, ...patch } : ing)));
  };

  const cancelEditing = () => setIsEditing(false);

  const save = () => {
    if (!recipe) return;
    if (!name.trim()) {
      toast({ description: 'Give the recipe a name first.', variant: 'destructive' });
      return;
    }
    const cleanIngredients = ingredients
      .filter((ing) => ing.amountText.trim() || ing.product.trim())
      .map((ing) => ({ ...ing, notes: ing.notes ?? '' }));
    const cleanSteps = steps.map((s) => s.trim()).filter(Boolean);

    updateRecipe.mutate(
      {
        recipeId: recipe.id,
        data: {
          name: name.trim(),
          category: category.trim(),
          yieldText: yieldText.trim(),
          yieldServings: recipe.yieldServings,
          ingredients: cleanIngredients,
          steps: cleanSteps,
          utensils: recipe.utensils,
        },
      },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getGetRecipeQueryKey(recipe.slug) });
          void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          void qc.invalidateQueries({ queryKey: getSearchRecipesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
          toast({ description: 'Recipe saved' });
          setIsEditing(false);
        },
        onError: () => toast({ description: 'Could not save the recipe.', variant: 'destructive' }),
      },
    );
  };

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => (isEditing ? cancelEditing() : navigate('/'))}>
          {isEditing ? <X className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
        </Button>
        {recipe && !isEditing && (
          <div className="flex items-center gap-3">
            {user?.isAdmin && (
              <button type="button" onClick={startEditing} aria-label="Edit recipe" className="p-1 text-muted-foreground hover:text-accent">
                <Pencil className="h-5 w-5" />
              </button>
            )}
            <button type="button" onClick={toggleFavorite} aria-label="Toggle favorite" className="p-1 text-muted-foreground hover:text-accent">
              <Star className={`h-5 w-5 ${recipe.favorited ? 'fill-accent text-accent' : ''}`} />
            </button>
          </div>
        )}
        {isEditing && (
          <Button size="sm" onClick={save} disabled={updateRecipe.isPending}>
            {updateRecipe.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        )}
      </header>

      <div className="mx-auto max-w-[640px] space-y-4 px-4 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Recipe not found.</p>}

        {recipe && isEditing && (
          <>
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
          </>
        )}

        {recipe && !isEditing && (
          <>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{recipe.category}</p>
              <h1 className="font-serif text-3xl">{recipe.name}</h1>
              {recipe.yieldText && <p className="mt-1 text-sm text-muted-foreground">Yield: {recipe.yieldText}</p>}
            </div>

            <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="flex items-center gap-1.5">
                {(['imperial', 'metric'] as UnitSystem[]).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSystem(s)}
                    className={`rounded-full border px-3 py-1 text-xs font-semibold capitalize transition-colors ${
                      system === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
              <div className="flex items-center gap-1.5">
                {SCALES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setScale(s)}
                    className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${
                      scale === s ? 'border-primary bg-primary text-primary-foreground' : 'border-border text-muted-foreground'
                    }`}
                  >
                    {s}×
                  </button>
                ))}
              </div>
            </Card>

            <Card className="p-4">
              <h2 className="mb-3 font-serif text-lg">Ingredients</h2>
              <ul className="space-y-2">
                {recipe.ingredients.map((ing) => {
                  let display = ing.amountText;
                  if (ing.amountValue !== undefined && ing.unit) {
                    const scaled = ing.amountValue * scale;
                    const converted = convertAmount(scaled, ing.unit, system);
                    const roundUp = system === 'metric' && ['g', 'kg', 'ml', 'l'].includes(converted.unit);
                    display = `${formatAmount(converted.value, roundUp)} ${unitLabel(converted.unit)}`.trim();
                  } else if (ing.amountValue !== undefined) {
                    display = formatAmount(ing.amountValue * scale);
                  }
                  return (
                    <li key={ing.id} className="flex items-baseline gap-2 text-sm">
                      <span className="w-20 shrink-0 font-semibold text-foreground">{display}</span>
                      <span className="text-foreground">
                        {ing.product}
                        {ing.notes && <span className="text-muted-foreground"> — {ing.notes}</span>}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </Card>

            {recipe.utensils.length > 0 && (
              <Card className="p-4">
                <h2 className="mb-3 font-serif text-lg">Utensils</h2>
                <div className="flex flex-wrap gap-1.5">
                  {recipe.utensils.map((u, i) => (
                    <span key={i} className="rounded-full bg-secondary/40 px-3 py-1 text-xs font-semibold">
                      {u}
                    </span>
                  ))}
                </div>
              </Card>
            )}

            <Card className="p-4">
              <h2 className="mb-3 font-serif text-lg">Steps</h2>
              <ol className="space-y-3">
                {recipe.steps.map((step, i) =>
                  step.startsWith('—') ? (
                    <li key={i} className="pt-1 text-xs font-bold uppercase tracking-wide text-accent">
                      {step.replace(/—/g, '').trim()}
                    </li>
                  ) : (
                    <li key={i} className="flex gap-3 text-sm">
                      <span className="shrink-0 font-semibold text-primary">{i + 1}.</span>
                      <span>{step}</span>
                    </li>
                  ),
                )}
              </ol>
            </Card>
          </>
        )}
      </div>
    </div>
  );
}
