import type { Database, DbHandle } from '@sidebyside/db';
import type { Auth } from './auth/auth';

/** What routes need from the outside world; tests swap these for in-memory versions. */
export interface AppDeps {
  openDb(env: Env): Promise<DbHandle>;
  room(env: Env, roomId: string): Promise<RoomRpc>;
}

/** The RPC surface of a room's Durable Object. */
export interface RoomRpc {
  end(): Promise<void>;
  getReplayLog(): Promise<Uint8Array>;
}

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    auth: Auth;
  };
}
