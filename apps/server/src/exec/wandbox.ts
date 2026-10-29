import { LIMITS, type ExecuteRequest, type Lang, type RunOutput } from '@sidebyside/shared';
import type { ExecutionProvider } from './provider';

const ENDPOINT = 'https://wandbox.org/api/compile.json';
/** Wandbox kills a run after about 30 seconds; slow compiles (Go) need some of that too. */
const REQUEST_TIMEOUT_MS = 50_000;

interface Target {
  compiler: string;
  options?: string;
  /** Wandbox's file name for the source, and the one people know their code by. */
  file: string;
  shownAs: string;
}

const TARGETS: Partial<Record<Lang, Target>> = {
  java: { compiler: 'openjdk-jdk-22+36', file: 'prog.java', shownAs: 'Main.java' },
  cpp: { compiler: 'gcc-13.2.0', options: '-std=c++20\n-O2', file: 'prog.cc', shownAs: 'main.cpp' },
  c: { compiler: 'gcc-13.2.0-c', options: '-std=c17\n-O2', file: 'prog.c', shownAs: 'main.c' },
  go: { compiler: 'go-1.23.2', file: 'prog.go', shownAs: 'main.go' },
};

export interface WandboxResult {
  status?: string;
  signal?: string;
  compiler_error?: string;
  program_output?: string;
  program_error?: string;
}

/**
 * Wandbox compiles Java as `prog.java`, where a `public` top-level class named anything else
 * won't compile; dropping that `public` changes nothing else (line numbers stay the same).
 */
export function prepareJava(source: string): string {
  return source.replace(
    /^public\s+(?=(?:(?:final|abstract|sealed|non-sealed|strictfp)\s+)*(?:class|interface|enum|record)\b)/gm,
    '',
  );
}

const clip = (text: string) =>
  text.length > LIMITS.outputBytes
    ? `${text.slice(0, LIMITS.outputBytes)}\n… output truncated at ${LIMITS.outputBytes / 1024} KB`
    : text;

/** Turns Wandbox's answer into the app's run result. */
export function toRunOutput(result: WandboxResult, language: Lang, timeMs: number): RunOutput {
  const target = TARGETS[language];
  const rename = (text: string) => (target ? text.split(target.file).join(target.shownAs) : text);
  const exit = Number(result.status ?? NaN);
  const stdout = clip(result.program_output ?? '');
  const programError = rename(result.program_error ?? '');
  const compileError = rename(result.compiler_error ?? '');
  const base = { stdout, timeMs, memoryKb: null };
  // Killed: Wandbox's own time limit.
  if (exit === 137 || /kill/i.test(result.signal ?? '')) {
    return {
      ...base,
      status: 'timeout',
      stderr: clip(
        `${programError}Time limit exceeded on the code runner. The program was stopped.`,
      ),
      exitCode: null,
    };
  }
  if (exit === 0) return { ...base, status: 'ok', stderr: clip(programError), exitCode: 0 };
  // A failed compile leaves no program output, only the compiler's errors.
  if (compileError && !stdout && !programError) {
    return { ...base, status: 'error', stderr: clip(compileError), exitCode: null };
  }
  const crash =
    exit === 139 ? 'Segmentation fault' : exit === 136 ? 'Floating point exception' : '';
  return {
    ...base,
    status: 'error',
    stderr: clip(crash ? `${programError}${crash} (exit code ${exit})` : programError),
    exitCode: Number.isFinite(exit) ? exit : null,
  };
}

/** Wandbox (wandbox.org): a free public compiler service, used for compiled languages. */
export function wandboxProvider(fetcher: typeof fetch = fetch): ExecutionProvider {
  return {
    async run(req: ExecuteRequest): Promise<RunOutput> {
      const target = TARGETS[req.language];
      if (!target) {
        return {
          status: 'unsupported',
          stdout: '',
          stderr: 'This language does not run on the server.',
          exitCode: null,
          timeMs: 0,
          memoryKb: null,
        };
      }
      const code = req.language === 'java' ? prepareJava(req.source) : req.source;
      const started = Date.now();
      const res = await fetcher(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          code,
          compiler: target.compiler,
          stdin: req.stdin,
          'compiler-option-raw': target.options ?? '',
          save: false,
        }),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`The code runner answered ${res.status}`);
      return toRunOutput((await res.json()) as WandboxResult, req.language, Date.now() - started);
    },
  };
}
