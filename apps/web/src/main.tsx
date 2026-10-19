import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { Spinner } from '@/components/ui/card';
import { ApiRequestError } from '@/lib/api';
import { DashboardPage } from '@/routes/dashboard';
import { LandingPage } from '@/routes/landing';
import { LoginPage } from '@/routes/login';
import { NotFoundPage } from '@/routes/not-found';
import { PrivacyPage, TermsPage } from '@/routes/legal';
import './index.css';

// The room and replay pages pull in the editors; load them only when needed.
const RoomRoute = lazy(() => import('@/routes/room-route'));
const ReplayPage = lazy(() => import('@/routes/replay'));

function PageLoader() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Spinner />
    </div>
  );
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
  { path: '/', element: <LandingPage /> },
  { path: '/login', element: <LoginPage /> },
  { path: '/dashboard', element: <DashboardPage /> },
  {
    path: '/r/:slug',
    element: (
      <Suspense fallback={<PageLoader />}>
        <RoomRoute />
      </Suspense>
    ),
  },
  {
    path: '/rooms/:id/replay',
    element: (
      <Suspense fallback={<PageLoader />}>
        <ReplayPage />
      </Suspense>
    ),
  },
  { path: '/privacy', element: <PrivacyPage /> },
  { path: '/terms', element: <TermsPage /> },
  { path: '*', element: <NotFoundPage /> },
]);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);
