import { type ReactNode, useEffect } from 'react';
import { Clock, LogOut, Menu, Moon, Settings, Sun } from 'lucide-react';
import { useGetNightModeSettings } from '@workspace/api-client-react';
import { useAuth } from '@/hooks/use-auth';
import { type ThemeMode, setThemeMode, syncAutoNightModeEnabled, useNightMode } from '@/hooks/use-night-mode';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const PLATFORM_URL = 'https://bijacorp.com';

export function AppSwitcher({ onOpenSettings, leftSlot }: { onOpenSettings?: () => void; leftSlot?: ReactNode } = {}) {
  const { user, signOut } = useAuth();
  const { mode } = useNightMode();
  const { data: nightModeSettings } = useGetNightModeSettings();

  useEffect(() => {
    if (nightModeSettings) syncAutoNightModeEnabled(nightModeSettings.autoNightModeEnabled);
  }, [nightModeSettings]);

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
          <DropdownMenuSeparator />
          <DropdownMenuRadioGroup value={mode} onValueChange={(value) => setThemeMode(value as ThemeMode)}>
            <DropdownMenuRadioItem value="auto">
              <Clock className="mr-2 inline h-4 w-4" />
              Automatic (night 7pm-7am)
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="light">
              <Sun className="mr-2 inline h-4 w-4" />
              Day mode
            </DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="dark">
              <Moon className="mr-2 inline h-4 w-4" />
              Night mode
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={signOut}>
            <LogOut className="mr-2 h-4 w-4" />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
