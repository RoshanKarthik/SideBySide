import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { SignInCurtain } from '@/components/sign-in-curtain';
import { Spinner } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/overlay';
import { Toaster } from '@/components/ui/toaster';
import { ApiRequestError } from '@/lib/api';
import { usePreferenceClasses } from '@/lib/use-me';
import './index.css';

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner />
    </div>
  );
}

/** Code-split route: the editors, whiteboard and less-visited pages load only when opened. */
function lazyPage(load: () => Promise<{ default: ComponentType }>) {
  const Page = lazy(load);
  return (
    <Suspense fallback={<PageLoader />}>
      <Page />
    </Suspense>
  );
}

/** Applies account preferences (low-bandwidth mode) to the whole page. */
function Preferences() {
  usePreferenceClasses();
  return null;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (count, err) =>
        !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500) && count < 2,
      refetchOnWindowFocus: false,
    },
  },
});

const pages = {
  landing: () => import('@/routes/landing'),
  login: () => import('@/routes/login'),
  room: () => import('@/routes/room-route'),
  replay: () => import('@/routes/replay'),
  questions: () => import('@/routes/questions'),
  question: () => import('@/routes/question-edit'),
  session: () => import('@/routes/session'),
  practice: () => import('@/routes/practice'),
  settings: () => import('@/routes/settings'),
  feedback: () => import('@/routes/feedback'),
  claim: () => import('@/routes/claim'),
  // Named exports, so every page stays out of the bundle the room and landing pages load first.
  dashboard: () => import('@/routes/dashboard').then((m) => ({ default: m.DashboardPage })),
  privacy: () => import('@/routes/legal').then((m) => ({ default: m.PrivacyPage })),
  terms: () => import('@/routes/legal').then((m) => ({ default: m.TermsPage })),
  notFound: () => import('@/routes/not-found').then((m) => ({ default: m.NotFoundPage })),
};

/**
 * Fetches the other pages' code once the browser is idle, so moving between pages cross-fades
 * straight to the new page instead of through a loading spinner. Skipped on Save-Data.
 */
function preloadPages() {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData) return;
  const idle = window.requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 1500));
  idle(() => {
    for (const load of Object.values(pages)) void load().catch(() => {});
  });
}

const router = createBrowserRouter([
  { path: '/', element: lazyPage(pages.landing) },
  { path: '/login', element: lazyPage(pages.login) },
  { path: '/dashboard', element: lazyPage(pages.dashboard) },
  { path: '/r/:slug', element: lazyPage(pages.room) },
  { path: '/r/:slug/feedback', element: lazyPage(pages.feedback) },
  { path: '/rooms/:id/replay', element: lazyPage(pages.replay) },
  { path: '/questions', element: lazyPage(pages.questions) },
  { path: '/questions/:id', element: lazyPage(pages.question) },
  { path: '/sessions/:id', element: lazyPage(pages.session) },
  { path: '/practice', element: lazyPage(pages.practice) },
  { path: '/settings', element: lazyPage(pages.settings) },
  { path: '/claim/:roomId', element: lazyPage(pages.claim) },
  { path: '/privacy', element: lazyPage(pages.privacy) },
  { path: '/terms', element: lazyPage(pages.terms) },
  { path: '*', element: lazyPage(pages.notFound) },
]);

preloadPages();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Preferences />
        <SignInCurtain />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
