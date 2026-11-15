import { type ReactNode, useEffect, useState } from 'react';
import { Clock, LogOut, Menu, Moon, Settings, Sun, ChevronDown, LayoutGrid } from 'lucide-react';
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
const MESSENGER_URL = 'https://messenger.bijacorp.com';
const APPS_COLLAPSE_AT = 5;
const APPS_OPEN_KEY = 'bijacorp-menu-apps-open';

export function AppSwitcher({ onOpenSettings, leftSlot }: { onOpenSettings?: () => void; leftSlot?: ReactNode } = {}) {
  const { user, signOut } = useAuth();
  const { mode } = useNightMode();
  const { data: nightModeSettings } = useGetNightModeSettings();

  useEffect(() => {
    if (nightModeSettings) syncAutoNightModeEnabled(nightModeSettings.autoNightModeEnabled);
  }, [nightModeSettings]);

  // More than APPS_COLLAPSE_AT other apps: they fold under one "Apps" row
  // (open/closed remembered on this device, shared key across the apps).
  const [appsOpen, setAppsOpen] = useState(() => {
    try {
      return localStorage.getItem(APPS_OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggleApps = () =>
    setAppsOpen((open) => {
      try {
        localStorage.setItem(APPS_OPEN_KEY, open ? '0' : '1');
      } catch {
        // private mode: just don't remember it
      }
      return !open;
    });

  if (!user) return null;

  const otherApps = (user.apps ?? []).filter((a) => {
    try {
      return new URL(a.url).hostname !== window.location.hostname;
    } catch {
      return true;
    }
  });
  const collapsible = otherApps.length > APPS_COLLAPSE_AT;
  // Non-admins with Messenger: "Message admin" opens their thread with the
  // admins, noting which app and page they were on.
  const messageAdminUrl =
    !user.isAdmin && (user.apps ?? []).some((a) => a.url.replace(/\/$/, '') === MESSENGER_URL)
      ? `${MESSENGER_URL}/#/admin?app=${encodeURIComponent(document.title)}&url=${encodeURIComponent(window.location.href)}`
      : null;

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
          {collapsible && (
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                toggleApps();
              }}
              aria-expanded={appsOpen}
            >
              <LayoutGrid className="mr-2 h-4 w-4" />
              Apps
              <span className="ml-auto pl-4 text-xs tabular-nums text-muted-foreground">{otherApps.length}</span>
              <ChevronDown className={`ml-1 h-4 w-4 text-muted-foreground transition-transform ${appsOpen ? 'rotate-180' : ''}`} />
            </DropdownMenuItem>
          )}
          {(!collapsible || appsOpen) &&
            otherApps.map((app) => (
              <DropdownMenuItem key={app.url} asChild>
                <a href={app.url} className={collapsible ? 'pl-8' : undefined}>
                  {app.name}
                </a>
              </DropdownMenuItem>
            ))}
          {messageAdminUrl && (
            <>
              {otherApps.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <a href={messageAdminUrl}>Message admin</a>
              </DropdownMenuItem>
            </>
          )}
          {user.isAdmin && (
            <>
              {otherApps.length > 0 && <DropdownMenuSeparator />}
              <DropdownMenuItem asChild>
                <a href={PLATFORM_URL}>BijaCorp</a>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <a href={`${PLATFORM_URL}/api/webclip`} target="_blank" rel="noreferrer">
                  iPhone icons
                </a>
              </DropdownMenuItem>
            </>
          )}
          {(otherApps.length > 0 || user.isAdmin || messageAdminUrl) && <DropdownMenuSeparator />}
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
