import { useEffect, useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Loader2, Save, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  useListCategories,
  useRenameCategory,
  useSearchRecipes,
  useDeleteRecipe,
  getListCategoriesQueryKey,
  getSearchRecipesQueryKey,
  getGetSearchShortcutsQueryKey,
  getListFavoritesQueryKey,
} from '@workspace/api-client-react';

function CategoryRow({ category }: { category: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState(category);
  const renameCategory = useRenameCategory();

  useEffect(() => setName(category), [category]);

  const dirty = name.trim() !== category && name.trim().length > 0;

  const save = () => {
    renameCategory.mutate(
      { category, data: { name: name.trim() } },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListCategoriesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
          toast({ description: `Renamed to "${name.trim()}"` });
        },
      },
    );
  };

  return (
    <div className="flex items-center gap-2">
      <Input value={name} onChange={(e) => setName(e.target.value)} className="flex-1" />
      <Button size="sm" variant="outline" onClick={save} disabled={!dirty || renameCategory.isPending}>
        {renameCategory.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
      </Button>
    </div>
  );
}

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

export default function Settings() {
  const categoriesQuery = useListCategories();
  const [recipeSearch, setRecipeSearch] = useState('');
  const params = useMemo(() => ({ q: recipeSearch.trim() || undefined }), [recipeSearch]);
  const recipesQuery = useSearchRecipes(params, { query: { queryKey: getSearchRecipesQueryKey(params) } });

  const categories = categoriesQuery.data?.categories ?? [];
  const recipes = recipesQuery.data?.recipes ?? [];

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <p className="mx-auto max-w-[640px] font-serif text-2xl">Settings</p>
      </header>

      <div className="mx-auto max-w-[640px] space-y-4 px-4 py-4">
        <Card className="p-4">
          <h2 className="mb-1 font-serif text-lg">Categories</h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Rename a category to fix or merge it — every recipe tagged with it updates too.
          </p>
          <div className="space-y-2">
            {categories.map((c) => (
              <CategoryRow key={c} category={c} />
            ))}
          </div>
        </Card>

        <Card className="p-4">
          <h2 className="mb-1 font-serif text-lg">Recipes</h2>
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
