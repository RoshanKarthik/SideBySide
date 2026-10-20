import type { ApiError } from '@sidebyside/shared';
import { getGuestToken } from './guest-tokens';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Room whose guest token (if any) should authenticate this request. */
  roomKey?: string;
  signal?: AbortSignal;
}

async function request(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers = new Headers();
  if (opts.body !== undefined) headers.set('content-type', 'application/json');
  const token = opts.roomKey ? getGuestToken(opts.roomKey) : null;
  if (token) headers.set('authorization', `Bearer ${token}`);
  const res = await fetch(`/api${path}`, {
    method: opts.method ?? 'GET',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
    credentials: 'same-origin',
    signal: opts.signal,
  });
  if (!res.ok) {
    let code = 'http_error';
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as ApiError;
      code = data.error.code;
      message = data.error.message;
    } catch {
      // Not a JSON error body.
    }
    throw new ApiRequestError(res.status, code, message);
  }
  return res;
}

export const api = {
  async json<T>(path: string, opts?: RequestOptions): Promise<T> {
    return (await request(path, opts)).json() as Promise<T>;
  },
  /** For requests whose response has no body (e.g. 204). */
  async send(path: string, opts?: RequestOptions): Promise<void> {
    await request(path, opts);
  },
  async bytes(path: string, opts?: RequestOptions): Promise<Uint8Array> {
    return new Uint8Array(await (await request(path, opts)).arrayBuffer());
  },
};
