import type { Lang, RoomRole } from '@sidebyside/shared';

/** Set by the Worker after authorising a socket; never trusted from clients. */
export const CONNECTION_HEADER = 'x-sbs-connection';

export interface ConnectionInfo {
  roomId: string;
  participantId: string;
  /** Effective role for this round (practice peers are interviewer or candidate). */
  role: RoomRole;
  displayName: string;
  defaultLanguage: Lang;
  round: number;
}

/** WebSocket close codes the client understands. */
export const CLOSE_CODES = {
  sessionEnded: 4000,
  /** A practice room moved to its next round; reconnect to the new round's documents. */
  roundChanged: 4001,
  unauthorized: 4401,
} as const;
