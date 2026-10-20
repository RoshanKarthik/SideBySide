import { desc, eq, or, questions, testCases, type Database } from '@sidebyside/db';
import {
  questionInputSchema,
  type Question,
  type QuestionInput,
  type QuestionSummary,
} from '@sidebyside/shared';
import { Hono, type Context } from 'hono';
import { getSessionUser } from '../auth/identity';
import { isUuid } from '../auth/identity';
import type { AppEnv } from '../context';
import { forbidden, notFound, unauthorized } from '../lib/errors';
import {
  canEditQuestion,
  canUseQuestion,
  findQuestion,
  loadTests,
  toQuestion,
  toSummary,
} from '../lib/questions';
import { parseBody } from '../lib/validate';
import type { z } from 'zod';

type ParsedQuestion = z.output<typeof questionInputSchema>;

async function requireUser(c: Context<AppEnv>) {
  const user = await getSessionUser(c.var.auth, c.req.raw.headers);
  if (!user) throw unauthorized();
  return user;
}

async function requireQuestion(c: Context<AppEnv>, id: string) {
  const q = isUuid(id) ? await findQuestion(c.var.db, id) : null;
  if (!q) throw notFound('Question not found');
  return q;
}

async function writeTests(db: Database, questionId: string, input: ParsedQuestion['testCases']) {
  await db.delete(testCases).where(eq(testCases.questionId, questionId));
  if (input.length) {
    await db.insert(testCases).values(input.map((t, i) => ({ questionId, ...t, sortOrder: i })));
  }
}

function columns(input: ParsedQuestion) {
  return {
    title: input.title,
    descriptionMd: input.descriptionMd,
    difficulty: input.difficulty,
    tags: input.tags,
    starterCode: input.starterCode,
    hints: input.hints,
  };
}

export function questionRoutes() {
  const app = new Hono<AppEnv>();

  /** `?scope=mine|public` (default: both). */
  app.get('/questions', async (c) => {
    const user = await requireUser(c);
    const scope = c.req.query('scope');
    const where =
      scope === 'mine'
        ? eq(questions.ownerId, user.id)
        : scope === 'public'
          ? eq(questions.isPublic, true)
          : or(eq(questions.ownerId, user.id), eq(questions.isPublic, true));
    const rows = await c.var.db
      .select()
      .from(questions)
      .where(where)
      .orderBy(desc(questions.isPublic), questions.title)
      .limit(500);
    const tests = await loadTests(
      c.var.db,
      rows.map((r) => r.id),
    );
    const body: QuestionSummary[] = rows.map((q) => toSummary(q, tests, user.id));
    return c.json(body);
  });

  app.get('/questions/:id', async (c) => {
    const user = await requireUser(c);
    const q = await requireQuestion(c, c.req.param('id'));
    if (!canUseQuestion(q, user.id)) throw notFound('Question not found');
    const tests = await loadTests(c.var.db, [q.id]);
    // Hidden test contents only for the owner; public-bank questions show visible tests only.
    const body: Question = toQuestion(q, tests, user.id, canEditQuestion(q, user.id));
    return c.json(body);
  });

  app.post('/questions', async (c) => {
    const user = await requireUser(c);
    const input = parseBody(questionInputSchema, await c.req.json().catch(() => null));
    const id = await c.var.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(questions)
        .values({ ...columns(input), ownerId: user.id, isPublic: false })
        .returning({ id: questions.id });
      await writeTests(tx as unknown as Database, row!.id, input.testCases);
      return row!.id;
    });
    const q = (await findQuestion(c.var.db, id))!;
    return c.json(toQuestion(q, await loadTests(c.var.db, [id]), user.id, true), 201);
  });

  app.patch('/questions/:id', async (c) => {
    const user = await requireUser(c);
    const q = await requireQuestion(c, c.req.param('id'));
    if (!canEditQuestion(q, user.id)) throw forbidden('You can only edit your own questions');
    const input = parseBody(questionInputSchema, await c.req.json().catch(() => null));
    await c.var.db.transaction(async (tx) => {
      await tx.update(questions).set(columns(input)).where(eq(questions.id, q.id));
      await writeTests(tx as unknown as Database, q.id, input.testCases);
    });
    const updated = (await findQuestion(c.var.db, q.id))!;
    return c.json(toQuestion(updated, await loadTests(c.var.db, [q.id]), user.id, true));
  });

  app.delete('/questions/:id', async (c) => {
    const user = await requireUser(c);
    const q = await requireQuestion(c, c.req.param('id'));
    if (!canEditQuestion(q, user.id)) throw forbidden('You can only delete your own questions');
    await c.var.db.delete(questions).where(eq(questions.id, q.id));
    return c.body(null, 204);
  });

  /** Copies a public (or your own) question, with all its tests, into your bank. */
  app.post('/questions/:id/duplicate', async (c) => {
    const user = await requireUser(c);
    const q = await requireQuestion(c, c.req.param('id'));
    if (!canUseQuestion(q, user.id)) throw notFound('Question not found');
    const tests = await loadTests(c.var.db, [q.id]);
    const input: QuestionInput = {
      title: q.ownerId === user.id ? `${q.title} (copy)` : q.title,
      descriptionMd: q.descriptionMd,
      difficulty: q.difficulty,
      tags: q.tags,
      starterCode: q.starterCode,
      hints: q.hints,
      testCases: tests.map((t) => ({
        stdin: t.stdin,
        expectedStdout: t.expectedStdout,
        isHidden: t.isHidden,
        weight: t.weight,
      })),
    };
    const parsed = parseBody(questionInputSchema, input);
    const id = await c.var.db.transaction(async (tx) => {
      const [row] = await tx
        .insert(questions)
        .values({ ...columns(parsed), ownerId: user.id, isPublic: false })
        .returning({ id: questions.id });
      await writeTests(tx as unknown as Database, row!.id, parsed.testCases);
      return row!.id;
    });
    const copy = (await findQuestion(c.var.db, id))!;
    return c.json(toQuestion(copy, await loadTests(c.var.db, [id]), user.id, true), 201);
  });

  return app;
}
