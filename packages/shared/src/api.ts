import { z } from 'zod';
import { DEFAULT_RETENTION_DAYS, LIMITS, RETENTION_DAYS } from './constants';
import { langSchema } from './languages';
import { roomModeSchema, roomRoleSchema, roomStatusSchema } from './roles';

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

const displayName = z.string().trim().min(1).max(LIMITS.displayNameChars);

/** Logos are stored inline: small PNG, JPEG or WebP images, resized in the browser. */
export const BRAND_LOGO_MAX_CHARS = 120_000;
export const brandLogoSchema = z
  .string()
  .max(BRAND_LOGO_MAX_CHARS)
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/,
    'Must be a PNG, JPEG or WebP image',
  );
export const brandColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Must be a hex colour');

/** The company shown on an interviewer's join pages and rooms. */
export const brandSchema = z.object({
  companyName: z.string().trim().max(80).nullable(),
  logo: brandLogoSchema.nullable(),
  color: brandColorSchema.nullable(),
});
export type Brand = z.infer<typeof brandSchema>;

/** A brand with nothing set is no brand at all. */
export function brandOrNull(brand: Brand): Brand | null {
  return brand.companyName || brand.logo || brand.color ? brand : null;
}

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  defaultLanguage: langSchema,
  lowBandwidth: z.boolean(),
  brand: brandSchema,
});
export type Me = z.infer<typeof meSchema>;

export const patchMeSchema = z
  .object({
    displayName,
    defaultLanguage: langSchema,
    lowBandwidth: z.boolean(),
    brand: brandSchema.partial(),
  })
  .partial();
export type PatchMe = z.infer<typeof patchMeSchema>;

export const retentionDaysSchema = z
  .number()
  .int()
  .refine((d) => (RETENTION_DAYS as readonly number[]).includes(d), 'Must be 7, 30 or 90');

export const createRoomSchema = z.object({
  title: z.string().trim().min(1).max(LIMITS.roomTitleChars),
  defaultLanguage: langSchema,
  shareReplayWithCandidate: z.boolean().default(false),
  shareReportWithCandidate: z.boolean().default(false),
  retentionDays: retentionDaysSchema.default(DEFAULT_RETENTION_DAYS),
});
export type CreateRoomInput = z.input<typeof createRoomSchema>;

export const roomSchema = z.object({
  id: z.string(),
  slug: z.string(),
  mode: roomModeSchema,
  title: z.string(),
  status: roomStatusSchema,
  defaultLanguage: langSchema,
  shareReplayWithCandidate: z.boolean(),
  shareReportWithCandidate: z.boolean(),
  retentionDays: z.number().int(),
  createdAt: z.string(),
  startedAt: z.string().nullable(),
  endedAt: z.string().nullable(),
  /** Practice rooms have two rounds with the roles swapped; interview rooms always have one. */
  currentRound: z.number().int().min(1),
});
export type Room = z.infer<typeof roomSchema>;

export const roomListItemSchema = roomSchema.extend({
  myRole: roomRoleSchema,
  /** The first candidate who joined (interview rooms) or the practice partner. */
  candidateName: z.string().nullable(),
  /** Score of the latest test run in the room, 0–100. */
  score: z.number().int().nullable(),
  testsPassed: z.number().int().nullable(),
  testsTotal: z.number().int().nullable(),
});
export type RoomListItem = z.infer<typeof roomListItemSchema>;

export const createRoomResponseSchema = z.object({ room: roomSchema, link: z.string() });
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

export const publicRoomSchema = z.object({
  title: z.string(),
  ownerName: z.string(),
  status: roomStatusSchema,
  brand: brandSchema.nullable(),
});
export type PublicRoom = z.infer<typeof publicRoomSchema>;

export const joinRoomSchema = z.object({
  displayName: displayName.optional(),
  consent: z.literal(true, { error: 'You must accept the recording notice to join' }),
});
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;

export const participantSchema = z.object({
  id: z.string(),
  displayName: z.string(),
  role: roomRoleSchema,
});
export type Participant = z.infer<typeof participantSchema>;

export const joinRoomResponseSchema = z.object({
  room: roomSchema,
  participant: participantSchema,
  /** Room-scoped token for guests; registered users authenticate with their session cookie. */
  collabToken: z.string().nullable(),
  /** The room owner's company, shown in the room. */
  brand: brandSchema.nullable(),
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

/** A guest candidate's secret for attaching their seat in an ended session to an account. */
export const claimTokenResponseSchema = z.object({ claimToken: z.string() });
export type ClaimTokenResponse = z.infer<typeof claimTokenResponseSchema>;

export const claimSessionSchema = z.object({ claimToken: z.string().min(1).max(200) });
export type ClaimSessionInput = z.infer<typeof claimSessionSchema>;

export const claimSessionResponseSchema = z.object({ room: roomSchema });
export type ClaimSessionResponse = z.infer<typeof claimSessionResponseSchema>;

export const REPLAY_MARKER_KINDS = [
  'code_run',
  'tests_run',
  'question_shown',
  'hint_revealed',
  'paste',
  'tab_hidden',
  'window_blur',
  'note_timestamp',
] as const;
export const replayMarkerKindSchema = z.enum(REPLAY_MARKER_KINDS);
export type ReplayMarkerKind = z.infer<typeof replayMarkerKindSchema>;

export const replayMarkerSchema = z.object({
  ts: z.number(),
  kind: replayMarkerKindSchema,
  /** Colour hint: ok (green), error (red), info (accent), signal (amber). */
  tone: z.enum(['ok', 'error', 'info', 'signal']),
  label: z.string(),
});
export type ReplayMarker = z.infer<typeof replayMarkerSchema>;

export const replayManifestSchema = z.object({
  room: roomSchema,
  round: z.number().int(),
  rounds: z.number().int(),
  startTs: z.number(),
  endTs: z.number(),
  markers: z.array(replayMarkerSchema),
  /** Display names by participant id, to label who made each change. */
  people: z.record(z.string(), z.string()),
});
export type ReplayManifest = z.infer<typeof replayManifestSchema>;

// ---------------------------------------------------------------------------
// Session summary (the page an interviewer sees after a session)
// ---------------------------------------------------------------------------

export const sessionSummarySchema = z.object({
  room: roomSchema,
  myRole: roomRoleSchema,
  durationMs: z.number().int().nonnegative(),
  participants: z.array(
    z.object({
      id: z.string(),
      displayName: z.string(),
      role: roomRoleSchema,
      joinedAt: z.string(),
      isGuest: z.boolean(),
    }),
  ),
  rounds: z.array(
    z.object({
      roundNumber: z.number().int(),
      interviewer: z.string().nullable(),
      candidate: z.string().nullable(),
      /** Whether the caller interviewed in this round (rubric and private data are theirs). */
      mine: z.boolean(),
      questions: z.array(z.object({ questionId: z.string(), title: z.string(), ts: z.number() })),
      hintsRevealed: z.number().int(),
      runs: z.object({ total: z.number().int(), ok: z.number().int(), failed: z.number().int() }),
      tests: z.array(
        z.object({
          ts: z.number(),
          passed: z.number().int(),
          total: z.number().int(),
          score: z.number().int().nullable(),
          language: langSchema,
        }),
      ),
      /** Present only for rounds the caller interviewed. */
      rubric: z
        .array(
          z.object({
            criterion: z.string(),
            score: z.number().int().nullable(),
            comment: z.string(),
          }),
        )
        .nullable(),
      signals: z.object({
        pastes: z.number().int(),
        pastedChars: z.number().int(),
        largeInserts: z.number().int(),
        tabHidden: z.number().int(),
        hiddenMs: z.number().int(),
        windowBlur: z.number().int(),
        awayMs: z.number().int(),
      }),
    }),
  ),
  canDelete: z.boolean(),
  canViewReplay: z.boolean(),
});
export type SessionSummary = z.infer<typeof sessionSummarySchema>;
