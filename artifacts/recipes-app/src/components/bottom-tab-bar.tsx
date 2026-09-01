import { Link, useLocation } from 'wouter';
import { Search, Star, Settings as SettingsIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS = [
  { path: '/', label: 'Search', Icon: Search },
  { path: '/favorites', label: 'Favorites', Icon: Star },
  { path: '/settings', label: 'Settings', Icon: SettingsIcon },
] as const;

export function BottomTabBar() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-20 bg-card border-t border-border pb-[max(1rem,env(safe-area-inset-bottom))] shadow-[0_-2px_10px_rgba(0,0,0,.06)] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-[50vh] after:bg-card">
      <div className="flex">
        {TABS.map(({ path, label, Icon }) => {
          const active = location === path;
          return (
            <Link
              key={path}
              href={path}
              className={cn(
                'flex flex-1 flex-col items-center justify-center gap-1 py-3 text-[10px] font-semibold uppercase tracking-[0.1em] transition-colors',
                active ? 'text-primary' : 'text-muted-foreground',
              )}
            >
              <Icon className={cn('h-4 w-4 transition-transform', active && 'scale-110')} strokeWidth={active ? 2.5 : 1.8} />
              {label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
