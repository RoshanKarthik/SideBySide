import type { ExecuteRequest, RunOutput } from '@sidebyside/shared';

/** Runs code somewhere other than the browser; swappable so another service can replace it. */
export interface ExecutionProvider {
  run(req: ExecuteRequest): Promise<RunOutput>;
}
