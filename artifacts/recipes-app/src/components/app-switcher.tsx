import { type ReactNode } from 'react';
import { LogOut, Menu, Settings } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PLATFORM_URL = 'https://bijacorp.com';

export function AppSwitcher({ onOpenSettings, leftSlot }: { onOpenSettings?: () => void; leftSlot?: ReactNode } = {}) {
  const { user, signOut } = useAuth();
  if (!user) return null;

  const otherApps = (user.apps ?? []).filter((a) => {
    try {
      return new URL(a.url).hostname !== window.location.hostname;
    } catch {
      return true;
    }
  });

  return (
    <div className="fixed right-4 top-3 z-40 flex items-center gap-2">
      {leftSlot}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Switch apps"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-border bg-card/95 text-muted-foreground shadow-md backdrop-blur transition-colors hover:text-foreground"
          >
            <Menu className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {otherApps.map((app) => (
            <DropdownMenuItem key={app.url} asChild>
              <a href={app.url}>{app.name}</a>
            </DropdownMenuItem>
          ))}
          {user.isAdmin && (
            <>
              {otherApps.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <a href={PLATFORM_URL}>BijaCorp</a>
              </DropdownMenuItem>
            </>
          )}
          {(otherApps.length > 0 || user.isAdmin) && <DropdownMenuSeparator />}
          {onOpenSettings && (
            <DropdownMenuItem onSelect={onOpenSettings}>
              <Settings className="mr-2 h-4 w-4" />
              Settings
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
