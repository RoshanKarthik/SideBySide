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
  /** Output as it is printed, so a run stopped at the time limit still shows it. */
  | { type: 'output'; id: string; stream: 'stdout' | 'stderr'; text: string }
  | { type: 'result'; id: string; output: RunOutput };
