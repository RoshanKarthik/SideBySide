import { participants, rooms, sessionRounds, type Database } from '@sidebyside/db';
import type { PracticePrefs, QueueEntry } from '@sidebyside/shared';
import { randomSlug } from '../lib/slug';

const TITLE_CASE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/**
 * Creates a two-round practice room for a matched pair: `first` interviews in round 1 and
 * solves in round 2. Both are "peers"; their per-round role comes from session_rounds.
 */
export async function createPracticeRoom(
  db: Database,
  first: QueueEntry,
  second: QueueEntry,
  prefs: PracticePrefs,
): Promise<{ roomSlug: string; roomId: string }> {
  return db.transaction(async (tx) => {
    const [room] = await tx
      .insert(rooms)
      .values({
        slug: randomSlug(),
        ownerId: first.userId,
        mode: 'practice',
        title: `Practice · ${TITLE_CASE(prefs.topic)} · ${TITLE_CASE(prefs.difficulty)}`,
        defaultLanguage: prefs.language,
        // Both peers see both rounds' replays.
        shareReplayWithCandidate: true,
        retentionDays: 30,
      })
      .returning();
    if (!room) throw new Error('Practice room insert returned nothing');
    const [a, b] = await tx
      .insert(participants)
      .values(
        [first, second].map((u) => ({
          roomId: room.id,
          userId: u.userId,
          displayName: u.name,
          role: 'peer' as const,
          consentAcceptedAt: new Date(),
        })),
      )
      .returning();
    if (!a || !b) throw new Error('Practice participants insert failed');
    await tx.insert(sessionRounds).values([
      {
        roomId: room.id,
        roundNumber: 1,
        interviewerParticipantId: a.id,
        candidateParticipantId: b.id,
      },
      {
        roomId: room.id,
        roundNumber: 2,
        interviewerParticipantId: b.id,
        candidateParticipantId: a.id,
      },
    ]);
    return { roomSlug: room.slug, roomId: room.id };
  });
}
