import type { z } from 'zod';
import { badRequest } from './errors';

/** Validates a request body; the first problem becomes a readable 400. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  const result = schema.safeParse(body);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw badRequest(`${where}${issue?.message ?? 'Invalid request'}`, 'invalid_body');
  }
  return result.data;
}
