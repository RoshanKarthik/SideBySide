export const LIMITS = {
  sourceBytes: 64 * 1024,
  stdinBytes: 64 * 1024,
  outputBytes: 64 * 1024,
  displayNameChars: 60,
  roomTitleChars: 120,
  eventPreviewChars: 200,
  /** Wall-clock limit for one in-browser run, after the runtime has loaded. */
  runTimeoutMs: 10_000,
  /** Code runs a participant may record per minute. */
  runsPerMinute: 10,
  /** Code runs a room may record per session. */
  runsPerRoom: 300,
} as const;

export const RETENTION_DAYS = [7, 30, 90] as const;
export const DEFAULT_RETENTION_DAYS = 30;

export const GUEST_TOKEN_TTL_SECONDS = 12 * 60 * 60;

export const ROOM_SLUG_LENGTH = 10;

/** How often (session time) the room writes a full Yjs snapshot for replay seeking. */
export const SNAPSHOT_INTERVAL_MS = 60_000;

export const CONSENT_NOTICE =
  'This room records edits, code runs, pastes and tab switches so the session can be replayed. ' +
  'Everyone in the room can see these signals.';
