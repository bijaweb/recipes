import { Link } from 'wouter';
import { ChevronRight, ListChecks, ShoppingBasket, Tag } from 'lucide-react';
import { Card } from '@/components/ui/card';

const ROWS = [
  { path: '/settings/categories', label: 'Categories', description: 'Rename or merge recipe categories', Icon: Tag },
  { path: '/settings/recipes', label: 'Recipes', description: 'Delete a recipe permanently', Icon: ListChecks },
  { path: '/settings/ingredients', label: 'Ingredients', description: 'Browse and manage the ingredient catalog', Icon: ShoppingBasket },
] as const;

export default function Settings() {
  return (
    <div className="min-h-[100dvh] bg-background pb-16">
      <header className="sticky top-0 z-10 border-b border-border bg-card px-4 py-4">
        <p className="mx-auto max-w-[640px] font-serif text-2xl">Settings</p>
      </header>

      <div className="mx-auto max-w-[640px] space-y-3 px-4 py-4">
        {ROWS.map(({ path, label, description, Icon }) => (
          <Link key={path} href={path}>
            <Card className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/50">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{label}</p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
