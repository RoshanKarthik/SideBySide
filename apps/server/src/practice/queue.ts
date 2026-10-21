import {
  PRACTICE_FALLBACK_MS,
  PRACTICE_STALE_MS,
  findPartner,
  type PracticePrefs,
  type QueueEntry,
  type QueueStatus,
} from '@sidebyside/shared';

export interface MatchResult {
  roomSlug: string;
}

/** How long a match stays readable by the matched users' polls. */
const MATCH_TTL_MS = 10 * 60_000;

export interface QueueSnapshot {
  waiting: QueueEntry[];
  matched: [string, { roomSlug: string; partnerName: string; at: number }][];
}

/**
 * The practice matchmaking queue. All state changes happen synchronously before any await,
 * so two requests can never match the same person twice, even though the Durable Object
 * that hosts this lets other requests in while it waits on Postgres.
 */
export class MatchQueue {
  private waiting = new Map<string, QueueEntry>();
  private matched = new Map<string, { roomSlug: string; partnerName: string; at: number }>();
  /** Claimed by a match whose room is still being created; they still poll as waiting. */
  private pairing = new Map<string, QueueEntry>();

  constructor(
    private readonly createRoom: (
      first: QueueEntry,
      second: QueueEntry,
      prefs: PracticePrefs,
    ) => Promise<MatchResult>,
  ) {}

  restore(snapshot: QueueSnapshot | undefined) {
    if (!snapshot) return;
    this.waiting = new Map(snapshot.waiting.map((e) => [e.userId, e]));
    this.matched = new Map(snapshot.matched);
  }

  snapshot(): QueueSnapshot {
    return { waiting: [...this.waiting.values()], matched: [...this.matched] };
  }

  get waitingCount() {
    return this.waiting.size;
  }

  async enqueue(user: { id: string; name: string }, prefs: PracticePrefs, now = Date.now()) {
    this.matched.delete(user.id);
    const existing = this.waiting.get(user.id);
    const samePrefs =
      existing &&
      existing.prefs.topic === prefs.topic &&
      existing.prefs.difficulty === prefs.difficulty &&
      existing.prefs.language === prefs.language;
    const entry: QueueEntry = {
      userId: user.id,
      name: user.name,
      prefs,
      // Changing preferences starts the wait (and the topic fallback) over.
      enqueuedAt: samePrefs ? existing.enqueuedAt : now,
      lastSeen: now,
    };
    this.waiting.set(user.id, entry);
    await this.tryMatch(entry, now);
    return this.status(user.id, now);
  }

  /** Also a heartbeat: polling keeps the caller in the queue. */
  status(userId: string, now = Date.now()): QueueStatus {
    const match = this.matched.get(userId);
    if (match)
      return { status: 'matched', roomSlug: match.roomSlug, partnerName: match.partnerName };
    const entry = this.waiting.get(userId) ?? this.pairing.get(userId);
    if (!entry) return { status: 'idle' };
    entry.lastSeen = now;
    return {
      status: 'waiting',
      prefs: entry.prefs,
      enqueuedAt: entry.enqueuedAt,
      relaxed: now - entry.enqueuedAt >= PRACTICE_FALLBACK_MS,
      waiting: this.waiting.size,
    };
  }

  leave(userId: string) {
    this.waiting.delete(userId);
    this.pairing.delete(userId);
    this.matched.delete(userId);
  }

  /** Drops people who stopped polling and old matches, then retries matching (oldest first). */
  async sweep(now = Date.now()) {
    for (const [id, e] of this.waiting) {
      if (now - e.lastSeen > PRACTICE_STALE_MS) this.waiting.delete(id);
    }
    for (const [id, m] of this.matched) {
      if (now - m.at > MATCH_TTL_MS) this.matched.delete(id);
    }
    const byAge = [...this.waiting.values()].sort((a, b) => a.enqueuedAt - b.enqueuedAt);
    for (const entry of byAge) {
      if (this.waiting.has(entry.userId)) await this.tryMatch(entry, now);
    }
  }

  private async tryMatch(entry: QueueEntry, now: number): Promise<boolean> {
    const partner = findPartner(entry, [...this.waiting.values()], now);
    if (!partner) return false;
    // Claim both before awaiting anything.
    this.waiting.delete(entry.userId);
    this.waiting.delete(partner.userId);
    this.pairing.set(entry.userId, entry);
    this.pairing.set(partner.userId, partner);
    // The one who waited longer interviews first; the topic is theirs unless it was "mixed".
    const [first, second] =
      partner.enqueuedAt <= entry.enqueuedAt ? [partner, entry] : [entry, partner];
    const prefs: PracticePrefs = {
      ...first.prefs,
      topic: first.prefs.topic === 'mixed' ? second.prefs.topic : first.prefs.topic,
    };
    try {
      const { roomSlug } = await this.createRoom(first, second, prefs);
      this.pairing.delete(first.userId);
      this.pairing.delete(second.userId);
      this.matched.set(first.userId, { roomSlug, partnerName: second.name, at: now });
      this.matched.set(second.userId, { roomSlug, partnerName: first.name, at: now });
      return true;
    } catch (err) {
      // Put them back so the next poll or sweep can try again.
      this.pairing.delete(first.userId);
      this.pairing.delete(second.userId);
      this.waiting.set(first.userId, first);
      this.waiting.set(second.userId, second);
      console.error('Could not create practice room', err);
      return false;
    }
  }
}
