import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/editor/editor.worker.js?worker';
import TsWorker from 'monaco-editor/language/typescript/ts.worker.js?worker';

// Language services run in their own workers, bundled by Vite.
self.MonacoEnvironment = {
  getWorker(_id: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TsWorker();
    return new EditorWorker();
  },
};

// Candidates write standalone scripts; don't flag `input()` and friends as undefined.
const runnerGlobals = [
  'declare function input(): string | null;',
  'declare function readline(): string | null;',
  'declare function require(name: "fs"): { readFileSync(path: 0 | "/dev/stdin", enc?: string): string };',
  'declare const process: { argv: string[]; exit(code?: number): never; stdout: { write(s: string): boolean } };',
].join('\n');
monaco.typescript.typescriptDefaults.addExtraLib(runnerGlobals, 'file:///runner-globals.d.ts');
monaco.typescript.javascriptDefaults.addExtraLib(runnerGlobals, 'file:///runner-globals.d.ts');
monaco.typescript.javascriptDefaults.setCompilerOptions({ checkJs: false, allowJs: true });

export { monaco };
