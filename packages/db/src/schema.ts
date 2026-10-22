import {
  DIFFICULTIES,
  LANGUAGES,
  REPORT_KINDS,
  REPORT_STATUSES,
  ROOM_MODES,
  ROOM_ROLES,
  ROOM_STATUSES,
  RUN_STATUSES,
  VISIBILITIES,
} from '@sidebyside/shared';
import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const id = () =>
  uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const languageEnum = pgEnum('language', LANGUAGES);
export const roomModeEnum = pgEnum('room_mode', ROOM_MODES);
export const roomStatusEnum = pgEnum('room_status', ROOM_STATUSES);
export const roomRoleEnum = pgEnum('room_role', ROOM_ROLES);
export const visibilityEnum = pgEnum('visibility', VISIBILITIES);
export const runKindEnum = pgEnum('run_kind', ['run', 'tests']);
export const runStatusEnum = pgEnum('run_status', RUN_STATUSES);
export const difficultyEnum = pgEnum('difficulty', DIFFICULTIES);
export const reportKindEnum = pgEnum('report_kind', REPORT_KINDS);
export const reportStatusEnum = pgEnum('report_status', REPORT_STATUSES);

// ---------------------------------------------------------------------------
// Auth (managed by Better Auth; property names are the ones Better Auth expects)
// ---------------------------------------------------------------------------

export const users = pgTable('users', {
  id: id(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  name: text('display_name').notNull(),
  image: text('avatar_url'),
  defaultLanguage: languageEnum('default_language').notNull().default('python'),
  lowBandwidth: boolean('low_bandwidth').notNull().default(false),
  /** Company branding shown to candidates on this interviewer's join pages and rooms. */
  companyName: text('company_name'),
  /** A small image as a data: URL (resized in the browser). */
  brandLogo: text('brand_logo'),
  brandColor: text('brand_color'),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('accounts_user_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: id(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);

// ---------------------------------------------------------------------------
// Rooms
// ---------------------------------------------------------------------------

export const rooms = pgTable(
  'rooms',
  {
    id: id(),
    slug: text('slug').notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    mode: roomModeEnum('mode').notNull().default('interview'),
    title: text('title').notNull(),
    status: roomStatusEnum('status').notNull().default('scheduled'),
    defaultLanguage: languageEnum('default_language').notNull().default('python'),
    shareReplayWithCandidate: boolean('share_replay_with_candidate').notNull().default(false),
    shareReportWithCandidate: boolean('share_report_with_candidate').notNull().default(false),
    retentionDays: integer('retention_days').notNull().default(30),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    deleteAfter: timestamp('delete_after', { withTimezone: true }),
    /** Secret in the co-interviewer invite link; rotate it to revoke old links. */
    coInterviewerToken: text('co_interviewer_token'),
    /** Practice rooms move to round 2 when the peers swap roles. */
    currentRound: integer('current_round').notNull().default(1),
    createdAt: createdAt(),
  },
  (t) => [
    index('rooms_owner_idx').on(t.ownerId),
    index('rooms_delete_after_idx').on(t.deleteAfter),
  ],
);

export const participants = pgTable(
  'participants',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** Null for guest candidates. */
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    displayName: text('display_name').notNull(),
    role: roomRoleEnum('role').notNull(),
    consentAcceptedAt: timestamp('consent_accepted_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).notNull().defaultNow(),
    leftAt: timestamp('left_at', { withTimezone: true }),
    /** SHA-256 of the token a guest candidate uses to attach this seat to an account later. */
    claimToken: text('claim_token'),
    createdAt: createdAt(),
  },
  (t) => [
    index('participants_room_idx').on(t.roomId),
    uniqueIndex('participants_room_user_idx')
      .on(t.roomId, t.userId)
      .where(sql`${t.userId} is not null`),
    uniqueIndex('participants_claim_token_idx')
      .on(t.claimToken)
      .where(sql`${t.claimToken} is not null`),
  ],
);

export const sessionRounds = pgTable(
  'session_rounds',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull(),
    interviewerParticipantId: uuid('interviewer_participant_id').references(() => participants.id, {
      onDelete: 'set null',
    }),
    candidateParticipantId: uuid('candidate_participant_id').references(() => participants.id, {
      onDelete: 'set null',
    }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('session_rounds_room_round_idx').on(t.roomId, t.roundNumber)],
);

// ---------------------------------------------------------------------------
// Event log (Yjs updates and snapshots live in each room's Durable Object storage)
// ---------------------------------------------------------------------------

export const events = pgTable(
  'events',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull().default(1),
    participantId: uuid('participant_id').references(() => participants.id, {
      onDelete: 'set null',
    }),
    type: text('type').notNull(),
    payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default({}),
    visibility: visibilityEnum('visibility').notNull().default('all'),
    serverTs: timestamp('server_ts', { withTimezone: true, precision: 3 }).notNull(),
  },
  (t) => [index('events_room_ts_idx').on(t.roomId, t.serverTs)],
);

export const codeRuns = pgTable(
  'code_runs',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    participantId: uuid('participant_id').references(() => participants.id, {
      onDelete: 'set null',
    }),
    language: languageEnum('language').notNull(),
    sourceCode: text('source_code').notNull(),
    stdin: text('stdin').notNull().default(''),
    kind: runKindEnum('kind').notNull().default('run'),
    questionId: uuid('question_id'),
    status: runStatusEnum('status').notNull(),
    stdout: text('stdout').notNull().default(''),
    stderr: text('stderr').notNull().default(''),
    compileOutput: text('compile_output'),
    exitCode: integer('exit_code'),
    timeMs: integer('time_ms'),
    memoryKb: integer('memory_kb'),
    testsPassed: integer('tests_passed'),
    testsTotal: integer('tests_total'),
    /** Weighted test score, 0–100. */
    score: integer('score'),
    details: jsonb('details'),
    serverTs: timestamp('server_ts', { withTimezone: true, precision: 3 }).notNull(),
  },
  (t) => [index('code_runs_room_ts_idx').on(t.roomId, t.serverTs)],
);

// ---------------------------------------------------------------------------
// Questions, tests and scoring
// ---------------------------------------------------------------------------

export const questions = pgTable(
  'questions',
  {
    id: id(),
    /** Null for the public practice bank. */
    ownerId: uuid('owner_id').references(() => users.id, { onDelete: 'cascade' }),
    /** Stable key for seeded public questions, so re-seeding updates instead of duplicating. */
    seedKey: text('seed_key').unique(),
    title: text('title').notNull(),
    descriptionMd: text('description_md').notNull().default(''),
    difficulty: difficultyEnum('difficulty').notNull().default('medium'),
    tags: text('tags').array().notNull().default([]),
    starterCode: jsonb('starter_code').$type<Record<string, string>>().notNull().default({}),
    hints: text('hints').array().notNull().default([]),
    isPublic: boolean('is_public').notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('questions_owner_idx').on(t.ownerId), index('questions_public_idx').on(t.isPublic)],
);

export const testCases = pgTable(
  'test_cases',
  {
    id: id(),
    questionId: uuid('question_id')
      .notNull()
      .references(() => questions.id, { onDelete: 'cascade' }),
    stdin: text('stdin').notNull().default(''),
    expectedStdout: text('expected_stdout').notNull().default(''),
    isHidden: boolean('is_hidden').notNull().default(false),
    weight: integer('weight').notNull().default(1),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index('test_cases_question_idx').on(t.questionId, t.sortOrder)],
);

export const roomQuestions = pgTable(
  'room_questions',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    /** Kept as null if the question is later deleted; the title below survives. */
    questionId: uuid('question_id').references(() => questions.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    roundNumber: integer('round_number').notNull().default(1),
    shownAt: timestamp('shown_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (t) => [index('room_questions_room_idx').on(t.roomId)],
);

export const rubricScores = pgTable(
  'rubric_scores',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull().default(1),
    criterion: text('criterion').notNull(),
    score: integer('score'),
    comment: text('comment').notNull().default(''),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('rubric_scores_room_criterion_idx').on(t.roomId, t.roundNumber, t.criterion)],
);

// ---------------------------------------------------------------------------
// Practice mode (the matchmaking queue itself lives in the Matchmaker Durable Object)
// ---------------------------------------------------------------------------

export const practiceRatings = pgTable(
  'practice_ratings',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    fromUserId: uuid('from_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    toUserId: uuid('to_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    problemSolving: integer('problem_solving').notNull(),
    communication: integer('communication').notNull(),
    interviewing: integer('interviewing').notNull(),
    comment: text('comment').notNull().default(''),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex('practice_ratings_room_from_idx').on(t.roomId, t.fromUserId),
    index('practice_ratings_to_idx').on(t.toUserId),
  ],
);

// ---------------------------------------------------------------------------
// AI post-interview reports (one interviewer and one candidate report per round)
// ---------------------------------------------------------------------------

export const sessionReports = pgTable(
  'session_reports',
  {
    id: id(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    roundNumber: integer('round_number').notNull().default(1),
    kind: reportKindEnum('kind').notNull(),
    status: reportStatusEnum('status').notNull().default('pending'),
    /** The validated report JSON (see `interviewerReportSchema` / `candidateReportSchema`). */
    content: jsonb('content').$type<Record<string, unknown>>(),
    error: text('error'),
    model: text('model'),
    generatedAt: timestamp('generated_at', { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex('session_reports_room_round_kind_idx').on(t.roomId, t.roundNumber, t.kind)],
);

export type UserRow = typeof users.$inferSelect;
export type RoomRow = typeof rooms.$inferSelect;
export type ParticipantRow = typeof participants.$inferSelect;
export type EventRow = typeof events.$inferSelect;
export type CodeRunRow = typeof codeRuns.$inferSelect;
export type QuestionRow = typeof questions.$inferSelect;
export type TestCaseRow = typeof testCases.$inferSelect;
export type SessionRoundRow = typeof sessionRounds.$inferSelect;
export type PracticeRatingRow = typeof practiceRatings.$inferSelect;
export type SessionReportRow = typeof sessionReports.$inferSelect;
