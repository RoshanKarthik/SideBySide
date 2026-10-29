import { z } from 'zod';
import { langSchema } from './languages';
import { difficultySchema } from './questions';

export const PRACTICE_TOPICS = [
  'arrays',
  'strings',
  'trees',
  'graphs',
  'dynamic programming',
  'system design',
  'mixed',
] as const;
export const practiceTopicSchema = z.enum(PRACTICE_TOPICS);
export type PracticeTopic = z.infer<typeof practiceTopicSchema>;

export const practicePrefsSchema = z.object({
  topic: practiceTopicSchema,
  difficulty: difficultySchema,
  language: langSchema,
});
export type PracticePrefs = z.infer<typeof practicePrefsSchema>;

/** After this long in the queue, the topic is relaxed to "any topic" (same difficulty and language). */
export const PRACTICE_FALLBACK_MS = 45_000;
/** After this long, the page offers to keep waiting or practise solo. */
export const PRACTICE_GIVE_UP_HINT_MS = 120_000;
/**
 * Queue entries that stop polling for this long are dropped. Generous, because browsers can
 * slow a background tab's polling to about once a minute; closing the page leaves at once.
 */
export const PRACTICE_STALE_MS = 2 * 60_000;

export const queueStatusSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('idle') }),
  z.object({
    status: z.literal('waiting'),
    prefs: practicePrefsSchema,
    enqueuedAt: z.number(),
    /** Whether the topic has been relaxed to find a match. */
    relaxed: z.boolean(),
    /** How many people are waiting right now (including the caller). */
    waiting: z.number().int(),
  }),
  z.object({ status: z.literal('matched'), roomSlug: z.string(), partnerName: z.string() }),
]);
export type QueueStatus = z.infer<typeof queueStatusSchema>;

const score = z.number().int().min(1).max(5);
export const ratingInputSchema = z.object({
  problemSolving: score,
  communication: score,
  interviewing: score,
  comment: z.string().trim().max(1000).default(''),
});
export type RatingInput = z.input<typeof ratingInputSchema>;

export const practiceHistoryItemSchema = z.object({
  roomId: z.string(),
  slug: z.string(),
  title: z.string(),
  status: z.enum(['scheduled', 'live', 'ended']),
  partnerName: z.string(),
  createdAt: z.string(),
  /** The rating the caller gave, if any. */
  rated: z.boolean(),
});
export type PracticeHistoryItem = z.infer<typeof practiceHistoryItemSchema>;

export const practiceStatsSchema = z.object({
  sessions: z.number().int(),
  /** Averages of ratings received (only shown to the user themselves). */
  averages: z
    .object({
      problemSolving: z.number(),
      communication: z.number(),
      interviewing: z.number(),
      count: z.number().int(),
    })
    .nullable(),
  history: z.array(practiceHistoryItemSchema),
});
export type PracticeStats = z.infer<typeof practiceStatsSchema>;

export interface QueueEntry {
  userId: string;
  name: string;
  prefs: PracticePrefs;
  enqueuedAt: number;
  lastSeen: number;
}

/**
 * Picks a partner for `entry` from the waiting list: same difficulty and language, and the same
 * topic — unless either side has waited past the fallback, then any topic matches. Among
 * candidates, the one who has waited longest wins (fairness). Pure, so it is unit-tested.
 */
export function findPartner(
  entry: QueueEntry,
  waiting: readonly QueueEntry[],
  now: number,
): QueueEntry | null {
  const relaxed = (e: QueueEntry) => now - e.enqueuedAt >= PRACTICE_FALLBACK_MS;
  let best: QueueEntry | null = null;
  for (const other of waiting) {
    if (other.userId === entry.userId) continue;
    if (other.prefs.difficulty !== entry.prefs.difficulty) continue;
    if (other.prefs.language !== entry.prefs.language) continue;
    const topicOk =
      other.prefs.topic === entry.prefs.topic ||
      other.prefs.topic === 'mixed' ||
      entry.prefs.topic === 'mixed' ||
      relaxed(entry) ||
      relaxed(other);
    if (!topicOk) continue;
    if (!best || other.enqueuedAt < best.enqueuedAt) best = other;
  }
  return best;
}
