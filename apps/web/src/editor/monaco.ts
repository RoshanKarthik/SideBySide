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

// Editor themes matched to the app's colours (see index.css).
monaco.editor.defineTheme('sbs-dark', {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'c4a1ff' },
    { token: 'string', foreground: '9ee6b8' },
    { token: 'number', foreground: 'f5c38b' },
    { token: 'type', foreground: '7dd3fc' },
  ],
  colors: {
    'editor.background': '#0e0e13',
    'editor.lineHighlightBackground': '#ffffff08',
    'editorLineNumber.foreground': '#4b4b5a',
    'editorLineNumber.activeForeground': '#a1a1b5',
    'editor.selectionBackground': '#8b5cf640',
    'editorCursor.foreground': '#c4b5fd',
    'editorIndentGuide.background1': '#ffffff10',
    'editorWidget.background': '#16161d',
    'editorWidget.border': '#ffffff18',
  },
});
monaco.editor.defineTheme('sbs-light', {
  base: 'vs',
  inherit: true,
  rules: [{ token: 'comment', foreground: '8a8a99', fontStyle: 'italic' }],
  colors: {
    'editor.background': '#fcfcfd',
    'editor.lineHighlightBackground': '#00000006',
    'editorLineNumber.foreground': '#b4b4c0',
    'editor.selectionBackground': '#7c3aed26',
  },
});

export function monacoTheme(): string {
  return document.documentElement.classList.contains('dark') ? 'sbs-dark' : 'sbs-light';
}
