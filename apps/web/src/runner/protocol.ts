import type { Lang, RunOutput } from '@sidebyside/shared';

export interface RunRequest {
  type: 'run';
  id: string;
  language: Lang;
  source: string;
  stdin: string;
}

export type RunnerMessage =
  | { type: 'status'; id: string; status: 'loading' | 'running' }
  | { type: 'result'; id: string; output: RunOutput };
