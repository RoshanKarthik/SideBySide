import { asc, eq, sessionRounds, type Database, type SessionRoundRow } from '@sidebyside/db';
import { isInterviewerRole, type RoomRole } from '@sidebyside/shared';
import type { RoomMembership } from '../auth/identity';

export async function loadRounds(db: Database, roomId: string): Promise<SessionRoundRow[]> {
  return db
    .select()
    .from(sessionRounds)
    .where(eq(sessionRounds.roomId, roomId))
    .orderBy(asc(sessionRounds.roundNumber));
}

/**
 * Whether the caller may see interviewer-only data (private notes, timestamps, rubric) of a
 * round: interviewers of an interview room see everything; a practice peer only sees the
 * round they interviewed.
 */
export function seesPrivateDataOf(
  membership: Pick<RoomMembership, 'participant'> & { role: RoomRole },
  round: Pick<SessionRoundRow, 'interviewerParticipantId'> | undefined,
): boolean {
  if (membership.participant.role === 'peer') {
    return !!round && round.interviewerParticipantId === membership.participant.id;
  }
  return isInterviewerRole(membership.role);
}

/** `?round=` as a round number within 1..rounds (default 1). */
export function parseRound(value: string | undefined, rounds: number): number {
  const n = Number(value ?? 1);
  return Number.isInteger(n) && n >= 1 && n <= Math.max(1, rounds) ? n : 1;
}
