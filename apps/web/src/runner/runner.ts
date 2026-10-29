import { LIMITS, isRunnable, type Lang, type RunOutput } from '@sidebyside/shared';
import type { RunRequest, RunnerMessage } from './protocol';

export type RunPhase = 'loading' | 'running';

/** Loading Pyodide over a slow connection can take a while; running code cannot. */
const LOAD_TIMEOUT_MS = 90_000;

const result = (status: RunOutput['status'], stderr: string): RunOutput => ({
  status,
  stdout: '',
  stderr,
  exitCode: null,
  timeMs: 0,
  memoryKb: null,
});

/**
 * Runs code in a sandboxed worker, one run at a time. A run that exceeds the time limit kills
 * the worker (the only way to stop an infinite loop); the next run starts a fresh one.
 */
export class CodeRunner {
  private worker: Worker | null = null;
  private busy = false;

  get isBusy(): boolean {
    return this.busy;
  }

  async run(
    language: Lang,
    source: string,
    stdin: string,
    onPhase?: (phase: RunPhase) => void,
  ): Promise<RunOutput> {
    if (!isRunnable(language)) {
      return result('unsupported', 'Running this language in the browser is not supported yet.');
    }
    if (this.busy) return result('error', 'A run is already in progress.');
    this.busy = true;
    try {
      return await this.execute(
        { type: 'run', id: crypto.randomUUID(), language, source, stdin },
        onPhase,
      );
    } finally {
      this.busy = false;
    }
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }

  private execute(req: RunRequest, onPhase?: (phase: RunPhase) => void): Promise<RunOutput> {
    this.worker ??= new Worker(new URL('./runner.worker.ts', import.meta.url), {
      type: 'module',
      name: 'runner',
    });
    const worker = this.worker;

    return new Promise<RunOutput>((resolve) => {
      // What the program printed so far, for a run stopped at the time limit.
      const partial = { stdout: '', stderr: '' };
      let timer = setTimeout(
        () => finish(result('timeout', 'Timed out while loading the runtime.'), true),
        LOAD_TIMEOUT_MS,
      );

      const finish = (output: RunOutput, kill: boolean) => {
        clearTimeout(timer);
        worker.removeEventListener('message', onMessage);
        worker.removeEventListener('error', onError);
        if (kill) this.dispose();
        resolve(output);
      };

      const onMessage = (event: MessageEvent<RunnerMessage>) => {
        const msg = event.data;
        if (msg.id !== req.id) return;
        if (msg.type === 'output') {
          partial[msg.stream] += msg.text;
        } else if (msg.type === 'status') {
          onPhase?.(msg.status);
          if (msg.status === 'running') {
            clearTimeout(timer);
            timer = setTimeout(() => {
              const notice = `Time limit exceeded (${LIMITS.runTimeoutMs / 1000}s). The program was stopped.`;
              const stderr = partial.stderr
                ? partial.stderr.replace(/\n?$/, '\n') + notice
                : notice;
              finish(
                {
                  ...result('timeout', stderr),
                  stdout: partial.stdout,
                  timeMs: LIMITS.runTimeoutMs,
                },
                true,
              );
            }, LIMITS.runTimeoutMs);
          }
        } else {
          finish(msg.output, false);
        }
      };
      const onError = (event: ErrorEvent) => {
        event.preventDefault();
        finish(result('error', `The runner crashed: ${event.message || 'unknown error'}`), true);
      };

      worker.addEventListener('message', onMessage);
      worker.addEventListener('error', onError);
      worker.postMessage(req);
    });
  }
}
