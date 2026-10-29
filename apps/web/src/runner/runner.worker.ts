/// <reference lib="webworker" />
/**
 * Runs candidate code in a dedicated worker. The worker has no DOM, and before any user code
 * runs it removes every way to reach the network or other tabs, so code cannot call our API
 * with the viewer's session or tamper with the shared document. In production the Worker
 * script is also served with a Content-Security-Policy that only allows loading Pyodide.
 */
import { LIMITS, type RunOutput } from '@sidebyside/shared';
import type { PyodideInterface } from 'pyodide';
import type { RunRequest, RunnerMessage } from './protocol';

declare const self: DedicatedWorkerGlobalScope;

const BLOCKED_GLOBALS = [
  'fetch',
  'XMLHttpRequest',
  'WebSocket',
  'WebTransport',
  'EventSource',
  'Worker',
  'SharedWorker',
  'BroadcastChannel',
  'importScripts',
  'indexedDB',
  'caches',
  'RTCPeerConnection',
  // User code must not post fake results or listen for later run requests.
  'postMessage',
  'addEventListener',
  'removeEventListener',
  'dispatchEvent',
  'onmessage',
  'onmessageerror',
  'close',
];

let lockedDown = false;
function lockdown(): void {
  if (lockedDown) return;
  for (const name of BLOCKED_GLOBALS) {
    let target: object | null = self;
    while (target) {
      if (Object.prototype.hasOwnProperty.call(target, name)) {
        try {
          delete (target as Record<string, unknown>)[name];
        } catch {
          // Non-configurable: shadow it instead.
        }
        if (name in target) {
          try {
            Object.defineProperty(target, name, { value: undefined, configurable: false });
          } catch {
            // Best effort; CSP still blocks network access in production.
          }
        }
      }
      target = Object.getPrototypeOf(target) as object | null;
    }
  }
  lockedDown = true;
}

// Captured before lockdown removes postMessage from the global scope.
const realPostMessage = self.postMessage.bind(self);
const post = (msg: RunnerMessage) => realPostMessage(msg);

/** Writes sent one by one before streaming switches to batches (so "print, then hang" shows). */
const EAGER_WRITES = 500;
const STREAM_BATCH_MS = 50;

/**
 * Collects output up to the size limit, and streams it to the page as it is written: a run that
 * hits the time limit is killed with the worker, and this is how its output survives.
 */
class OutputBuffer {
  private chunks: string[] = [];
  private size = 0;
  private pending = '';
  private writes = 0;
  private lastSent = 0;
  truncated = false;
  constructor(
    private readonly runId: string,
    private readonly stream: 'stdout' | 'stderr',
  ) {}
  write(text: string): void {
    if (this.truncated) return;
    if (this.size + text.length > LIMITS.outputBytes) {
      text = text.slice(0, LIMITS.outputBytes - this.size);
      this.truncated = true;
    }
    this.chunks.push(text);
    this.size += text.length;
    this.pending += text;
    const now = performance.now();
    if (++this.writes <= EAGER_WRITES || this.truncated || now - this.lastSent >= STREAM_BATCH_MS) {
      post({ type: 'output', id: this.runId, stream: this.stream, text: this.pending });
      this.pending = '';
      this.lastSent = now;
    }
  }
  toString(): string {
    const text = this.chunks.join('');
    return this.truncated ? `${text}\n… output truncated at ${LIMITS.outputBytes / 1024} KB` : text;
  }
}

// ---------------------------------------------------------------------------
// Python (Pyodide)
// ---------------------------------------------------------------------------

let pyodidePromise: Promise<PyodideInterface> | null = null;

function loadPython(): Promise<PyodideInterface> {
  pyodidePromise ??= (async () => {
    const { loadPyodide } = await import('pyodide');
    return loadPyodide({ indexURL: `${self.location.origin}/pyodide/` });
  })();
  return pyodidePromise;
}

async function runPython(req: RunRequest): Promise<RunOutput> {
  const pyodide = await loadPython();
  lockdown();
  post({ type: 'status', id: req.id, status: 'running' });

  const stdout = new OutputBuffer(req.id, 'stdout');
  const stderr = new OutputBuffer(req.id, 'stderr');
  const decoder = new TextDecoder();
  // Byte-level reads: Pyodide's string-returning `stdin` handler truncates large inputs.
  const input = new TextEncoder().encode(req.stdin);
  let offset = 0;
  pyodide.setStdin({
    read: (buffer) => {
      const n = Math.min(buffer.length, input.length - offset);
      buffer.set(input.subarray(offset, offset + n));
      offset += n;
      return n;
    },
  });
  pyodide.setStdout({ write: (buf) => (stdout.write(decoder.decode(buf)), buf.length) });
  pyodide.setStderr({ write: (buf) => (stderr.write(decoder.decode(buf)), buf.length) });

  const globals = pyodide.globals.get('dict')();
  globals.set('__name__', '__main__');
  const started = performance.now();
  let exitCode = 0;
  let status: RunOutput['status'] = 'ok';
  try {
    await pyodide.runPythonAsync(req.source, { globals, filename: 'main.py' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const exit = /SystemExit: ?(\d+)?/.exec(message);
    if (exit) {
      exitCode = Number(exit[1] ?? 0);
      status = exitCode === 0 ? 'ok' : 'error';
    } else {
      exitCode = 1;
      status = 'error';
      stderr.write(cleanTraceback(message));
    }
  } finally {
    globals.destroy();
  }
  return {
    status,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exitCode,
    timeMs: Math.round(performance.now() - started),
    memoryKb: null,
  };
}

/** Drops Pyodide's own frames so the traceback starts at the candidate's code. */
function cleanTraceback(message: string): string {
  const lines = message.split('\n');
  const first = lines.findIndex((l) => l.includes('File "main.py"'));
  if (first <= 0) return message;
  return ['Traceback (most recent call last):', ...lines.slice(first)].join('\n');
}

// ---------------------------------------------------------------------------
// JavaScript / TypeScript
// ---------------------------------------------------------------------------

class ProcessExit {
  constructor(readonly code: number) {}
}

function formatValue(value: unknown, depth = 0): string {
  if (typeof value === 'string') return depth ? JSON.stringify(value) : value;
  if (value === undefined) return 'undefined';
  if (typeof value === 'function') return `[Function: ${value.name || 'anonymous'}]`;
  if (typeof value === 'bigint') return `${value}n`;
  if (typeof value === 'symbol') return value.toString();
  if (value instanceof Error) return value.stack ?? `${value.name}: ${value.message}`;
  if (value === null || typeof value !== 'object') return String(value);
  if (depth > 3) return Array.isArray(value) ? '[Array]' : '[Object]';
  if (Array.isArray(value)) return `[ ${value.map((v) => formatValue(v, depth + 1)).join(', ')} ]`;
  if (value instanceof Map)
    return `Map(${value.size}) { ${[...value].map(([k, v]) => `${formatValue(k, depth + 1)} => ${formatValue(v, depth + 1)}`).join(', ')} }`;
  if (value instanceof Set)
    return `Set(${value.size}) { ${[...value].map((v) => formatValue(v, depth + 1)).join(', ')} }`;
  const entries = Object.entries(value).map(([k, v]) => `${k}: ${formatValue(v, depth + 1)}`);
  return entries.length ? `{ ${entries.join(', ')} }` : '{}';
}

async function runJavaScript(req: RunRequest): Promise<RunOutput> {
  let source = req.source;
  if (req.language === 'typescript') {
    const { transform } = await import('sucrase');
    try {
      source = transform(source, { transforms: ['typescript'], disableESTransforms: true }).code;
    } catch (err) {
      return {
        status: 'error',
        stdout: '',
        stderr: `TypeScript error: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: 1,
        timeMs: 0,
        memoryKb: null,
      };
    }
  }
  lockdown();
  post({ type: 'status', id: req.id, status: 'running' });

  const stdout = new OutputBuffer(req.id, 'stdout');
  const stderr = new OutputBuffer(req.id, 'stderr');
  const lines = req.stdin.split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  let cursor = 0;
  const readAll = () => {
    const rest = lines.slice(cursor).join('\n');
    cursor = lines.length;
    return rest;
  };
  const input = () => (cursor < lines.length ? lines[cursor++]! : null);
  const print =
    (out: OutputBuffer) =>
    (...args: unknown[]) =>
      out.write(args.map((a) => formatValue(a)).join(' ') + '\n');
  const consoleShim = {
    log: print(stdout),
    info: print(stdout),
    debug: print(stdout),
    warn: print(stderr),
    error: print(stderr),
    table: print(stdout),
  };
  const processShim = {
    argv: ['node', 'main.js'],
    env: {},
    exit: (code = 0) => {
      throw new ProcessExit(code);
    },
    stdout: { write: (s: string) => (stdout.write(String(s)), true) },
    stderr: { write: (s: string) => (stderr.write(String(s)), true) },
  };
  const requireShim = (name: string) => {
    if (name === 'fs' || name === 'node:fs') {
      return {
        readFileSync: (path: unknown) => {
          if (path === 0 || path === '/dev/stdin') return readAll();
          throw new Error(`File system access is not available (tried to read ${String(path)})`);
        },
      };
    }
    throw new Error(`Cannot find module '${name}' (only 'fs' for stdin is available)`);
  };

  const AsyncFunction = Object.getPrototypeOf(async () => {}).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;
  const started = performance.now();
  let exitCode = 0;
  let status: RunOutput['status'] = 'ok';
  try {
    const fn = new AsyncFunction('console', 'process', 'require', 'input', 'readline', source);
    await fn(consoleShim, processShim, requireShim, input, input);
  } catch (err) {
    if (err instanceof ProcessExit) {
      exitCode = err.code;
      status = err.code === 0 ? 'ok' : 'error';
    } else {
      exitCode = 1;
      status = 'error';
      stderr.write(formatValue(err) + '\n');
    }
  }
  return {
    status,
    stdout: stdout.toString(),
    stderr: stderr.toString(),
    exitCode,
    timeMs: Math.round(performance.now() - started),
    memoryKb: null,
  };
}

self.addEventListener('message', async (event: MessageEvent<RunRequest>) => {
  const req = event.data;
  if (req.type !== 'run') return;
  try {
    if (req.language === 'python') {
      if (!pyodidePromise) post({ type: 'status', id: req.id, status: 'loading' });
      post({ type: 'result', id: req.id, output: await runPython(req) });
    } else {
      post({ type: 'result', id: req.id, output: await runJavaScript(req) });
    }
  } catch (err) {
    post({
      type: 'result',
      id: req.id,
      output: {
        status: 'error',
        stdout: '',
        stderr: `The runner failed: ${err instanceof Error ? err.message : String(err)}`,
        exitCode: null,
        timeMs: 0,
        memoryKb: null,
      },
    });
  }
});
