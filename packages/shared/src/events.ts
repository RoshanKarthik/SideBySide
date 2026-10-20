import { z } from 'zod';
import { langSchema } from './languages';
import type { Visibility } from './roles';

export const EVENT_TYPES = [
  'participant_joined',
  'participant_left',
  'tab_changed',
  'language_changed',
  'question_shown',
  'hint_revealed',
  'code_run',
  'tests_run',
  'paste',
  'large_insert',
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
  'editor_locked',
  'editor_unlocked',
  'note_timestamp',
  'round_started',
  'session_ended',
] as const;
export const eventTypeSchema = z.enum(EVENT_TYPES);
export type EventType = z.infer<typeof eventTypeSchema>;

export const ROOM_TABS = ['discuss', 'code', 'design'] as const;
export const roomTabSchema = z.enum(ROOM_TABS);
export type RoomTab = z.infer<typeof roomTabSchema>;

export const RUN_STATUSES = ['ok', 'error', 'timeout', 'unsupported'] as const;
export const runStatusSchema = z.enum(RUN_STATUSES);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const codeRunPayloadSchema = z.object({
  runId: z.string(),
  language: langSchema,
  status: runStatusSchema,
  timeMs: z.number().int().nonnegative(),
  memoryKb: z.number().int().nonnegative().nullable(),
  stdoutPreview: z.string(),
});

export const EVENT_PAYLOAD_SCHEMAS = {
  participant_joined: z.object({ displayName: z.string() }),
  participant_left: z.object({ displayName: z.string() }),
  tab_changed: z.object({ tab: roomTabSchema }),
  language_changed: z.object({ from: langSchema, to: langSchema }),
  code_run: codeRunPayloadSchema,
  session_ended: z.object({}),
  question_shown: z.object({ questionId: z.string(), title: z.string() }),
  hint_revealed: z.object({ questionId: z.string(), hintIndex: z.number().int() }),
  tests_run: z.object({
    questionId: z.string(),
    language: langSchema,
    passed: z.number().int(),
    total: z.number().int(),
  }),
  editor_locked: z.object({}),
  editor_unlocked: z.object({}),
  note_timestamp: z.object({ offsetMs: z.number().int().nonnegative(), text: z.string().max(200) }),
} satisfies Partial<Record<EventType, z.ZodType>>;

/** Event types a client may send itself; everything else is produced by the server. */
export const CLIENT_EVENT_TYPES = ['tab_changed', 'language_changed', 'note_timestamp'] as const;
export const clientEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('tab_changed'), payload: EVENT_PAYLOAD_SCHEMAS.tab_changed }),
  z.object({
    type: z.literal('language_changed'),
    payload: EVENT_PAYLOAD_SCHEMAS.language_changed,
  }),
  // Only accepted on the interviewers' private document.
  z.object({ type: z.literal('note_timestamp'), payload: EVENT_PAYLOAD_SCHEMAS.note_timestamp }),
]);
export type ClientEvent = z.infer<typeof clientEventSchema>;

const INTERVIEWER_ONLY: ReadonlySet<EventType> = new Set(['note_timestamp']);

export function eventVisibility(type: EventType): Visibility {
  return INTERVIEWER_ONLY.has(type) ? 'interviewers' : 'all';
}

export const roomEventSchema = z.object({
  id: z.string(),
  type: eventTypeSchema,
  participantId: z.string().nullable(),
  payload: z.record(z.string(), z.unknown()),
  serverTs: z.number(),
});
export type RoomEvent = z.infer<typeof roomEventSchema>;
