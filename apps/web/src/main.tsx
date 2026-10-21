import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy, type ComponentType } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Spinner } from '@/components/ui/card';
import { TooltipProvider } from '@/components/ui/overlay';
import { Toaster } from '@/components/ui/toaster';
import { ApiRequestError } from '@/lib/api';
import { usePreferenceClasses } from '@/lib/use-me';
import { DashboardPage } from '@/routes/dashboard';
import { NotFoundPage } from '@/routes/not-found';
import { PrivacyPage, TermsPage } from '@/routes/legal';
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

const router = createBrowserRouter([
  { path: '/', element: lazyPage(() => import('@/routes/landing')) },
  { path: '/login', element: lazyPage(() => import('@/routes/login')) },
  { path: '/dashboard', element: <DashboardPage /> },
  { path: '/r/:slug', element: lazyPage(() => import('@/routes/room-route')) },
  { path: '/rooms/:id/replay', element: lazyPage(() => import('@/routes/replay')) },
  { path: '/questions', element: lazyPage(() => import('@/routes/questions')) },
  { path: '/questions/:id', element: lazyPage(() => import('@/routes/question-edit')) },
  { path: '/sessions/:id', element: lazyPage(() => import('@/routes/session')) },
  { path: '/practice', element: lazyPage(() => import('@/routes/practice')) },
  { path: '/settings', element: lazyPage(() => import('@/routes/settings')) },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <RouterProvider router={router} />
        <Preferences />
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  </StrictMode>,
);
