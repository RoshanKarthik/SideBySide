/**
 * Starter code for seeded questions: every language reads all of stdin and prints the answer,
 * with the question's input format as a comment.
 */
export function starterCode(inputFormat: string[]): Record<string, string> {
  const comment = (prefix: string) => inputFormat.map((l) => `${prefix}   ${l}`).join('\n');
  return {
    python: `import sys


def solve(data: str) -> str:
    # Input:
${comment('    #')}
    lines = data.split("\\n")
    return ""


print(solve(sys.stdin.read()))
`,
    javascript: `const data = require('fs').readFileSync(0, 'utf8');

function solve(data) {
  // Input:
${comment('  //')}
  const lines = data.split('\\n');
  return '';
}

console.log(solve(data));
`,
    typescript: `const data: string = require('fs').readFileSync(0, 'utf8');

function solve(data: string): string {
  // Input:
${comment('  //')}
  const lines = data.split('\\n');
  return '';
}

console.log(solve(data));
`,
    java: `import java.io.*;
import java.util.*;

public class Main {
    static String solve(String data) {
        // Input:
${comment('        //')}
        String[] lines = data.split("\\n");
        return "";
    }

    public static void main(String[] args) throws IOException {
        String data = new String(System.in.readAllBytes());
        System.out.println(solve(data));
    }
}
`,
    cpp: `#include <bits/stdc++.h>
using namespace std;

// Input:
${comment('//')}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    return 0;
}
`,
  };
}
