import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** An error that becomes a `{ error: { code, message } }` response. */
export class HttpError extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export const badRequest = (message: string, code = 'bad_request') =>
  new HttpError(400, code, message);
export const unauthorized = (message = 'Sign in to continue') =>
  new HttpError(401, 'unauthorized', message);
export const forbidden = (message = 'You do not have access to this') =>
  new HttpError(403, 'forbidden', message);
export const notFound = (message = 'Not found') => new HttpError(404, 'not_found', message);
export const conflict = (message: string, code = 'conflict') => new HttpError(409, code, message);
