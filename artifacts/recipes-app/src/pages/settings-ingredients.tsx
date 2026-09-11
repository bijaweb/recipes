import { useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  useListIngredientCatalog,
  useDeleteIngredientCatalogItem,
  getListIngredientCatalogQueryKey,
} from '@workspace/api-client-react';

const PAGE_SIZE = 50;

function IngredientRow({ id, name, pluralName, category, onDeleted }: { id: string; name: string; pluralName: string; category: string; onDeleted: () => void }) {
  const deleteItem = useDeleteIngredientCatalogItem();

  const remove = () => {
    if (!window.confirm(`Remove "${name}" from the ingredient catalog?`)) return;
    deleteItem.mutate({ id }, { onSuccess: onDeleted });
  };

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {category || 'Uncategorized'}
          {pluralName && pluralName !== name ? ` · plural: ${pluralName}` : ''}
        </p>
      </div>
      <button type="button" onClick={remove} aria-label={`Remove ${name}`} className="shrink-0 p-1 text-muted-foreground hover:text-destructive">
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}

export default function SettingsIngredients() {
  const [, navigate] = useLocation();
  const qc = useQueryClient();
  const [search, setSearch] = useState('');

  const params = useMemo(() => ({ q: search.trim() || undefined, limit: PAGE_SIZE }), [search]);
  const query = useListIngredientCatalog(params, { query: { queryKey: getListIngredientCatalogQueryKey(params) } });

  const ingredients = query.data?.ingredients ?? [];
  const total = query.data?.total ?? 0;

  const invalidate = () => void qc.invalidateQueries({ queryKey: getListIngredientCatalogQueryKey(params) });

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="font-serif text-xl">Ingredients</p>
      </header>

      <div className="mx-auto max-w-[640px] px-4 py-4">
        <Card className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            {total.toLocaleString()} ingredient{total === 1 ? '' : 's'} in the catalog.
          </p>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search ingredients..."
            className="mb-3"
          />
          <div className="space-y-2">
            {query.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {!query.isLoading && ingredients.length === 0 && (
              <p className="text-sm text-muted-foreground">No ingredients match "{search}".</p>
            )}
            {ingredients.map((i) => (
              <IngredientRow key={i.id} id={i.id} name={i.name} pluralName={i.pluralName} category={i.category} onDeleted={invalidate} />
            ))}
          </div>
          {ingredients.length > 0 && ingredients.length < total && !search && (
            <p className="mt-3 text-center text-xs text-muted-foreground">
              Showing {ingredients.length} of {total.toLocaleString()} — search to narrow down.
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}
