import type { Lang, RoomRole } from '@sidebyside/shared';

/** Set by the Worker after authorising a socket; never trusted from clients. */
export const CONNECTION_HEADER = 'x-sbs-connection';

export interface ConnectionInfo {
  roomId: string;
  participantId: string;
  role: RoomRole;
  displayName: string;
  defaultLanguage: Lang;
}

/** WebSocket close codes the client understands. */
export const CLOSE_CODES = {
  sessionEnded: 4000,
  unauthorized: 4401,
} as const;
