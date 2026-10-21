import { connectDb } from '@sidebyside/db';
import type { PracticePrefs, QueueStatus } from '@sidebyside/shared';
import { DurableObject } from 'cloudflare:workers';
import { MatchQueue, type QueueSnapshot } from './queue';
import { createPracticeRoom } from './rooms';

const SWEEP_EVERY_MS = 5_000;
const STORAGE_KEY = 'queue';

/**
 * One global instance holds the practice queue. A single Durable Object serialises every
 * enqueue and match, so there are no races between two people being matched at once, and
 * waiting costs nothing when nobody is in the queue (no alarms are scheduled then).
 */
export class Matchmaker extends DurableObject<Env> {
  private queue = new MatchQueue(async (first, second, prefs) => {
    const handle = await connectDb(this.env.HYPERDRIVE.connectionString);
    try {
      return await createPracticeRoom(handle.db, first, second, prefs);
    } finally {
      await handle.close().catch(() => {});
    }
  });

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(async () => {
      this.queue.restore(await ctx.storage.get<QueueSnapshot>(STORAGE_KEY));
    });
  }

  async enqueue(user: { id: string; name: string }, prefs: PracticePrefs): Promise<QueueStatus> {
    const status = await this.queue.enqueue(user, prefs);
    await this.save();
    return status;
  }

  async status(userId: string): Promise<QueueStatus> {
    const status = this.queue.status(userId);
    if (status.status === 'waiting') await this.save();
    return status;
  }

  async leave(userId: string): Promise<void> {
    this.queue.leave(userId);
    await this.save();
  }

  /** Retries matching (the topic fallback kicks in over time) and drops people who left. */
  override async alarm(): Promise<void> {
    await this.queue.sweep();
    await this.save();
  }

  private async save() {
    await this.ctx.storage.put(STORAGE_KEY, this.queue.snapshot());
    if (this.queue.waitingCount > 0 && (await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + SWEEP_EVERY_MS);
    }
  }
}
