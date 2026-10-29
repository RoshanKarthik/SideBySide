import type { Database, DbHandle } from '@sidebyside/db';
import type { BoardFile, Lang, PracticePrefs, QueueStatus } from '@sidebyside/shared';
import type { SharedProblem } from '@sidebyside/shared/doc';
import type { Auth } from './auth/auth';
import type { DocumentPart } from './auth/permissions';
import type { ExecutionProvider } from './exec/provider';

/** What routes need from the outside world; tests swap these for in-memory versions. */
export interface AppDeps {
  openDb(env: Env): Promise<DbHandle>;
  room(env: Env, roomId: string, part?: DocumentPart, round?: number): Promise<RoomRpc>;
  matchmaker(env: Env): Promise<MatchmakerRpc>;
  /** The server-side code runner for compiled languages, or null when it is turned off. */
  execution(env: Env): ExecutionProvider | null;
}

export interface Actor {
  roomId: string;
  participantId: string;
}

/** The RPC surface of a room's Durable Object. */
export interface RoomRpc {
  end(): Promise<void>;
  closeRound(nextRound: number): Promise<void>;
  purge(): Promise<void>;
  getReplayLog(): Promise<Uint8Array>;
  showQuestion(
    actor: Actor,
    input: { problem: SharedProblem; starterCode: Partial<Record<Lang, string>> },
  ): Promise<void>;
  revealHint(actor: Actor, questionId: string, index: number, text: string): Promise<boolean>;
  /** Writes the round's AI reports in the background (shared document only). */
  generateReports(): Promise<void>;
  /**
   * Stores a whiteboard image once in this document; board elements reference it by id. Locked
   * rooms take images only from interviewers (`fromInterviewer`).
   */
  putBoardFile(file: BoardFile, fromInterviewer: boolean): Promise<BoardFileResult>;
  getBoardFile(id: string): Promise<BoardFile | null>;
  /** Whether this participant may run code on the server now (live room, per-minute limit). */
  allowExecution(participantId: string): Promise<'ok' | 'ended' | 'limited'>;
}

export type BoardFileResult = 'stored' | 'ended' | 'locked' | 'full';

export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Database;
    auth: Auth;
  };
}

/** The RPC surface of the practice Matchmaker Durable Object. */
export interface MatchmakerRpc {
  enqueue(user: { id: string; name: string }, prefs: PracticePrefs): Promise<QueueStatus>;
  status(userId: string): Promise<QueueStatus>;
  leave(userId: string): Promise<void>;
}
