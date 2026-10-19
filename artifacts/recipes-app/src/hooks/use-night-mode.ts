import { useEffect, useState } from 'react';

// Module-level pub/sub (same pattern as use-toast.ts / use-save-indicator.ts)
// so the applied theme, the burger-menu picker, and the periodic clock
// re-check all share one source of truth without a React context provider.
//
// Three-way mode, persisted per-browser:
//   'auto'  - follow the admin's platform-wide schedule (dark 7pm-7am local
//             time) when enabled; otherwise follow the OS light/dark setting.
//   'light' / 'dark' - explicit user override, wins regardless of schedule.
export type ThemeMode = 'light' | 'dark' | 'auto';

const MODE_KEY = 'theme-mode';
const AUTO_ENABLED_KEY = 'theme-auto-enabled';
const NIGHT_START_HOUR = 19; // 7pm
const NIGHT_END_HOUR = 7; // 7am
const RECHECK_MS = 60_000;

function isNightNow(): boolean {
  const hour = new Date().getHours();
  return hour >= NIGHT_START_HOUR || hour < NIGHT_END_HOUR;
}

function readMode(): ThemeMode {
  try {
    const stored = localStorage.getItem(MODE_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'auto') return stored;
  } catch {
    // ignore
  }
  return 'auto';
}

function readAutoEnabled(): boolean {
  try {
    const stored = localStorage.getItem(AUTO_ENABLED_KEY);
    return stored === null ? true : stored === 'true';
  } catch {
    return true;
  }
}

function resolveDark(mode: ThemeMode, autoEnabled: boolean): boolean {
  if (mode === 'dark') return true;
  if (mode === 'light') return false;
  if (autoEnabled) return isNightNow();
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  } catch {
    return false;
  }
}

function applyDark(dark: boolean) {
  document.documentElement.classList.toggle('dark', dark);
}

interface State {
  mode: ThemeMode;
  autoEnabled: boolean;
  isDark: boolean;
}

let state: State = (() => {
  const mode = readMode();
  const autoEnabled = readAutoEnabled();
  return { mode, autoEnabled, isDark: resolveDark(mode, autoEnabled) };
})();

const listeners = new Set<(s: State) => void>();

function commit(next: Pick<State, 'mode' | 'autoEnabled'>) {
  const isDark = resolveDark(next.mode, next.autoEnabled);
  state = { ...next, isDark };
  applyDark(isDark);
  listeners.forEach((listener) => listener(state));
}

export function setThemeMode(mode: ThemeMode) {
  try {
    localStorage.setItem(MODE_KEY, mode);
  } catch {
    // ignore
  }
  commit({ mode, autoEnabled: state.autoEnabled });
}

// Called once the app has fetched the admin's real setting from the API, so
// later page loads' blocking script can use the cached value immediately.
export function syncAutoNightModeEnabled(enabled: boolean) {
  if (enabled === state.autoEnabled) return;
  try {
    localStorage.setItem(AUTO_ENABLED_KEY, String(enabled));
  } catch {
    // ignore
  }
  commit({ mode: state.mode, autoEnabled: enabled });
}

// Re-evaluate the clock periodically so a session left open flips
// automatically at 7pm/7am without needing a reload.
setInterval(() => {
  if (state.mode === 'auto' && state.autoEnabled) {
    commit({ mode: state.mode, autoEnabled: state.autoEnabled });
  }
}, RECHECK_MS);

export function useNightMode(): State {
  const [local, setLocal] = useState(state);

  useEffect(() => {
    listeners.add(setLocal);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);

  return local;
}
