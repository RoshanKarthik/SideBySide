import { useCallback, useSyncExternalStore } from 'react';
import { withViewTransition } from './navigation';

export type Theme = 'light' | 'dark';

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

function subscribe(cb: () => void) {
  window.addEventListener('sbs-theme', cb);
  return () => window.removeEventListener('sbs-theme', cb);
}

/** The current theme, following toggles made anywhere on the page. */
export function useCurrentTheme(): Theme {
  return useSyncExternalStore(subscribe, current);
}

export function useTheme() {
  const theme = useCurrentTheme();
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    // Cross-fade between the themes instead of flashing.
    withViewTransition(() => document.documentElement.classList.toggle('dark', next === 'dark'));
    try {
      localStorage.setItem('sbs-theme', next);
    } catch {
      // Not persisted; fine.
    }
    window.dispatchEvent(new CustomEvent('sbs-theme', { detail: next }));
  }, []);
  return { theme, toggle };
}
