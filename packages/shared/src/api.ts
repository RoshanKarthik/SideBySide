import { z } from 'zod';
import { DEFAULT_RETENTION_DAYS, LIMITS, RETENTION_DAYS } from './constants';
import { runStatusSchema } from './events';
import { langSchema } from './languages';
import { roomModeSchema, roomRoleSchema, roomStatusSchema } from './roles';

export const apiErrorSchema = z.object({
  error: z.object({ code: z.string(), message: z.string() }),
});
export type ApiError = z.infer<typeof apiErrorSchema>;

const displayName = z.string().trim().min(1).max(LIMITS.displayNameChars);

export const meSchema = z.object({
  id: z.string(),
  email: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  defaultLanguage: langSchema,
  lowBandwidth: z.boolean(),
});
export type Me = z.infer<typeof meSchema>;

export const patchMeSchema = z
  .object({
    displayName,
    defaultLanguage: langSchema,
    lowBandwidth: z.boolean(),
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
});
export type Room = z.infer<typeof roomSchema>;

export const roomListItemSchema = roomSchema.extend({ myRole: roomRoleSchema });
export type RoomListItem = z.infer<typeof roomListItemSchema>;

export const createRoomResponseSchema = z.object({ room: roomSchema, link: z.string() });
export type CreateRoomResponse = z.infer<typeof createRoomResponseSchema>;

export const publicRoomSchema = z.object({
  title: z.string(),
  ownerName: z.string(),
  status: roomStatusSchema,
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
});
export type JoinRoomResponse = z.infer<typeof joinRoomResponseSchema>;

export const replayMarkerSchema = z.object({
  ts: z.number(),
  kind: z.literal('code_run'),
  status: runStatusSchema,
  label: z.string(),
});
export type ReplayMarker = z.infer<typeof replayMarkerSchema>;

export const replayManifestSchema = z.object({
  room: roomSchema,
  startTs: z.number(),
  endTs: z.number(),
  markers: z.array(replayMarkerSchema),
});
export type ReplayManifest = z.infer<typeof replayManifestSchema>;
