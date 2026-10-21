import { z } from 'zod';

export const LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'c',
  'go',
  'html',
] as const;
export const langSchema = z.enum(LANGUAGES);
export type Lang = z.infer<typeof langSchema>;

export interface LanguageInfo {
  label: string;
  /** Monaco language id. */
  monacoId: string;
  /** Whether the in-browser runner can execute this language. */
  runnable: boolean;
  /** Rendered live in a sandboxed preview frame instead of being run. */
  preview?: boolean;
  starter: string;
}

export const LANGUAGE_INFO: Record<Lang, LanguageInfo> = {
  python: {
    label: 'Python 3',
    monacoId: 'python',
    runnable: true,
    starter: 'def main():\n    name = input()\n    print(f"Hello, {name}!")\n\n\nmain()\n',
  },
  javascript: {
    label: 'JavaScript',
    monacoId: 'javascript',
    runnable: true,
    starter: 'const name = input();\nconsole.log(`Hello, ${name}!`);\n',
  },
  typescript: {
    label: 'TypeScript',
    monacoId: 'typescript',
    runnable: true,
    starter: 'const name: string = input();\nconsole.log(`Hello, ${name}!`);\n',
  },
  java: {
    label: 'Java',
    monacoId: 'java',
    runnable: false,
    starter:
      'import java.util.*;\n\npublic class Main {\n    public static void main(String[] args) {\n        Scanner sc = new Scanner(System.in);\n        System.out.println("Hello, " + sc.nextLine() + "!");\n    }\n}\n',
  },
  cpp: {
    label: 'C++',
    monacoId: 'cpp',
    runnable: false,
    starter:
      '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    string name;\n    getline(cin, name);\n    cout << "Hello, " << name << "!" << endl;\n}\n',
  },
  c: {
    label: 'C',
    monacoId: 'c',
    runnable: false,
    starter:
      '#include <stdio.h>\n\nint main(void) {\n    char name[256];\n    if (fgets(name, sizeof name, stdin)) printf("Hello, %s", name);\n    return 0;\n}\n',
  },
  go: {
    label: 'Go',
    monacoId: 'go',
    runnable: false,
    starter:
      'package main\n\nimport (\n\t"bufio"\n\t"fmt"\n\t"os"\n)\n\nfunc main() {\n\tname, _ := bufio.NewReader(os.Stdin).ReadString(\'\n\')\n\tfmt.Printf("Hello, %s", name)\n}\n',
  },
  html: {
    label: 'HTML / CSS / JS',
    monacoId: 'html',
    runnable: false,
    preview: true,
    starter: `<!doctype html>
<html>
  <head>
    <style>
      body { font-family: system-ui, sans-serif; padding: 24px; }
      button { padding: 8px 16px; border-radius: 8px; }
    </style>
  </head>
  <body>
    <h1>Hello!</h1>
    <button id="btn">Clicked 0 times</button>
    <script>
      let count = 0;
      const btn = document.getElementById('btn');
      btn.addEventListener('click', () => {
        count += 1;
        btn.textContent = 'Clicked ' + count + ' times';
      });
    </script>
  </body>
</html>
`,
  },
};

export function isRunnable(lang: Lang): boolean {
  return LANGUAGE_INFO[lang].runnable;
}

/** Front-end code that renders in a live preview instead of running. */
export function hasPreview(lang: Lang): boolean {
  return LANGUAGE_INFO[lang].preview === true;
}
