import { describe, expect, it, vi } from 'vitest';
import { prepareJava, toRunOutput, wandboxProvider } from './wandbox';

describe('prepareJava', () => {
  it('drops public from top-level types only, keeping line numbers', () => {
    const source =
      'import java.util.*;\n\npublic class Main {\n    public static void main(String[] a) {}\n}\npublic final class Helper {}\n';
    const prepared = prepareJava(source);
    expect(prepared).toContain('\nclass Main {');
    expect(prepared).toContain('\nfinal class Helper {}');
    expect(prepared).toContain('    public static void main');
    expect(prepared.split('\n')).toHaveLength(source.split('\n').length);
  });
});

describe('toRunOutput', () => {
  it('reports a successful run', () => {
    expect(toRunOutput({ status: '0', program_output: 'hi\n' }, 'cpp', 120)).toMatchObject({
      status: 'ok',
      stdout: 'hi\n',
      exitCode: 0,
      timeMs: 120,
    });
  });

  it('shows compile errors under the file name people know', () => {
    const out = toRunOutput(
      { status: '1', compiler_error: "prog.java:3: error: ';' expected\n" },
      'java',
      900,
    );
    expect(out).toMatchObject({ status: 'error', exitCode: null });
    expect(out.stderr).toBe("Main.java:3: error: ';' expected\n");
  });

  it('turns a killed run into a timeout and keeps its output', () => {
    expect(toRunOutput({ status: '137', program_output: 'before\n' }, 'c', 31_000)).toMatchObject({
      status: 'timeout',
      stdout: 'before\n',
    });
  });

  it('explains crashes', () => {
    const out = toRunOutput({ status: '139' }, 'cpp', 50);
    expect(out).toMatchObject({ status: 'error', exitCode: 139 });
    expect(out.stderr).toContain('Segmentation fault');
  });
});

describe('wandboxProvider', () => {
  it('sends the code, compiler and input, and maps the answer', async () => {
    const fetcher = vi.fn(async (_url: unknown, _init?: RequestInit) =>
      Response.json({ status: '0', program_output: 'Hello, Asha!\n' }),
    );
    const out = await wandboxProvider(fetcher as unknown as typeof fetch).run({
      language: 'java',
      source: 'public class Main {}\n',
      stdin: 'Asha\n',
    });
    expect(out.status).toBe('ok');
    expect(out.stdout).toBe('Hello, Asha!\n');
    const body = JSON.parse(String(fetcher.mock.calls[0]![1]!.body)) as Record<string, string>;
    expect(body).toMatchObject({
      compiler: 'openjdk-jdk-22+36',
      stdin: 'Asha\n',
      code: 'class Main {}\n',
    });
  });

  it('answers unsupported for browser languages without calling out', async () => {
    const fetcher = vi.fn();
    const out = await wandboxProvider(fetcher as unknown as typeof fetch).run({
      language: 'python',
      source: 'print(1)',
      stdin: '',
    });
    expect(out.status).toBe('unsupported');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
