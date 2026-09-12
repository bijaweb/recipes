import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useQueryClient, useQueries } from '@tanstack/react-query';
import { format, addDays } from 'date-fns';
import { ChevronLeft, ChevronRight, Loader2, Plus, Save, X } from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import {
  useListPlannerProteins,
  useGetPlannerPairings,
  getGetPlannerPairingsQueryKey,
  useBuildPlannerRecipe,
  useListMealPlan,
  getListMealPlanQueryKey,
  useAddMealPlanEntry,
  useMoveMealPlanEntry,
  useRemoveMealPlanEntry,
  useSearchRecipes,
  getSearchRecipesQueryKey,
  getRecipe,
  getGetRecipeQueryKey,
  type MealPlanEntry,
  type PlannerPairingItem,
} from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1.5 text-sm transition-colors',
        active ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted/50',
      )}
    >
      {children}
    </button>
  );
}

function PickerSection({
  title,
  items,
  value,
  onChange,
}: {
  title: string;
  items: PlannerPairingItem[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      <div className="flex flex-wrap gap-2">
        {items.slice(0, 6).map((it) => (
          <Chip key={it.name} active={value === it.name} onClick={() => onChange(it.name)}>
            {it.name}
          </Chip>
        ))}
      </div>
    </div>
  );
}

function BuildTab() {
  const proteinsQuery = useListPlannerProteins();
  const qc = useQueryClient();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState('');
  const [familyKey, setFamilyKey] = useState<string | null>(null);
  const [cuisine, setCuisine] = useState<string | null>(null);
  const [sauce, setSauce] = useState<string | null>(null);
  const [veg, setVeg] = useState<string | null>(null);
  const [carb, setCarb] = useState<string | null>(null);

  const proteins = proteinsQuery.data?.proteins ?? [];
  const topFive = proteins.slice(0, 5);
  const rest = proteins.slice(5);
  const filteredRest = rest.filter((p) => p.label.toLowerCase().includes(search.toLowerCase()));
  const selectedProtein = proteins.find((p) => p.familyKey === familyKey) ?? null;

  const pairingParams = { familyKey: familyKey ?? '', cuisine: cuisine ?? undefined };
  const pairingsQuery = useGetPlannerPairings(pairingParams, {
    query: { enabled: !!familyKey, queryKey: getGetPlannerPairingsQueryKey(pairingParams) },
  });

  useEffect(() => {
    if (!pairingsQuery.data) return;
    setSauce(pairingsQuery.data.sauces[0]?.name ?? null);
    setVeg(pairingsQuery.data.veg[0]?.name ?? null);
    setCarb(pairingsQuery.data.carbs[0]?.name ?? null);
  }, [pairingsQuery.data]);

  const selectFamily = (key: string) => {
    setFamilyKey(key);
    setCuisine(null);
  };

  const build = useBuildPlannerRecipe();

  const handleSave = () => {
    if (!selectedProtein || !sauce || !veg || !carb) return;
    build.mutate(
      {
        data: {
          familyKey: selectedProtein.familyKey,
          proteinLabel: selectedProtein.label,
          sauce,
          veg,
          carb,
          cuisine: cuisine ?? undefined,
        },
      },
      {
        onSuccess: (res) => {
          toast({ description: `Saved "${res.recipe.name}"` });
          void qc.invalidateQueries({ queryKey: getSearchRecipesQueryKey() });
          navigate(`/recipe/${res.recipe.slug}`);
        },
        onError: () => {
          toast({ description: 'Could not write a recipe for that combo -- try again.', variant: 'destructive' });
        },
      },
    );
  };

  return (
    <div className="space-y-5">
      <div>
        <h2 className="mb-3 font-serif text-lg">Pick a protein</h2>
        <div className="grid grid-cols-5 gap-2">
          {topFive.map((p) => (
            <button
              key={p.familyKey}
              type="button"
              onClick={() => selectFamily(p.familyKey)}
              className={cn(
                'flex flex-col items-center gap-1 rounded-2xl border p-3 text-center transition-colors',
                familyKey === p.familyKey ? 'border-primary bg-primary/10' : 'border-border bg-card hover:bg-muted/50',
              )}
            >
              <span className="text-2xl">{p.icon}</span>
              <span className="text-[11px] font-medium leading-tight">{p.label}</span>
            </button>
          ))}
        </div>
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search other proteins..."
          className="mt-2"
        />
        {search && (
          <div className="mt-2 flex flex-wrap gap-2">
            {filteredRest.length === 0 && <p className="text-xs text-muted-foreground">No match.</p>}
            {filteredRest.map((p) => (
              <button
                key={p.familyKey}
                type="button"
                onClick={() => {
                  selectFamily(p.familyKey);
                  setSearch('');
                }}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-sm hover:bg-muted/50"
              >
                {p.icon} {p.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {selectedProtein && (
        <>
          <div>
            <h2 className="mb-2 font-serif text-lg">Flair</h2>
            <div className="flex flex-wrap gap-2">
              <Chip active={cuisine === null} onClick={() => setCuisine(null)}>
                Any Cuisine
              </Chip>
              {(pairingsQuery.data?.cuisines ?? []).map((c) => (
                <Chip key={c.name} active={cuisine === c.name} onClick={() => setCuisine(c.name)}>
                  {c.name}
                </Chip>
              ))}
            </div>
          </div>

          {pairingsQuery.isLoading && <Skeleton className="h-32 w-full rounded-2xl" />}

          {pairingsQuery.data && (
            <>
              <PickerSection title="Sauce" items={pairingsQuery.data.sauces} value={sauce} onChange={setSauce} />
              <PickerSection title="Veg" items={pairingsQuery.data.veg} value={veg} onChange={setVeg} />
              <PickerSection title="Carb" items={pairingsQuery.data.carbs} value={carb} onChange={setCarb} />

              <Card className="p-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Preview</p>
                <p className="mt-1 font-serif text-lg leading-snug">
                  {selectedProtein.label} with {sauce}, {veg} &amp; {carb}
                </p>
                <Button className="mt-3 w-full" onClick={handleSave} disabled={build.isPending || !sauce || !veg || !carb}>
                  {build.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {build.isPending ? 'Writing your recipe...' : 'Build Full Recipe'}
                </Button>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  );
}

function DraggableEntry({ entry, onRemove }: { entry: MealPlanEntry; onRemove: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: entry.id });
  const style = transform ? { transform: CSS.Translate.toString(transform) } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={cn(
        'flex items-center gap-2 rounded-xl border border-border bg-background px-3 py-2 text-sm active:cursor-grabbing',
        isDragging && 'opacity-50',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{entry.recipe.name}</span>
      <button
        type="button"
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        aria-label={`Remove ${entry.recipe.name}`}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-destructive"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

function DayColumn({
  date,
  label,
  entries,
  isToday,
  onAdd,
  onRemove,
}: {
  date: string;
  label: string;
  entries: MealPlanEntry[];
  isToday: boolean;
  onAdd: () => void;
  onRemove: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: date });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-2xl border p-3 transition-colors',
        isOver ? 'border-primary bg-primary/5' : 'border-border bg-card',
        isToday && !isOver && 'ring-1 ring-primary/30',
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-semibold">{label}</p>
        <button
          type="button"
          onClick={onAdd}
          aria-label={`Add a recipe to ${label}`}
          className="rounded-full p-1 text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>
      {entries.length === 0 && <p className="text-xs text-muted-foreground">Nothing planned</p>}
      <div className="space-y-2">
        {entries.map((e) => (
          <DraggableEntry key={e.id} entry={e} onRemove={() => onRemove(e.id)} />
        ))}
      </div>
    </div>
  );
}

function AddRecipeToDayDialog({
  date,
  onClose,
  onAdded,
}: {
  date: string | null;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [q, setQ] = useState('');
  const params = { q: q.trim() || undefined };
  const searchQuery = useSearchRecipes(params, {
    query: { queryKey: getSearchRecipesQueryKey(params), enabled: date !== null },
  });
  const addEntry = useAddMealPlanEntry();
  const recipes = searchQuery.data?.recipes ?? [];

  return (
    <Dialog
      open={date !== null}
      onOpenChange={(open) => {
        if (!open) {
          setQ('');
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a recipe</DialogTitle>
        </DialogHeader>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes..." autoFocus />
        <div className="mt-1 max-h-72 space-y-2 overflow-y-auto">
          {searchQuery.isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}
          {!searchQuery.isLoading && recipes.length === 0 && (
            <p className="text-sm text-muted-foreground">No recipes match.</p>
          )}
          {recipes.map((r) => (
            <button
              key={r.id}
              type="button"
              disabled={addEntry.isPending}
              onClick={() => {
                if (!date) return;
                addEntry.mutate(
                  { data: { date, recipeId: r.id } },
                  {
                    onSuccess: () => {
                      onAdded();
                      setQ('');
                      onClose();
                    },
                  },
                );
              }}
              className="flex w-full items-center justify-between gap-2 rounded-lg border border-border px-3 py-2 text-left text-sm hover:bg-muted/50"
            >
              <span className="min-w-0 flex-1 truncate">{r.name}</span>
              {r.category && <span className="shrink-0 text-xs text-muted-foreground">{r.category}</span>}
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function WeekTab({
  weekStart,
  setWeekStart,
  from,
  to,
}: {
  weekStart: Date;
  setWeekStart: (d: Date) => void;
  from: string;
  to: string;
}) {
  const qc = useQueryClient();
  const params = { from, to };
  const planQuery = useListMealPlan(params, { query: { queryKey: getListMealPlanQueryKey(params) } });
  const moveEntry = useMoveMealPlanEntry();
  const removeEntry = useRemoveMealPlanEntry();
  const [addDialogDate, setAddDialogDate] = useState<string | null>(null);

  const entries = planQuery.data?.entries ?? [];
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const invalidate = () => void qc.invalidateQueries({ queryKey: getListMealPlanQueryKey(params) });

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;
    const entryId = String(active.id);
    const targetDate = String(over.id);
    const entry = entries.find((e) => e.id === entryId);
    if (!entry || entry.date === targetDate) return;
    moveEntry.mutate({ id: entryId, data: { date: targetDate } }, { onSuccess: invalidate });
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <p className="font-serif text-base">
          {format(weekStart, 'MMM d')} &ndash; {format(addDays(weekStart, 6), 'MMM d')}
        </p>
        <Button variant="ghost" size="icon" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {planQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-20 w-full rounded-2xl" />
          <Skeleton className="h-20 w-full rounded-2xl" />
        </div>
      ) : (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="space-y-3">
            {days.map((day) => {
              const dateStr = format(day, 'yyyy-MM-dd');
              const dayEntries = entries.filter((e) => e.date === dateStr).sort((a, b) => a.sortOrder - b.sortOrder);
              return (
                <DayColumn
                  key={dateStr}
                  date={dateStr}
                  label={format(day, 'EEE d')}
                  entries={dayEntries}
                  isToday={dateStr === todayStr}
                  onAdd={() => setAddDialogDate(dateStr)}
                  onRemove={(id) => removeEntry.mutate({ id }, { onSuccess: invalidate })}
                />
              );
            })}
          </div>
        </DndContext>
      )}

      <AddRecipeToDayDialog date={addDialogDate} onClose={() => setAddDialogDate(null)} onAdded={invalidate} />
    </div>
  );
}

function ShoppingSection({
  title,
  items,
  checked,
  onToggle,
}: {
  title: string;
  items: Map<string, number>;
  checked: Set<string>;
  onToggle: (name: string) => void;
}) {
  const names = Array.from(items.keys()).sort((a, b) => a.localeCompare(b));
  if (names.length === 0) return null;

  return (
    <div>
      <h3 className="mb-2 font-serif text-lg">{title}</h3>
      <Card className="space-y-1 p-2">
        {names.map((name) => {
          const isChecked = checked.has(name);
          const count = items.get(name)!;
          return (
            <label key={name} className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 text-sm">
              <input
                type="checkbox"
                checked={isChecked}
                onChange={() => onToggle(name)}
                className="h-4 w-4 shrink-0 rounded border-input accent-primary"
              />
              <span className={cn('min-w-0 flex-1 truncate', isChecked && 'text-muted-foreground line-through')}>{name}</span>
              {count > 1 && <span className="shrink-0 text-xs text-muted-foreground">&times;{count}</span>}
            </label>
          );
        })}
      </Card>
    </div>
  );
}

function ShoppingTab({ from, to }: { from: string; to: string }) {
  const params = { from, to };
  const planQuery = useListMealPlan(params, { query: { queryKey: getListMealPlanQueryKey(params) } });
  const entries = planQuery.data?.entries ?? [];
  const slugs = useMemo(() => Array.from(new Set(entries.map((e) => e.recipe.slug))), [entries]);

  const detailQueries = useQueries({
    queries: slugs.map((slug) => ({
      queryKey: getGetRecipeQueryKey(slug),
      queryFn: () => getRecipe(slug),
    })),
  });

  const [checked, setChecked] = useState<Set<string>>(new Set());
  const toggle = (name: string) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const grouped = useMemo(() => {
    const fresh = new Map<string, number>();
    const pantry = new Map<string, number>();
    const other = new Map<string, number>();
    for (const q of detailQueries) {
      const detail = q.data?.recipe;
      if (!detail) continue;
      for (const ing of detail.ingredients) {
        const key = ing.product.trim();
        if (!key) continue;
        const bucket = ing.productType === 'fresh' ? fresh : ing.productType === 'pantry' ? pantry : other;
        bucket.set(key, (bucket.get(key) ?? 0) + 1);
      }
    }
    return { fresh, pantry, other };
  }, [detailQueries]);

  if (planQuery.isLoading) return <Skeleton className="h-40 w-full rounded-2xl" />;

  if (entries.length === 0) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nothing planned for this week yet &mdash; add recipes on the This Week tab first.
      </Card>
    );
  }

  if (detailQueries.some((q) => q.isLoading)) return <Skeleton className="h-40 w-full rounded-2xl" />;

  return (
    <div className="space-y-5">
      <ShoppingSection title="Fresh" items={grouped.fresh} checked={checked} onToggle={toggle} />
      <ShoppingSection title="Pantry" items={grouped.pantry} checked={checked} onToggle={toggle} />
      {grouped.other.size > 0 && <ShoppingSection title="Other" items={grouped.other} checked={checked} onToggle={toggle} />}
    </div>
  );
}

export default function Planner() {
  const [tab, setTab] = useState<'build' | 'week' | 'shopping'>('build');
  // Rolling 7-day window anchored on today, not the Mon-Sun calendar week --
  // this keeps "This Week" in sync with the recipe page's own day-picker,
  // which also counts forward from today rather than snapping to Monday.
  const [weekStart, setWeekStart] = useState<Date>(() => new Date());
  const from = format(weekStart, 'yyyy-MM-dd');
  const to = format(addDays(weekStart, 6), 'yyyy-MM-dd');

  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <p className="mx-auto max-w-[640px] font-serif text-2xl">Planner</p>
      </header>

      <div className="mx-auto max-w-[640px] px-4 py-4">
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="build">Build</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="shopping">Shopping</TabsTrigger>
          </TabsList>
          <TabsContent value="build" className="mt-4">
            <BuildTab />
          </TabsContent>
          <TabsContent value="week" className="mt-4">
            <WeekTab weekStart={weekStart} setWeekStart={setWeekStart} from={from} to={to} />
          </TabsContent>
          <TabsContent value="shopping" className="mt-4">
            <ShoppingTab from={from} to={to} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
