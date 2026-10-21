import { forwardRef, useCallback, type ComponentProps } from 'react';
import { flushSync } from 'react-dom';
import {
  Link as RouterLink,
  NavLink as RouterNavLink,
  useNavigate as useRouterNavigate,
  type NavigateOptions,
  type To,
} from 'react-router';

/*
 * Every page change cross-fades (see the ::view-transition rules in index.css). Browsers without
 * view transitions, and people who prefer reduced motion, get an instant change instead.
 */

function reducedMotion(): boolean {
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
}

export const Link = forwardRef<HTMLAnchorElement, ComponentProps<typeof RouterLink>>(
  function Link(props, ref) {
    return <RouterLink ref={ref} viewTransition {...props} />;
  },
);

export const NavLink = forwardRef<HTMLAnchorElement, ComponentProps<typeof RouterNavLink>>(
  function NavLink(props, ref) {
    return <RouterNavLink ref={ref} viewTransition {...props} />;
  },
);

/** `useNavigate`, with page changes cross-fading like links do. */
export function useNavigate() {
  const navigate = useRouterNavigate();
  return useCallback(
    (to: To | number, options?: NavigateOptions) =>
      typeof to === 'number' ? navigate(to) : navigate(to, { viewTransition: true, ...options }),
    [navigate],
  );
}

/** Runs a state change inside a view transition, so what it swaps on screen cross-fades. */
export function withViewTransition(update: () => void) {
  const doc = document as Document & {
    startViewTransition?: (cb: () => void) => unknown;
  };
  if (!doc.startViewTransition || reducedMotion() || document.visibilityState !== 'visible') {
    update();
    return;
  }
  doc.startViewTransition(() => flushSync(update));
}
