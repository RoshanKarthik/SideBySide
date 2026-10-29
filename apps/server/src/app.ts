import { Hono } from 'hono';
import { boardFileRoutes } from './api/board-files';
import { claimRoutes } from './api/claim';
import { executeRoutes } from './api/execute';
import { iceServerRoutes } from './api/ice-servers';
import { meRoutes } from './api/me';
import { practiceRoutes } from './api/practice';
import { questionRoutes } from './api/questions';
import { reportRoutes } from './api/reports';
import { roomToolRoutes } from './api/room-tools';
import { roomRoutes } from './api/rooms';
import { sessionRoutes } from './api/sessions';
import { allowedOrigins, createAuth } from './auth/auth';
import type { AppDeps, AppEnv } from './context';
import { HttpError } from './lib/errors';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** The REST API, mounted at /api. */
export function createApp(deps: AppDeps) {
  const app = new Hono<AppEnv>().basePath('/api');

  app.onError((err, c) => {
    if (err instanceof HttpError) {
      return c.json({ error: { code: err.code, message: err.message } }, err.status);
    }
    console.error('Unhandled error', err);
    return c.json({ error: { code: 'internal', message: 'Something went wrong' } }, 500);
  });

  app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found' } }, 404));

  app.get('/health', (c) => c.json({ ok: true }));

  // Cookie-authenticated writes must come from our own pages. Browsers always send Origin on
  // cross-site POSTs; requests without it are non-browser clients using bearer tokens.
  app.use('*', async (c, next) => {
    if (!SAFE_METHODS.has(c.req.method)) {
      const origin = c.req.header('origin');
      if (origin && !allowedOrigins(c.env).includes(origin)) {
        throw new HttpError(403, 'bad_origin', 'Request origin not allowed');
      }
    }
    await next();
  });

  // One database connection per request, closed when the response is done.
  app.use('*', async (c, next) => {
    const handle = await deps.openDb(c.env);
    c.set('db', handle.db);
    c.set('auth', createAuth(c.env, handle.db));
    try {
      await next();
    } finally {
      const closing = handle.close().catch((e) => console.error('Failed to close db', e));
      try {
        c.executionCtx.waitUntil(closing);
      } catch {
        await closing; // No execution context (tests).
      }
    }
  });

  app.on(['GET', 'POST'], '/auth/*', (c) => c.var.auth.handler(c.req.raw));

  app.route('/', meRoutes(deps));
  app.route('/', roomRoutes(deps));
  app.route('/', roomToolRoutes(deps));
  app.route('/', sessionRoutes(deps));
  app.route('/', questionRoutes());
  app.route('/', practiceRoutes(deps));
  app.route('/', boardFileRoutes(deps));
  app.route('/', executeRoutes(deps));
  app.route('/', iceServerRoutes());
  app.route('/', claimRoutes());
  app.route('/', reportRoutes(deps));

  return app;
}
