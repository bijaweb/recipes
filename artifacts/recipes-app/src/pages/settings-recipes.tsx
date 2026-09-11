import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useSearchRecipes,
  useDeleteRecipe,
  getSearchRecipesQueryKey,
  getListCategoriesQueryKey,
  getGetSearchShortcutsQueryKey,
  getListFavoritesQueryKey,
} from '@workspace/api-client-react';

function RecipeManageRow({ id, name, category }: { id: string; name: string; category: string }) {
  const qc = useQueryClient();
  const deleteRecipe = useDeleteRecipe();

  const remove = () => {
    if (!window.confirm(`Delete "${name}"? This can't be undone.`)) return;
    deleteRecipe.mutate(
      { recipeId: id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getSearchRecipesQueryKey() });
          void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
          void qc.invalidateQueries({ queryKey: getListFavoritesQueryKey() });
        },
      },
    );
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        {category && <p className="text-xs text-muted-foreground">{category}</p>}
      </div>
      <button type="button" onClick={remove} aria-label={`Delete ${name}`} className="shrink-0 p-1 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SettingsRecipes() {
  const [, navigate] = useLocation();
  const [recipeSearch, setRecipeSearch] = useState('');
  const params = useMemo(() => ({ q: recipeSearch.trim() || undefined }), [recipeSearch]);
  const recipesQuery = useSearchRecipes(params, { query: { queryKey: getSearchRecipesQueryKey(params) } });
  const recipes = recipesQuery.data?.recipes ?? [];

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="font-serif text-xl">Recipes</p>
      </header>

      <div className="mx-auto max-w-[640px] px-4 py-4">
        <Card className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">Delete a recipe permanently.</p>
          <Input
            value={recipeSearch}
            onChange={(e) => setRecipeSearch(e.target.value)}
            placeholder="Filter recipes to delete..."
            className="mb-3"
          />
          <div className="space-y-2">
            {recipesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {recipes.map((r) => (
              <RecipeManageRow key={r.id} id={r.id} name={r.name} category={r.category} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
