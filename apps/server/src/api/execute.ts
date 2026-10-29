import { executeRequestSchema, runsOnServer } from '@sidebyside/shared';
import { Hono } from 'hono';
import { findRoomById, resolveMembership } from '../auth/identity';
import type { AppDeps, AppEnv } from '../context';
import { HttpError, badRequest, conflict, notFound } from '../lib/errors';
import { parseBody } from '../lib/validate';

/**
 * Runs compiled-language code (Java, C, C++, Go) on the server's code runner, for people in a
 * live room. The browser that asked reports the result to the room, as it does for its own runs;
 * an interviewer's browser uses this for hidden tests too, which never reach the candidate.
 */
export function executeRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post('/rooms/:id/execute', async (c) => {
    const room = await findRoomById(c.var.db, c.req.param('id'));
    if (!room) throw notFound('Room not found');
    const membership = await resolveMembership(
      c.var.db,
      c.var.auth,
      c.req.raw,
      c.env.GUEST_TOKEN_SECRET,
      room,
    );
    if (!membership) throw notFound('Room not found');
    if (room.status !== 'live') throw conflict('Code runs only while the session is live');
    const req = parseBody(executeRequestSchema, await c.req.json().catch(() => null));
    if (!runsOnServer(req.language)) {
      throw badRequest('This language runs in the browser', 'runs_in_browser');
    }
    const provider = deps.execution(c.env);
    if (!provider) {
      throw new HttpError(503, 'runner_off', 'Running this language is turned off on this server');
    }
    const doc = await deps.room(c.env, room.id, 'shared', room.currentRound);
    const allowed = await doc.allowExecution(membership.participant.id);
    if (allowed === 'ended') throw conflict('Code runs only while the session is live');
    if (allowed === 'limited') {
      throw new HttpError(429, 'rate_limited', 'Too many runs in a minute; try again shortly');
    }
    try {
      return c.json(await provider.run(req));
    } catch (err) {
      console.error('Code runner failed', err);
      throw new HttpError(502, 'runner_unavailable', 'The code runner is not answering right now');
    }
  });

  return app;
}
