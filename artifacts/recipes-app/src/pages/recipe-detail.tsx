import { useState } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  useGetRecipe,
  useAddFavorite,
  useRemoveFavorite,
  getListFavoritesQueryKey,
  getGetSearchShortcutsQueryKey,
  getGetRecipeQueryKey,
} from '@workspace/api-client-react';
import { convertAmount, formatAmount, unitLabel, type UnitSystem } from '@/lib/units';

const SCALES = [0.5, 1, 2, 3, 4];

export default function RecipeDetail() {
  const [, params] = useRoute('/recipe/:slug');
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [system, setSystem] = useState<UnitSystem>('metric');
  const [scale, setScale] = useState(1);

  const slug = params?.slug ?? '';
  const { data, isLoading, isError } = useGetRecipe(slug, { query: { enabled: !!slug, queryKey: getGetRecipeQueryKey(slug) } });
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

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

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        {recipe && (
          <button type="button" onClick={toggleFavorite} aria-label="Toggle favorite" className="p-1 text-muted-foreground hover:text-accent">
            <Star className={`h-5 w-5 ${recipe.favorited ? 'fill-accent text-accent' : ''}`} />
          </button>
        )}
      </header>

      <div className="mx-auto max-w-[640px] space-y-4 px-4 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {isError && <p className="text-sm text-destructive">Recipe not found.</p>}

        {recipe && (
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
                    display = `${formatAmount(converted.value)} ${unitLabel(converted.unit)}`.trim();
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
