import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { Star } from 'lucide-react';
import {
  useListFavorites,
  useRemoveFavorite,
  getListFavoritesQueryKey,
  getGetSearchShortcutsQueryKey,
  type RecipeSummary,
} from '@workspace/api-client-react';

function FavoriteRow({ recipe }: { recipe: RecipeSummary }) {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const removeFavorite = useRemoveFavorite();

  const unfavorite = (e: React.MouseEvent) => {
    e.stopPropagation();
    removeFavorite.mutate(
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
    <button
      type="button"
      onClick={() => navigate(`/recipe/${recipe.slug}`)}
      className="flex w-full items-center justify-between gap-2 rounded-xl border border-border bg-card px-4 py-3 text-left transition-colors hover:border-primary"
    >
      <div className="min-w-0">
        <p className="truncate font-semibold text-foreground">{recipe.name}</p>
        {recipe.category && <p className="text-xs text-muted-foreground">{recipe.category}</p>}
      </div>
      <button type="button" onClick={unfavorite} aria-label="Remove favorite" className="shrink-0 p-1 text-accent">
        <Star className="h-4 w-4 fill-accent" />
      </button>
    </button>
  );
}

export default function Favorites() {
  const { data, isLoading } = useListFavorites();
  const recipes = data?.recipes ?? [];

  return (
    <div className="min-h-[100dvh] bg-background pb-28">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <p className="mx-auto max-w-[640px] font-serif text-2xl">Favorites</p>
      </header>

      <div className="mx-auto max-w-[640px] space-y-2 px-4 py-4">
        {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
        {!isLoading && recipes.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-secondary text-primary">
              <Star className="h-6 w-6" />
            </div>
            <h3 className="mt-4 font-serif text-xl">No favorites yet.</h3>
            <p className="mt-2 max-w-xs text-sm leading-6 text-muted-foreground">
              Tap the star on any recipe to save it here.
            </p>
          </div>
        )}
        {recipes.map((r) => (
          <FavoriteRow key={r.id} recipe={r} />
        ))}
      </div>
    </div>
  );
}
