import { patchMeSchema, type Me } from '@sidebyside/shared';
import { eq, users } from '@sidebyside/db';
import { Hono } from 'hono';
import { enabledProviders } from '../auth/auth';
import { getSessionUser } from '../auth/identity';
import type { AppEnv } from '../context';
import { notFound, unauthorized } from '../lib/errors';
import { parseBody } from '../lib/validate';

export function meRoutes() {
  const app = new Hono<AppEnv>();

  /** Which sign-in buttons the login page should show. */
  app.get('/auth-providers', (c) => c.json({ providers: enabledProviders(c.env) }));

  app.get('/me', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const [row] = await c.var.db.select().from(users).where(eq(users.id, session.id));
    if (!row) throw notFound('User not found');
    return c.json(toMe(row));
  });

  app.patch('/me', async (c) => {
    const session = await getSessionUser(c.var.auth, c.req.raw.headers);
    if (!session) throw unauthorized();
    const input = parseBody(patchMeSchema, await c.req.json().catch(() => null));
    const [row] = await c.var.db
      .update(users)
      .set({
        ...(input.displayName !== undefined && { name: input.displayName }),
        ...(input.defaultLanguage !== undefined && { defaultLanguage: input.defaultLanguage }),
        ...(input.lowBandwidth !== undefined && { lowBandwidth: input.lowBandwidth }),
      })
      .where(eq(users.id, session.id))
      .returning();
    if (!row) throw notFound('User not found');
    return c.json(toMe(row));
  });

  return app;
}

function toMe(row: typeof users.$inferSelect): Me {
  return {
    id: row.id,
    email: row.email,
    displayName: row.name,
    avatarUrl: row.image,
    defaultLanguage: row.defaultLanguage,
    lowBandwidth: row.lowBandwidth,
  };
}
