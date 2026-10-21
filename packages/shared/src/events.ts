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
  round_started: z.object({
    roundNumber: z.number().int().min(1),
    interviewerName: z.string(),
    candidateName: z.string(),
  }),
  // Integrity signals: reported by each participant's own browser, shown to everyone.
  paste: z.object({
    chars: z.number().int().nonnegative().max(10_000_000),
    preview: z.string().max(200),
    target: z.enum(['code', 'notes']),
  }),
  large_insert: z.object({
    chars: z.number().int().nonnegative().max(10_000_000),
    target: z.enum(['code', 'notes']),
  }),
  tab_hidden: z.object({}),
  tab_visible: z.object({ hiddenMs: z.number().int().nonnegative().max(86_400_000) }),
  window_blur: z.object({}),
  window_focus: z.object({ awayMs: z.number().int().nonnegative().max(86_400_000) }),
} satisfies Partial<Record<EventType, z.ZodType>>;

/** Signals the transparency feed shows. Signals, never verdicts. */
export const INTEGRITY_EVENT_TYPES = [
  'paste',
  'large_insert',
  'tab_hidden',
  'tab_visible',
  'window_blur',
  'window_focus',
] as const satisfies readonly EventType[];
export type IntegrityEventType = (typeof INTEGRITY_EVENT_TYPES)[number];

export function isIntegrityEvent(type: string): type is IntegrityEventType {
  return (INTEGRITY_EVENT_TYPES as readonly string[]).includes(type);
}

/** Event types a client may send itself; everything else is produced by the server. */
export const CLIENT_EVENT_TYPES = [
  'tab_changed',
  'language_changed',
  'note_timestamp',
  ...INTEGRITY_EVENT_TYPES,
] as const;
const clientEvent = <T extends keyof typeof EVENT_PAYLOAD_SCHEMAS>(type: T) =>
  z.object({ type: z.literal(type), payload: EVENT_PAYLOAD_SCHEMAS[type] });
export const clientEventSchema = z.discriminatedUnion('type', [
  clientEvent('tab_changed'),
  clientEvent('language_changed'),
  // Only accepted on the interviewers' private document.
  clientEvent('note_timestamp'),
  clientEvent('paste'),
  clientEvent('large_insert'),
  clientEvent('tab_hidden'),
  clientEvent('tab_visible'),
  clientEvent('window_blur'),
  clientEvent('window_focus'),
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
