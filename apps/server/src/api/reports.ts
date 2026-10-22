import { and, eq, sessionReports, type Database, type SessionReportRow } from '@sidebyside/db';
import type {
  CandidateReport,
  InterviewerReport,
  ReportView,
  SessionReports,
} from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { providerFromEnv } from '../ai/provider';
import { markReportsPending } from '../ai/summary';
import { findRoomById, resolveMembership } from '../auth/identity';
import type { AppDeps, AppEnv } from '../context';
import { conflict, forbidden, notFound } from '../lib/errors';
import { loadRounds, parseRound, seesPrivateDataOf } from '../lib/rounds';

type SummaryEnv = Parameters<typeof providerFromEnv>[0];

/** Whether this server writes AI reports (a provider is configured). */
export function reportsEnabled(env: Env): boolean {
  return providerFromEnv(env as unknown as SummaryEnv) !== null;
}

/**
 * Starts writing a round's reports in the background, when reports are enabled. Called when a
 * session ends and when a practice round is swapped.
 */
export async function queueReports(
  deps: AppDeps,
  env: Env,
  db: Database,
  roomId: string,
  round: number,
): Promise<void> {
  if (!reportsEnabled(env)) return;
  try {
    await markReportsPending(db, roomId, round);
    await (await deps.room(env, roomId, 'shared', round)).generateReports();
  } catch (err) {
    // Ending the session matters more than its report; it can be regenerated later.
    console.error('Could not start the AI reports', err);
  }
}

function toView<T>(row: SessionReportRow | undefined): ReportView<T> | null {
  if (!row) return null;
  return {
    status: row.status,
    content: row.status === 'ready' ? (row.content as T) : null,
    error: row.status === 'failed' ? row.error : null,
    model: row.model,
    generatedAt: row.generatedAt?.toISOString() ?? null,
  };
}

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
  // Same answer for "no such room" and "not yours", so ids can't be probed.
  if (!membership) throw notFound('Room not found');
  return membership;
}

export function reportRoutes(deps: AppDeps) {
  const app = new Hono<AppEnv>();

  /**
   * A round's reports, filtered for the caller: the interviewer report to whoever interviewed
   * that round, the candidate report also to its candidate once the session is over and the
   * interviewer chose to share it (practice partners always get their own).
   */
  app.get('/rooms/:id/reports', async (c) => {
    const membership = await requireMembership(c);
    const { room, participant } = membership;
    const rounds = await loadRounds(c.var.db, room.id);
    const roundNumber = Math.min(
      parseRound(c.req.query('round'), rounds.length),
      room.currentRound,
    );
    const round = rounds.find((r) => r.roundNumber === roundNumber);
    const interviewer = seesPrivateDataOf(membership, round);
    const wasCandidate =
      room.mode === 'practice'
        ? round?.candidateParticipantId === participant.id
        : participant.role === 'candidate';
    const candidateMaySee =
      wasCandidate &&
      room.status === 'ended' &&
      (room.mode === 'practice' || room.shareReportWithCandidate);
    if (!interviewer && !candidateMaySee) {
      // Candidates still get to know whether a report is coming.
      const body: SessionReports = {
        enabled: reportsEnabled(c.env),
        round: roundNumber,
        interviewer: null,
        candidate: null,
        canRegenerate: false,
      };
      return c.json(body);
    }

    const rows = await c.var.db
      .select()
      .from(sessionReports)
      .where(and(eq(sessionReports.roomId, room.id), eq(sessionReports.roundNumber, roundNumber)));
    const enabled = reportsEnabled(c.env);
    const body: SessionReports = {
      enabled,
      round: roundNumber,
      interviewer: interviewer
        ? toView<InterviewerReport>(rows.find((r) => r.kind === 'interviewer'))
        : null,
      candidate: toView<CandidateReport>(rows.find((r) => r.kind === 'candidate')),
      canRegenerate: enabled && interviewer && room.status === 'ended',
    };
    return c.json(body);
  });

  /** Interviewers: write a round's reports again (after a failure, or for a fresh take). */
  app.post('/rooms/:id/reports/regenerate', async (c) => {
    const membership = await requireMembership(c);
    const { room } = membership;
    const rounds = await loadRounds(c.var.db, room.id);
    const roundNumber = Math.min(
      parseRound(c.req.query('round'), rounds.length),
      room.currentRound,
    );
    const round = rounds.find((r) => r.roundNumber === roundNumber);
    if (!seesPrivateDataOf(membership, round)) {
      throw forbidden('Only the interviewer can regenerate the reports');
    }
    if (room.status !== 'ended') throw conflict('Reports are written after the session ends');
    if (!reportsEnabled(c.env)) throw conflict('AI reports are not set up on this server');
    const pending = await c.var.db
      .select({ id: sessionReports.id })
      .from(sessionReports)
      .where(
        and(
          eq(sessionReports.roomId, room.id),
          eq(sessionReports.roundNumber, roundNumber),
          eq(sessionReports.status, 'pending'),
        ),
      );
    if (pending.length) throw conflict('The reports are already being written', 'in_progress');
    await queueReports(deps, c.env, c.var.db, room.id, roundNumber);
    return c.json({ ok: true });
  });

  return app;
}
