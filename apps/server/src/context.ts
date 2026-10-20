import type { Database, DbHandle } from '@sidebyside/db';
import type { Lang } from '@sidebyside/shared';
import type { SharedProblem } from '@sidebyside/shared/doc';
import type { Auth } from './auth/auth';
import type { DocumentPart } from './auth/permissions';

/** What routes need from the outside world; tests swap these for in-memory versions. */
export interface AppDeps {
  openDb(env: Env): Promise<DbHandle>;
  room(env: Env, roomId: string, part?: DocumentPart): Promise<RoomRpc>;
}

export interface Actor {
  roomId: string;
  participantId: string;
}

/** The RPC surface of a room's Durable Object. */
export interface RoomRpc {
  end(): Promise<void>;
  getReplayLog(): Promise<Uint8Array>;
  showQuestion(
    actor: Actor,
    input: { problem: SharedProblem; starterCode: Partial<Record<Lang, string>> },
  ): Promise<void>;
  revealHint(actor: Actor, questionId: string, index: number, text: string): Promise<boolean>;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    auth: Auth;
  };
}
