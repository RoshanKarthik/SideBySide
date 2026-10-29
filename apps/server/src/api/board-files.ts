import { boardFileSchema, isInterviewerRole, type BoardFile } from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { findRoomById, resolveMembership } from '../auth/identity';
import type { AppDeps, AppEnv } from '../context';
import { HttpError, conflict, forbidden, notFound } from '../lib/errors';
import { parseRound } from '../lib/rounds';
import { parseBody } from '../lib/validate';

async function requireMembership(c: Context<AppEnv>) {
  const room = await findRoomById(c.var.db, c.req.param('id') ?? '');
  if (!room) throw notFound('Room not found');
  const membership = await resolveMembership(
    c.var.db,
    c.var.auth,
    c.req.raw,
    c.env.GUEST_TOKEN_SECRET,
    room,
  );
  if (!membership) throw notFound('Room not found');
  return membership;
}

/**
 * Whiteboard images. They are stored once in the room's shared document (its Durable Object)
 * rather than inside the Yjs document, so per-minute snapshots don't copy them; board elements
 * reference them by id, and every browser fetches the ones it hasn't seen.
 */
export function boardFileRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  app.post('/rooms/:id/board-files', async (c) => {
    const { room, role } = await requireMembership(c);
    if (room.status === 'ended') throw conflict('The session has ended', 'room_ended');
    const file = parseBody(boardFileSchema, await c.req.json().catch(() => null));
    const doc = await deps.room(c.env, room.id, 'shared', room.currentRound);
    const result = await doc.putBoardFile(file, isInterviewerRole(role));
    if (result === 'locked') throw forbidden('The interviewer has locked the room');
    if (result === 'ended') throw conflict('The session has ended', 'room_ended');
    if (result === 'full') {
      throw new HttpError(409, 'board_full', 'This board already holds as many images as it can');
    }
    return c.body(null, 204);
  });

  /** `?round=` picks a practice round's board; interview rooms have one. */
  app.get('/rooms/:id/board-files/:fileId', async (c) => {
    const { room } = await requireMembership(c);
    const round = parseRound(c.req.query('round'), room.currentRound);
    const doc = await deps.room(c.env, room.id, 'shared', round);
    const file: BoardFile | null = await doc.getBoardFile(c.req.param('fileId'));
    if (!file) throw notFound('Image not found');
    // Images never change once stored, so browsers can keep them.
    c.header('cache-control', 'private, max-age=86400, immutable');
    return c.json(file);
  });

  return app;
}
