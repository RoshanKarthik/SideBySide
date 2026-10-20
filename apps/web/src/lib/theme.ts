import { useCallback, useState, useSyncExternalStore } from 'react';

type Theme = 'light' | 'dark';

function current(): Theme {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(current);
  const toggle = useCallback(() => {
    const next: Theme = current() === 'dark' ? 'light' : 'dark';
    document.documentElement.classList.toggle('dark', next === 'dark');
    try {
      localStorage.setItem('sbs-theme', next);
    } catch {
      // Not persisted; fine.
    }
    setTheme(next);
    window.dispatchEvent(new CustomEvent('sbs-theme', { detail: next }));
  }, []);
  return { theme, toggle };
}

/** The current theme, following toggles made anywhere on the page. */
export function useCurrentTheme(): Theme {
  return useSyncExternalStore((cb) => {
    window.addEventListener('sbs-theme', cb);
    return () => window.removeEventListener('sbs-theme', cb);
  }, current);
}
