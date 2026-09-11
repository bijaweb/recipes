import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';
import {
  useListCategories,
  useRenameCategory,
  getListCategoriesQueryKey,
  getGetSearchShortcutsQueryKey,
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

export default function SettingsCategories() {
  const [, navigate] = useLocation();
  const categoriesQuery = useListCategories();
  const categories = categoriesQuery.data?.categories ?? [];

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-card px-4 py-3">
        <Button variant="ghost" size="icon" onClick={() => navigate('/settings')}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <p className="font-serif text-xl">Categories</p>
      </header>

      <div className="mx-auto max-w-[640px] px-4 py-4">
        <Card className="p-4">
          <p className="mb-3 text-xs text-muted-foreground">
            Rename a category to fix or merge it — every recipe tagged with it updates too.
          </p>
          <div className="space-y-2">
            {categoriesQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
            {categories.map((c) => (
              <CategoryRow key={c} category={c} />
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
