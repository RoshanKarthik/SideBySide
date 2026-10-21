import '@fontsource/instrument-serif/400.css';
import { useEffect, useSyncExternalStore } from 'react';
import { cn } from '@/lib/utils';

/*
 * The sign-in (and sign-out) transition: a navy circle grows out of the button that was
 * pressed until it covers the screen, the SideBySide wordmark shows while the session is set
 * up, then the circle closes to reveal the next page. It survives the full page load after
 * signing in (or the round trip to Google/GitHub) through a sessionStorage flag.
 */

type Phase = 'idle' | 'covering' | 'covered' | 'revealing';

const FLAG = 'sbs-curtain';
const COVER_MS = 650;
const REVEAL_MS = 750;
/** Never leave the screen covered, whatever happens to the sign-in. */
const STUCK_MS = 8_000;

interface State {
  phase: Phase;
  x: number;
  y: number;
  label: string;
}

let state: State = { phase: 'idle', x: 50, y: 50, label: '' };
const listeners = new Set<() => void>();
let stuckTimer: ReturnType<typeof setTimeout> | undefined;

function set(next: Partial<State>) {
  state = { ...state, ...next };
  for (const l of listeners) l();
}

function reducedMotion() {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

/**
 * Covers the screen, growing from `from` (the pressed button), and resolves once covered. The
 * caller then loads the next page (or is redirected to Google/GitHub and back); the curtain
 * opens on whatever page loads next.
 */
export function coverScreen(from: Element | null, label: string): Promise<void> {
  if (reducedMotion()) return Promise.resolve();
  const box = from?.getBoundingClientRect();
  const x = box ? ((box.left + box.width / 2) / window.innerWidth) * 100 : 50;
  const y = box ? ((box.top + box.height / 2) / window.innerHeight) * 100 : 50;
  try {
    sessionStorage.setItem(FLAG, JSON.stringify({ label }));
  } catch {
    // The opening just won't play after the page load.
  }
  set({ phase: 'covering', x, y, label });
  clearTimeout(stuckTimer);
  stuckTimer = setTimeout(openScreen, STUCK_MS);
  return new Promise((resolve) =>
    setTimeout(() => {
      if (state.phase === 'covering') set({ phase: 'covered' });
      resolve();
    }, COVER_MS),
  );
}

/** Opens the curtain onto the page underneath (also used when sign-in fails). */
export function openScreen() {
  clearTimeout(stuckTimer);
  try {
    sessionStorage.removeItem(FLAG);
  } catch {
    // Nothing stored.
  }
  if (state.phase === 'idle' || state.phase === 'revealing') return;
  set({ phase: 'revealing', x: 50, y: 50 });
  setTimeout(() => {
    if (state.phase === 'revealing') set({ phase: 'idle' });
  }, REVEAL_MS);
}

/** After a full page load that a sign-in started, begin covered and open shortly after. */
function resumeAfterLoad() {
  let saved: { label?: string } | null;
  try {
    const raw = sessionStorage.getItem(FLAG);
    saved = raw ? (JSON.parse(raw) as { label?: string }) : null;
  } catch {
    saved = null;
  }
  if (!saved || reducedMotion()) {
    document.documentElement.classList.remove('curtain-pending');
    if (saved) openScreen();
    return;
  }
  set({ phase: 'covered', label: saved.label ?? '' });
  // The curtain now covers the page itself; let the page underneath show.
  document.documentElement.classList.remove('curtain-pending');
  stuckTimer = setTimeout(openScreen, STUCK_MS);
  // Let the page underneath render first.
  setTimeout(openScreen, 450);
}

/** The login page itself must not open the curtain: the redirect away is still coming. */
export function isCovering() {
  return state.phase === 'covering' || state.phase === 'covered';
}

export function SignInCurtain() {
  const s = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
  );
  useEffect(resumeAfterLoad, []);

  if (s.phase === 'idle') return null;
  const open = s.phase === 'covering' || s.phase === 'covered';
  return (
    <div
      aria-hidden={!open}
      role={open ? 'status' : undefined}
      className={cn(
        'curtain fixed inset-0 z-[100] flex items-center justify-center',
        s.phase === 'covering' && 'curtain-cover',
        s.phase === 'covered' && 'curtain-full',
        s.phase === 'revealing' && 'curtain-reveal pointer-events-none',
      )}
      style={{ '--cx': `${s.x}%`, '--cy': `${s.y}%` } as React.CSSProperties}
    >
      <div className={cn('curtain-mark text-center', !open && 'curtain-mark-out')}>
        <p className="text-5xl tracking-tight text-white sm:text-6xl">SideBySide</p>
        {s.label && <p className="mt-3 font-sans text-sm text-white/65">{s.label}</p>}
        <span className="curtain-line mx-auto mt-6 block h-px w-40" />
      </div>
    </div>
  );
}
