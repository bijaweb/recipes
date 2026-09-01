import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Search as SearchIcon, Star, Clock, Sparkles, Plus } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  useListCategories,
  useGetSearchShortcuts,
  useSearchRecipes,
  useAddFavorite,
  useRemoveFavorite,
  getListFavoritesQueryKey,
  getGetSearchShortcutsQueryKey,
  getSearchRecipesQueryKey,
  type RecipeSummary,
} from '@workspace/api-client-react';

function FavoriteButton({ recipe }: { recipe: RecipeSummary }) {
  const qc = useQueryClient();
  const addFavorite = useAddFavorite();
  const removeFavorite = useRemoveFavorite();

  const toggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    const action = recipe.favorited ? removeFavorite : addFavorite;
    action.mutate(
      { recipeId: recipe.id },
      {
        onSuccess: () => {
          void qc.invalidateQueries({ queryKey: getListFavoritesQueryKey() });
          void qc.invalidateQueries({ queryKey: getGetSearchShortcutsQueryKey() });
        },
      },
    );
  };

  return (
    <button type="button" onClick={toggle} aria-label="Toggle favorite" className="shrink-0 p-1 text-muted-foreground hover:text-accent">
      <Star className={`h-4 w-4 ${recipe.favorited ? 'fill-accent text-accent' : ''}`} />
    </button>
  );
}

function RecipeRow({ recipe }: { recipe: RecipeSummary }) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(`/recipe/${recipe.slug}`)}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{recipe.name}</p>
        {recipe.category && <p className="text-xs text-muted-foreground">{recipe.category}</p>}
      </div>
      <FavoriteButton recipe={recipe} />
    </button>
  );
}

function ShortcutChip({ recipe }: { recipe: RecipeSummary }) {
  const [, navigate] = useLocation();
  return (
    <button
      type="button"
      onClick={() => navigate(`/recipe/${recipe.slug}`)}
      className="rounded-2xl border border-border bg-card px-4 py-4 text-left transition-colors hover:border-primary"
    >
      <p className="text-sm font-semibold leading-snug text-foreground line-clamp-2">{recipe.name}</p>
      {recipe.category && <p className="mt-1 text-xs text-muted-foreground">{recipe.category}</p>}
    </button>
  );
}

export default function Home() {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);

  const categoriesQuery = useListCategories();
  const shortcutsQuery = useGetSearchShortcuts();
  const isSearching = query.trim().length > 0 || category !== null;
  const searchParams = { q: query.trim() || undefined, category: category ?? undefined };
  const searchQuery = useSearchRecipes(searchParams, {
    query: { enabled: isSearching, queryKey: getSearchRecipesQueryKey(searchParams) },
  });

  const categories = categoriesQuery.data?.categories ?? [];
  const results = searchQuery.data?.recipes ?? [];

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <div className="mx-auto flex max-w-[640px] items-center justify-between">
          <p className="font-serif text-2xl">Recipes</p>
          <Button size="icon" variant="outline" onClick={() => navigate('/add')} aria-label="Add recipe">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </header>

      <div className="mx-auto max-w-[640px] space-y-4 px-4 py-4">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name or category..."
            className="h-12 border-primary/15 bg-primary/5 pl-10 text-base"
          />
        </div>

        {categories.length > 0 && (
          <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory((prev) => (prev === c ? null : c))}
                className={`shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                  category === c
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-background text-muted-foreground hover:text-foreground'
                }`}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        {isSearching ? (
          <div className="space-y-2">
            {searchQuery.isLoading && <p className="text-sm text-muted-foreground">Searching…</p>}
            {!searchQuery.isLoading && results.length === 0 && (
              <p className="text-sm text-muted-foreground">No recipes match "{query || category}".</p>
            )}
            {results.map((r) => (
              <RecipeRow key={r.id} recipe={r} />
            ))}
          </div>
        ) : (
          <>
            {(shortcutsQuery.data?.recent.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Clock className="h-3.5 w-3.5" />
                  Recently viewed
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {shortcutsQuery.data!.recent.map((r) => (
                    <ShortcutChip key={r.id} recipe={r} />
                  ))}
                </div>
              </div>
            )}
            {(shortcutsQuery.data?.random.length ?? 0) > 0 && (
              <div className="space-y-2">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  <Sparkles className="h-3.5 w-3.5" />
                  Discover
                </p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {shortcutsQuery.data!.random.map((r) => (
                    <ShortcutChip key={r.id} recipe={r} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
