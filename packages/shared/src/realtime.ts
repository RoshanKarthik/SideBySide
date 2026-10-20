import { z } from 'zod';
import { LIMITS } from './constants';
import { clientEventSchema, roomEventSchema, runStatusSchema } from './events';
import { langSchema } from './languages';
import { testOutcomeSchema, testRunSchema } from './questions';

/** Output of one run, produced by the in-browser runner. */
export const runOutputSchema = z.object({
  status: runStatusSchema,
  stdout: z.string().max(LIMITS.outputBytes + 200),
  stderr: z.string().max(LIMITS.outputBytes + 200),
  exitCode: z.number().int().nullable(),
  timeMs: z.number().int().nonnegative(),
  memoryKb: z.number().int().nonnegative().nullable(),
});
export type RunOutput = z.infer<typeof runOutputSchema>;

export const runRecordSchema = runOutputSchema.extend({
  runId: z.string().min(1).max(64),
  language: langSchema,
  source: z.string().max(LIMITS.sourceBytes),
  stdin: z.string().max(LIMITS.stdinBytes),
});
export type RunRecord = z.infer<typeof runRecordSchema>;

/** Custom messages a client sends to the room over the collaboration socket. */
export const clientMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: clientEventSchema }),
  z.object({ kind: z.literal('code_run'), run: runRecordSchema }),
  /** Interviewers only: make the room read-only for candidates. */
  z.object({ kind: z.literal('set_lock'), locked: z.boolean() }),
  /** Anyone: ask an interviewer's browser to run the active question's tests. */
  z.object({
    kind: z.literal('run_tests'),
    requestId: z.string().min(1).max(64),
    questionId: z.string(),
    language: langSchema,
  }),
  /** Interviewers only: the outcome of a run_tests request their browser carried out. */
  z.object({
    kind: z.literal('tests_result'),
    requestId: z.string().min(1).max(64),
    source: z.string().max(LIMITS.sourceBytes),
    outcomes: z.array(testOutcomeSchema).max(50),
  }),
]);
export type ClientMessage = z.infer<typeof clientMessageSchema>;

export const sharedRunSchema = runOutputSchema.extend({
  runId: z.string(),
  language: langSchema,
  participantId: z.string(),
  displayName: z.string(),
  serverTs: z.number(),
});
export type SharedRun = z.infer<typeof sharedRunSchema>;

/** Custom messages the room sends to clients. */
export const serverMessageSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), event: roomEventSchema }),
  z.object({ kind: z.literal('run_result'), run: sharedRunSchema }),
  z.object({ kind: z.literal('session_ended') }),
  z.object({ kind: z.literal('lock_state'), locked: z.boolean() }),
  /** Sent to one interviewer: run the tests for this request in your browser. */
  z.object({
    kind: z.literal('tests_requested'),
    requestId: z.string(),
    questionId: z.string(),
    language: langSchema,
    requestedByName: z.string(),
  }),
  /** Results, already filtered for the receiving participant's role. */
  z.object({ kind: z.literal('tests_result'), run: testRunSchema }),
  z.object({ kind: z.literal('tests_failed'), requestId: z.string(), message: z.string() }),
  z.object({ kind: z.literal('error'), code: z.string(), message: z.string() }),
]);
export type ServerMessage = z.infer<typeof serverMessageSchema>;

/** Awareness state each client publishes. */
export interface PresenceState {
  user: {
    participantId: string;
    name: string;
    color: string;
    role: string;
  };
  tab: 'discuss' | 'code' | 'design';
}
