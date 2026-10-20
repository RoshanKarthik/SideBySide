/**
 * The public practice bank. Expected outputs are computed from each question's reference
 * solution when seeding, so tests can't drift from the statement.
 */
import type { Difficulty } from '@sidebyside/shared';

export interface SeedQuestion {
  key: string;
  title: string;
  difficulty: Difficulty;
  tags: string[];
  statement: string;
  input: string[];
  output: string;
  hints: string[];
  /** stdin of tests the candidate can see (the first is used as the example). */
  visible: string[];
  /** stdin of hidden tests. */
  hidden: string[];
  solve: (stdin: string) => string;
}

// ---------------------------------------------------------------------------
// Helpers for reference solutions and generated inputs
// ---------------------------------------------------------------------------

const nums = (s: string) => s.trim().split(/\s+/).filter(Boolean).map(Number);
const lines = (s: string) => s.replace(/\r/g, '').split('\n');

function rng(seed: number) {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const randInt = (r: () => number, lo: number, hi: number) => lo + Math.floor(r() * (hi - lo + 1));
const randArr = (seed: number, n: number, lo: number, hi: number) => {
  const r = rng(seed);
  return Array.from({ length: n }, () => randInt(r, lo, hi));
};
const randWord = (r: () => number, len: number, alphabet = 'abcde') =>
  Array.from({ length: len }, () => alphabet[randInt(r, 0, alphabet.length - 1)]).join('');
const randGrid = (seed: number, rows: number, cols: number, chars: [string, string], p: number) => {
  const r = rng(seed);
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => (r() < p ? chars[1] : chars[0])).join(''),
  );
};

/** Parses a level-order tree like "3 9 20 null null 15 7". */
interface TreeNode {
  val: number;
  left: TreeNode | null;
  right: TreeNode | null;
}
function parseTree(line: string): TreeNode | null {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens[0] === 'null') return null;
  const root: TreeNode = { val: Number(tokens[0]), left: null, right: null };
  const queue = [root];
  let i = 1;
  while (queue.length && i < tokens.length) {
    const node = queue.shift()!;
    for (const side of ['left', 'right'] as const) {
      const t = tokens[i++];
      if (t !== undefined && t !== 'null') {
        node[side] = { val: Number(t), left: null, right: null };
        queue.push(node[side]!);
      }
    }
  }
  return root;
}
/** Level-order serialisation of a random BST built from distinct values. */
function randomBstLine(seed: number, n: number): string {
  const r = rng(seed);
  const values = new Set<number>();
  while (values.size < n) values.add(randInt(r, 1, 999));
  let root: TreeNode | null = null;
  for (const v of values) {
    const node: TreeNode = { val: v, left: null, right: null };
    if (!root) root = node;
    else {
      let cur = root;
      for (;;) {
        const side = v < cur.val ? 'left' : 'right';
        if (!cur[side]) {
          cur[side] = node;
          break;
        }
        cur = cur[side]!;
      }
    }
  }
  const out: string[] = [];
  const queue: (TreeNode | null)[] = [root];
  while (queue.length) {
    const node = queue.shift()!;
    out.push(node ? String(node.val) : 'null');
    if (node) queue.push(node.left, node.right);
  }
  while (out.at(-1) === 'null') out.pop();
  return out.join(' ');
}

// ---------------------------------------------------------------------------
// Questions
// ---------------------------------------------------------------------------

export const SEED_QUESTIONS: SeedQuestion[] = [
  {
    key: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    tags: ['arrays', 'hashing'],
    statement:
      'Given an array of integers and a target, find the two different positions whose values add up to the target. Exactly one answer exists.',
    input: ['Line 1: n', 'Line 2: n integers', 'Line 3: target'],
    output: 'The two 0-based indices i and j (i < j), separated by a space.',
    hints: [
      'A brute-force double loop is O(n²). Can you do it in one pass?',
      'Store each value’s index in a hash map and look up target − value.',
    ],
    visible: ['4\n2 7 11 15\n9', '3\n3 2 4\n6', '2\n3 3\n6'],
    hidden: [
      '5\n-1 -2 -3 -4 -5\n-8',
      '6\n0 4 3 0 9 1\n0',
      (() => {
        const a = randArr(11, 2000, 1, 1_000_000);
        a[1500] = 3_000_001;
        a[1999] = 3_000_002;
        return `2000\n${a.join(' ')}\n6000003`;
      })(),
    ],
    solve: (s) => {
      const [nLine = '', arrLine = '', targetLine = ''] = lines(s);
      void nLine;
      const a = nums(arrLine);
      const target = Number(targetLine);
      const seen = new Map<number, number>();
      for (let i = 0; i < a.length; i++) {
        const j = seen.get(target - a[i]!);
        if (j !== undefined) return `${j} ${i}`;
        if (!seen.has(a[i]!)) seen.set(a[i]!, i);
      }
      return '';
    },
  },
  {
    key: 'valid-parentheses',
    title: 'Valid Parentheses',
    difficulty: 'easy',
    tags: ['strings', 'stack'],
    statement:
      'A string contains only the characters `()[]{}`. It is valid if every opening bracket is closed by the same type of bracket in the correct order.',
    input: ['Line 1: the string (may be empty)'],
    output: '`true` if the string is valid, otherwise `false`.',
    hints: ['Push opening brackets on a stack; each closing bracket must match the top.'],
    visible: ['()[]{}', '(]', '{[]}'],
    hidden: ['', '((((', '([)]', '{[()()]}[]', '('.repeat(5000) + ')'.repeat(5000)],
    solve: (s) => {
      const str = lines(s)[0] ?? '';
      const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
      const stack: string[] = [];
      for (const ch of str) {
        if ('([{'.includes(ch)) stack.push(ch);
        else if (stack.pop() !== pairs[ch]) return 'false';
      }
      return stack.length ? 'false' : 'true';
    },
  },
  {
    key: 'reverse-words',
    title: 'Reverse Words in a Sentence',
    difficulty: 'easy',
    tags: ['strings'],
    statement:
      'Reverse the order of the words in a sentence. Words are separated by one or more spaces; the output uses single spaces with no leading or trailing space.',
    input: ['Line 1: the sentence'],
    output: 'The words in reverse order.',
    hints: ['Split on runs of whitespace and ignore empty pieces.'],
    visible: ['the sky is blue', '  hello world  ', 'a good   example'],
    hidden: ['single', '   ', 'Coding interviews are fun to practise'],
    solve: (s) => (lines(s)[0] ?? '').trim().split(/\s+/).filter(Boolean).reverse().join(' '),
  },
  {
    key: 'valid-palindrome',
    title: 'Valid Palindrome',
    difficulty: 'easy',
    tags: ['strings', 'two pointers'],
    statement:
      'After lowercasing and removing every character that is not a letter or digit, does the text read the same forwards and backwards?',
    input: ['Line 1: the text'],
    output: '`true` or `false`.',
    hints: ['Use two pointers moving inwards, skipping characters that are not letters or digits.'],
    visible: ['A man, a plan, a canal: Panama', 'race a car', ' '],
    hidden: ['0P', 'Was it a car or a cat I saw?', 'ab_a', 'No lemon, no melon'],
    solve: (s) => {
      const t = (lines(s)[0] ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
      return String(t === [...t].reverse().join(''));
    },
  },
  {
    key: 'fizzbuzz',
    title: 'FizzBuzz',
    difficulty: 'easy',
    tags: ['basics'],
    statement:
      'For each number from 1 to n, print `Fizz` if it is divisible by 3, `Buzz` if divisible by 5, `FizzBuzz` if divisible by both, otherwise the number itself.',
    input: ['Line 1: n'],
    output: 'n lines.',
    hints: ['Check divisibility by 15 first.'],
    visible: ['5', '15'],
    hidden: ['1', '3', '100'],
    solve: (s) => {
      const n = Number(lines(s)[0]);
      const out: string[] = [];
      for (let i = 1; i <= n; i++) {
        out.push(
          i % 15 === 0 ? 'FizzBuzz' : i % 3 === 0 ? 'Fizz' : i % 5 === 0 ? 'Buzz' : String(i),
        );
      }
      return out.join('\n');
    },
  },
  {
    key: 'maximum-subarray',
    title: 'Maximum Subarray',
    difficulty: 'medium',
    tags: ['arrays', 'dynamic programming'],
    statement: 'Find the largest possible sum of a non-empty contiguous subarray.',
    input: ['Line 1: n', 'Line 2: n integers'],
    output: 'The largest sum.',
    hints: [
      'Think about the best subarray that ends at each position.',
      'Kadane’s algorithm: best_here = max(x, best_here + x).',
    ],
    visible: ['9\n-2 1 -3 4 -1 2 1 -5 4', '1\n1', '5\n5 4 -1 7 8'],
    hidden: [
      '3\n-3 -1 -2',
      `10000\n${randArr(21, 10_000, -10_000, 10_000).join(' ')}`,
      `6\n${[2, -1, 2, -1, 2, -100].join(' ')}`,
    ],
    solve: (s) => {
      const a = nums(lines(s)[1] ?? '');
      let best = -Infinity;
      let cur = 0;
      for (const x of a) {
        cur = Math.max(x, cur + x);
        best = Math.max(best, cur);
      }
      return String(best);
    },
  },
  {
    key: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'medium',
    tags: ['arrays', 'sorting'],
    statement:
      'Merge all overlapping intervals (intervals that touch, like [1,4] and [4,5], also merge). Print the result sorted by start.',
    input: ['Line 1: n', 'Next n lines: start end'],
    output: 'One merged interval per line: start end.',
    hints: ['Sort by start, then extend the last merged interval while the next one overlaps.'],
    visible: ['4\n1 3\n2 6\n8 10\n15 18', '2\n1 4\n4 5', '1\n5 7'],
    hidden: [
      '3\n1 4\n0 4\n2 3',
      '4\n10 12\n1 2\n3 5\n2 3',
      (() => {
        const r = rng(31);
        const rows = Array.from({ length: 500 }, () => {
          const a = randInt(r, 0, 10_000);
          return `${a} ${a + randInt(r, 0, 50)}`;
        });
        return `500\n${rows.join('\n')}`;
      })(),
    ],
    solve: (s) => {
      const ls = lines(s);
      const n = Number(ls[0]);
      const iv = ls.slice(1, n + 1).map((l) => nums(l) as [number, number]);
      iv.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      const out: [number, number][] = [];
      for (const [a, b] of iv) {
        const last = out.at(-1);
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
      }
      return out.map(([a, b]) => `${a} ${b}`).join('\n');
    },
  },
  {
    key: 'binary-search',
    title: 'Binary Search',
    difficulty: 'easy',
    tags: ['arrays', 'binary search'],
    statement:
      'Given a sorted array of distinct integers and a target, print the index of the target, or -1 if it is not present. Aim for O(log n).',
    input: ['Line 1: n', 'Line 2: n sorted integers', 'Line 3: target'],
    output: 'The 0-based index, or -1.',
    hints: ['Keep a low/high window and compare the middle element with the target.'],
    visible: ['6\n-1 0 3 5 9 12\n9', '6\n-1 0 3 5 9 12\n2'],
    hidden: [
      '1\n5\n5',
      '1\n5\n-5',
      (() => {
        const a = Array.from({ length: 100_000 }, (_, i) => i * 3 - 50_000);
        return `100000\n${a.join(' ')}\n${a[77_777]}`;
      })(),
    ],
    solve: (s) => {
      const ls = lines(s);
      const a = nums(ls[1] ?? '');
      const t = Number(ls[2]);
      let lo = 0;
      let hi = a.length - 1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (a[mid] === t) return String(mid);
        if (a[mid]! < t) lo = mid + 1;
        else hi = mid - 1;
      }
      return '-1';
    },
  },
  {
    key: 'climbing-stairs',
    title: 'Climbing Stairs',
    difficulty: 'easy',
    tags: ['dynamic programming'],
    statement:
      'You climb a staircase of n steps, taking 1 or 2 steps at a time. In how many distinct ways can you reach the top?',
    input: ['Line 1: n (1 ≤ n ≤ 45)'],
    output: 'The number of ways.',
    hints: ['ways(n) = ways(n − 1) + ways(n − 2).'],
    visible: ['2', '3'],
    hidden: ['1', '10', '45'],
    solve: (s) => {
      const n = Number(lines(s)[0]);
      let a = 1;
      let b = 1;
      for (let i = 2; i <= n; i++) [a, b] = [b, a + b];
      return String(b);
    },
  },
  {
    key: 'coin-change',
    title: 'Coin Change',
    difficulty: 'medium',
    tags: ['dynamic programming'],
    statement:
      'Given coin denominations (unlimited supply of each) and an amount, find the fewest coins that add up to the amount, or -1 if it cannot be made.',
    input: ['Line 1: the coin values, space-separated', 'Line 2: amount'],
    output: 'The minimum number of coins, or -1.',
    hints: ['dp[x] = 1 + min(dp[x − coin]) over all coins.'],
    visible: ['1 2 5\n11', '2\n3', '1\n0'],
    hidden: ['186 419 83 408\n6249', '2 5 10 1\n27', '7 13\n1', '3 7 405 436\n8839'],
    solve: (s) => {
      const ls = lines(s);
      const coins = nums(ls[0] ?? '');
      const amount = Number(ls[1]);
      const dp = new Array<number>(amount + 1).fill(Infinity);
      dp[0] = 0;
      for (let x = 1; x <= amount; x++) {
        for (const c of coins) if (c <= x && dp[x - c]! + 1 < dp[x]!) dp[x] = dp[x - c]! + 1;
      }
      return String(dp[amount] === Infinity ? -1 : dp[amount]);
    },
  },
  {
    key: 'longest-increasing-subsequence',
    title: 'Longest Increasing Subsequence',
    difficulty: 'medium',
    tags: ['dynamic programming', 'binary search'],
    statement:
      'Find the length of the longest strictly increasing subsequence (not necessarily contiguous).',
    input: ['Line 1: n', 'Line 2: n integers'],
    output: 'The length.',
    hints: [
      'An O(n²) DP works for small inputs.',
      'For O(n log n), keep the smallest possible tail for each subsequence length.',
    ],
    visible: ['8\n10 9 2 5 3 7 101 18', '6\n0 1 0 3 2 3', '7\n7 7 7 7 7 7 7'],
    hidden: ['1\n5', `5000\n${randArr(41, 5000, 0, 100_000).join(' ')}`, '5\n5 4 3 2 1'],
    solve: (s) => {
      const a = nums(lines(s)[1] ?? '');
      const tails: number[] = [];
      for (const x of a) {
        let lo = 0;
        let hi = tails.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (tails[mid]! < x) lo = mid + 1;
          else hi = mid;
        }
        tails[lo] = x;
      }
      return String(tails.length);
    },
  },
  {
    key: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'medium',
    tags: ['graphs', 'dfs', 'bfs'],
    statement:
      'A grid has land (`1`) and water (`0`). An island is a group of land cells connected horizontally or vertically. Count the islands.',
    input: ['Line 1: rows cols', 'Next rows lines: a string of 0s and 1s'],
    output: 'The number of islands.',
    hints: [
      'Scan the grid; each time you find unvisited land, flood-fill it and count one island.',
    ],
    visible: ['4 5\n11110\n11010\n11000\n00000', '4 5\n11000\n11000\n00100\n00011'],
    hidden: [
      '1 1\n0',
      '3 3\n101\n010\n101',
      `200 200\n${randGrid(51, 200, 200, ['0', '1'], 0.45).join('\n')}`,
    ],
    solve: (s) => {
      const ls = lines(s);
      const [rows = 0, cols = 0] = nums(ls[0] ?? '');
      const g = ls.slice(1, rows + 1).map((l) => [...l]);
      let count = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (g[r]![c] !== '1') continue;
          count++;
          const stack: [number, number][] = [[r, c]];
          g[r]![c] = '0';
          while (stack.length) {
            const [y, x] = stack.pop()!;
            for (const [dy, dx] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ] as const) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && g[ny]![nx] === '1') {
                g[ny]![nx] = '0';
                stack.push([ny, nx]);
              }
            }
          }
        }
      }
      return String(count);
    },
  },
  {
    key: 'shortest-path-grid',
    title: 'Shortest Path in a Grid',
    difficulty: 'medium',
    tags: ['graphs', 'bfs'],
    statement:
      'Move from the top-left cell to the bottom-right cell of a grid, one step up, down, left or right at a time. `.` is open and `#` is a wall. What is the fewest number of steps?',
    input: ['Line 1: rows cols', 'Next rows lines: the grid'],
    output:
      'The number of steps, or -1 if the target cannot be reached (or either corner is a wall).',
    hints: ['Breadth-first search finds shortest paths in unweighted grids.'],
    visible: ['3 3\n...\n.#.\n...', '2 2\n.#\n#.', '1 1\n.'],
    hidden: [
      '3 4\n....\n###.\n....',
      '2 2\n#.\n..',
      `150 150\n${randGrid(61, 150, 150, ['.', '#'], 0.25)
        .map((row, i, all) =>
          i === 0 ? '.' + row.slice(1) : i === all.length - 1 ? row.slice(0, -1) + '.' : row,
        )
        .join('\n')}`,
    ],
    solve: (s) => {
      const ls = lines(s);
      const [rows = 0, cols = 0] = nums(ls[0] ?? '');
      const g = ls.slice(1, rows + 1);
      if (g[0]?.[0] !== '.' || g[rows - 1]?.[cols - 1] !== '.') return '-1';
      const dist = Array.from({ length: rows }, () => new Array<number>(cols).fill(-1));
      dist[0]![0] = 0;
      const queue: [number, number][] = [[0, 0]];
      for (let head = 0; head < queue.length; head++) {
        const [y, x] = queue[head]!;
        if (y === rows - 1 && x === cols - 1) return String(dist[y]![x]);
        for (const [dy, dx] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const ny = y + dy;
          const nx = x + dx;
          if (
            ny >= 0 &&
            ny < rows &&
            nx >= 0 &&
            nx < cols &&
            g[ny]![nx] === '.' &&
            dist[ny]![nx] === -1
          ) {
            dist[ny]![nx] = dist[y]![x]! + 1;
            queue.push([ny, nx]);
          }
        }
      }
      return '-1';
    },
  },
  {
    key: 'valid-anagram',
    title: 'Valid Anagram',
    difficulty: 'easy',
    tags: ['strings', 'hashing'],
    statement: 'Are two lowercase words anagrams of each other (same letters, same counts)?',
    input: ['Line 1: first word', 'Line 2: second word'],
    output: '`true` or `false`.',
    hints: ['Count letters in one word and subtract the counts of the other.'],
    visible: ['anagram\nnagaram', 'rat\ncar'],
    hidden: [
      'a\nab',
      'listen\nsilent',
      (() => {
        const r = rng(71);
        const w = randWord(r, 50_000, 'abcdefghijklmnopqrstuvwxyz');
        return `${w}\n${[...w].reverse().join('')}`;
      })(),
    ],
    solve: (s) => {
      const [a = '', b = ''] = lines(s);
      return String([...a].sort().join('') === [...b].sort().join(''));
    },
  },
  {
    key: 'longest-substring-no-repeat',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    tags: ['strings', 'sliding window'],
    statement: 'Find the length of the longest substring that has no repeated characters.',
    input: ['Line 1: the string (may be empty)'],
    output: 'The length.',
    hints: ['Slide a window; when a character repeats, move the left edge past its last position.'],
    visible: ['abcabcbb', 'bbbbb', 'pwwkew'],
    hidden: ['', 'dvdf', ' ', randWord(rng(81), 20_000, 'abcdefghijklmnop')],
    solve: (s) => {
      const str = lines(s)[0] ?? '';
      const last = new Map<string, number>();
      let left = 0;
      let best = 0;
      [...str].forEach((ch, i) => {
        const prev = last.get(ch);
        if (prev !== undefined && prev >= left) left = prev + 1;
        last.set(ch, i);
        best = Math.max(best, i - left + 1);
      });
      return String(best);
    },
  },
  {
    key: 'product-except-self',
    title: 'Product of Array Except Self',
    difficulty: 'medium',
    tags: ['arrays', 'prefix sums'],
    statement:
      'For each position, print the product of all the other elements, without using division.',
    input: ['Line 1: n', 'Line 2: n integers (each between -9 and 9)'],
    output: 'n numbers separated by spaces.',
    hints: ['Multiply a running product from the left with a running product from the right.'],
    visible: ['4\n1 2 3 4', '5\n-1 1 0 -3 3'],
    hidden: ['2\n5 7', '3\n0 0 2', `12\n${randArr(91, 12, -9, 9).join(' ')}`],
    solve: (s) => {
      const a = nums(lines(s)[1] ?? '');
      const out = new Array<number>(a.length).fill(1);
      let left = 1;
      for (let i = 0; i < a.length; i++) {
        out[i] = left;
        left *= a[i]!;
      }
      let right = 1;
      for (let i = a.length - 1; i >= 0; i--) {
        out[i] = out[i]! * right;
        right *= a[i]!;
      }
      return out.map((x) => String(x === 0 ? 0 : x)).join(' ');
    },
  },
  {
    key: 'kth-largest',
    title: 'Kth Largest Element',
    difficulty: 'medium',
    tags: ['arrays', 'heap', 'sorting'],
    statement: 'Print the k-th largest element of the array (counting duplicates).',
    input: ['Line 1: n k', 'Line 2: n integers'],
    output: 'The k-th largest value.',
    hints: ['A min-heap of size k keeps the k largest values seen so far.'],
    visible: ['6 2\n3 2 1 5 6 4', '9 4\n3 2 3 1 2 4 5 5 6'],
    hidden: [
      '1 1\n-7',
      `50000 1234\n${randArr(101, 50_000, -1_000_000, 1_000_000).join(' ')}`,
      '5 5\n2 2 2 2 2',
    ],
    solve: (s) => {
      const ls = lines(s);
      const [, k = 1] = nums(ls[0] ?? '');
      const a = nums(ls[1] ?? '').sort((x, y) => y - x);
      return String(a[k - 1]);
    },
  },
  {
    key: 'rotate-matrix',
    title: 'Rotate a Matrix',
    difficulty: 'medium',
    tags: ['arrays', 'matrix'],
    statement: 'Rotate an n×n matrix 90 degrees clockwise.',
    input: ['Line 1: n', 'Next n lines: n integers each'],
    output: 'The rotated matrix, one row per line, values separated by spaces.',
    hints: ['Transpose the matrix, then reverse each row.'],
    visible: ['3\n1 2 3\n4 5 6\n7 8 9', '2\n1 2\n3 4'],
    hidden: [
      '1\n42',
      '4\n5 1 9 11\n2 4 8 10\n13 3 6 7\n15 14 12 16',
      (() => {
        const a = randArr(111, 400, -99, 99);
        return `20\n${Array.from({ length: 20 }, (_, i) => a.slice(i * 20, i * 20 + 20).join(' ')).join('\n')}`;
      })(),
    ],
    solve: (s) => {
      const ls = lines(s);
      const n = Number(ls[0]);
      const m = ls.slice(1, n + 1).map(nums);
      return Array.from({ length: n }, (_, r) =>
        Array.from({ length: n }, (_, c) => m[n - 1 - c]![r]).join(' '),
      ).join('\n');
    },
  },
  {
    key: 'spiral-order',
    title: 'Spiral Order',
    difficulty: 'medium',
    tags: ['arrays', 'matrix'],
    statement:
      'Print the elements of a matrix in clockwise spiral order, starting at the top-left.',
    input: ['Line 1: rows cols', 'Next rows lines: cols integers each'],
    output: 'All elements on one line, separated by spaces.',
    hints: ['Track top, bottom, left and right boundaries and shrink them after each side.'],
    visible: ['3 3\n1 2 3\n4 5 6\n7 8 9', '3 4\n1 2 3 4\n5 6 7 8\n9 10 11 12'],
    hidden: ['1 1\n7', '1 4\n1 2 3 4', '4 1\n1\n2\n3\n4', '2 3\n1 2 3\n4 5 6'],
    solve: (s) => {
      const ls = lines(s);
      const [rows = 0, cols = 0] = nums(ls[0] ?? '');
      const m = ls.slice(1, rows + 1).map(nums);
      const out: number[] = [];
      let top = 0;
      let bottom = rows - 1;
      let left = 0;
      let right = cols - 1;
      while (top <= bottom && left <= right) {
        for (let c = left; c <= right; c++) out.push(m[top]![c]!);
        for (let r = top + 1; r <= bottom; r++) out.push(m[r]![right]!);
        if (top < bottom) for (let c = right - 1; c >= left; c--) out.push(m[bottom]![c]!);
        if (left < right) for (let r = bottom - 1; r > top; r--) out.push(m[r]![left]!);
        top++;
        bottom--;
        left++;
        right--;
      }
      return out.join(' ');
    },
  },
  {
    key: 'binary-tree-height',
    title: 'Height of a Binary Tree',
    difficulty: 'easy',
    tags: ['trees', 'recursion'],
    statement:
      'A binary tree is given in level order, with `null` for missing children. Print its height: the number of nodes on the longest path from the root down to a leaf (an empty tree has height 0).',
    input: ['Line 1: level-order values separated by spaces (or `null` for an empty tree)'],
    output: 'The height.',
    hints: ['height(node) = 1 + max(height(left), height(right)).'],
    visible: ['3 9 20 null null 15 7', '1 null 2'],
    hidden: ['null', '1', randomBstLine(121, 300), '1 2 null 3 null 4 null 5'],
    solve: (s) => {
      const height = (n: TreeNode | null): number =>
        n ? 1 + Math.max(height(n.left), height(n.right)) : 0;
      return String(height(parseTree(lines(s)[0] ?? '')));
    },
  },
  {
    key: 'validate-bst',
    title: 'Validate a Binary Search Tree',
    difficulty: 'medium',
    tags: ['trees', 'recursion'],
    statement:
      'A binary tree is given in level order (`null` for missing children). Is it a valid binary search tree, where every left subtree holds strictly smaller values and every right subtree strictly larger ones?',
    input: ['Line 1: level-order values separated by spaces'],
    output: '`true` or `false`.',
    hints: [
      'Checking only parent and child is not enough; pass down the allowed (low, high) range.',
    ],
    visible: ['2 1 3', '5 1 4 null null 3 6'],
    hidden: ['1', '5 4 6 null null 3 7', '2 2 2', randomBstLine(131, 200)],
    solve: (s) => {
      const ok = (n: TreeNode | null, lo: number, hi: number): boolean =>
        !n || (n.val > lo && n.val < hi && ok(n.left, lo, n.val) && ok(n.right, n.val, hi));
      return String(ok(parseTree(lines(s)[0] ?? ''), -Infinity, Infinity));
    },
  },
  {
    key: 'level-sums',
    title: 'Sum of Each Tree Level',
    difficulty: 'medium',
    tags: ['trees', 'bfs'],
    statement:
      'A binary tree is given in level order (`null` for missing children). Print the sum of the values on each level, from the root down.',
    input: ['Line 1: level-order values separated by spaces'],
    output: 'One sum per line.',
    hints: ['Process the tree level by level with a queue.'],
    visible: ['3 9 20 null null 15 7', '1 2 3 4 5 6 7'],
    hidden: ['10', '-1 -2 3 null null -4', randomBstLine(141, 150)],
    solve: (s) => {
      const root = parseTree(lines(s)[0] ?? '');
      if (!root) return '';
      const out: number[] = [];
      let level = [root];
      while (level.length) {
        out.push(level.reduce((sum, n) => sum + n.val, 0));
        level = level.flatMap((n) => [n.left, n.right].filter((c): c is TreeNode => !!c));
      }
      return out.join('\n');
    },
  },
  {
    key: 'course-schedule',
    title: 'Course Schedule',
    difficulty: 'medium',
    tags: ['graphs', 'topological sort'],
    statement:
      'There are n courses labelled 0 to n − 1. Each prerequisite pair `a b` means course b must be taken before course a. Can all courses be finished?',
    input: ['Line 1: n m', 'Next m lines: a b'],
    output: '`true` or `false`.',
    hints: [
      'The answer is false exactly when the prerequisite graph has a cycle.',
      'Kahn’s algorithm: repeatedly take courses with no remaining prerequisites.',
    ],
    visible: ['2 1\n1 0', '2 2\n1 0\n0 1'],
    hidden: [
      '1 0',
      '4 4\n1 0\n2 1\n3 2\n1 3',
      (() => {
        const r = rng(151);
        const edges = Array.from({ length: 3000 }, () => {
          const a = randInt(r, 1, 999);
          return `${a} ${randInt(r, 0, a - 1)}`;
        });
        return `1000 3000\n${edges.join('\n')}`;
      })(),
    ],
    solve: (s) => {
      const ls = lines(s);
      const [n = 0, m = 0] = nums(ls[0] ?? '');
      const indeg = new Array<number>(n).fill(0);
      const adj: number[][] = Array.from({ length: n }, () => []);
      for (const l of ls.slice(1, m + 1)) {
        const [a = 0, b = 0] = nums(l);
        adj[b]!.push(a);
        indeg[a]!++;
      }
      const queue = indeg.flatMap((d, i) => (d === 0 ? [i] : []));
      let done = 0;
      for (let h = 0; h < queue.length; h++) {
        done++;
        for (const v of adj[queue[h]!]!) if (--indeg[v]! === 0) queue.push(v);
      }
      return String(done === n);
    },
  },
  {
    key: 'connected-components',
    title: 'Count Connected Components',
    difficulty: 'medium',
    tags: ['graphs', 'union find'],
    statement:
      'An undirected graph has n nodes (0 to n − 1) and m edges. How many connected components does it have?',
    input: ['Line 1: n m', 'Next m lines: u v'],
    output: 'The number of components.',
    hints: ['Union-find (disjoint set union) handles this in near-linear time.'],
    visible: ['5 3\n0 1\n1 2\n3 4', '5 4\n0 1\n1 2\n2 3\n3 4'],
    hidden: [
      '3 0',
      '4 2\n0 0\n2 3',
      (() => {
        const r = rng(161);
        const edges = Array.from(
          { length: 4000 },
          () => `${randInt(r, 0, 9999)} ${randInt(r, 0, 9999)}`,
        );
        return `10000 4000\n${edges.join('\n')}`;
      })(),
    ],
    solve: (s) => {
      const ls = lines(s);
      const [n = 0, m = 0] = nums(ls[0] ?? '');
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x: number): number => {
        while (parent[x] !== x) {
          parent[x] = parent[parent[x]!]!;
          x = parent[x]!;
        }
        return x;
      };
      let count = n;
      for (const l of ls.slice(1, m + 1)) {
        const [u = 0, v = 0] = nums(l);
        const a = find(u);
        const b = find(v);
        if (a !== b) {
          parent[a] = b;
          count--;
        }
      }
      return String(count);
    },
  },
  {
    key: 'edit-distance',
    title: 'Edit Distance',
    difficulty: 'hard',
    tags: ['dynamic programming', 'strings'],
    statement:
      'Find the minimum number of single-character insertions, deletions and replacements needed to turn the first word into the second.',
    input: ['Line 1: first word (may be empty)', 'Line 2: second word (may be empty)'],
    output: 'The edit distance.',
    hints: ['dp[i][j] = edit distance between the first i letters and the first j letters.'],
    visible: ['horse\nros', 'intention\nexecution'],
    hidden: [
      '\nabc',
      'same\nsame',
      (() => {
        const r = rng(171);
        return `${randWord(r, 800)}\n${randWord(r, 750)}`;
      })(),
    ],
    solve: (s) => {
      const [a = '', b = ''] = lines(s);
      let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
      for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
          cur[j] =
            a[i - 1] === b[j - 1]
              ? prev[j - 1]!
              : 1 + Math.min(prev[j - 1]!, prev[j]!, cur[j - 1]!);
        }
        prev = cur;
      }
      return String(prev[b.length]);
    },
  },
  {
    key: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'medium',
    tags: ['dynamic programming', 'strings'],
    statement: 'Find the length of the longest subsequence that appears in both strings.',
    input: ['Line 1: first string', 'Line 2: second string'],
    output: 'The length.',
    hints: ['If the last letters match, extend; otherwise drop one letter from either string.'],
    visible: ['abcde\nace', 'abc\ndef'],
    hidden: [
      'a\na',
      'abc\nabc',
      (() => {
        const r = rng(181);
        return `${randWord(r, 1000, 'acgt')}\n${randWord(r, 1000, 'acgt')}`;
      })(),
    ],
    solve: (s) => {
      const [a = '', b = ''] = lines(s);
      let prev = new Array<number>(b.length + 1).fill(0);
      for (let i = 1; i <= a.length; i++) {
        const cur = [0];
        for (let j = 1; j <= b.length; j++) {
          cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1]! + 1 : Math.max(prev[j]!, cur[j - 1]!);
        }
        prev = cur;
      }
      return String(prev[b.length]);
    },
  },
  {
    key: 'trapping-rain-water',
    title: 'Trapping Rain Water',
    difficulty: 'hard',
    tags: ['arrays', 'two pointers'],
    statement:
      'Bars of width 1 have the given heights. How many units of rain water are trapped between them after it rains?',
    input: ['Line 1: n', 'Line 2: n non-negative heights'],
    output: 'The total trapped water.',
    hints: [
      'Water above a bar = min(highest bar to its left, highest to its right) − its height.',
      'Two pointers can do it in O(1) extra space.',
    ],
    visible: ['12\n0 1 0 2 1 0 1 3 2 1 2 1', '6\n4 2 0 3 2 5'],
    hidden: ['1\n5', '3\n2 0 2', `20000\n${randArr(191, 20_000, 0, 1000).join(' ')}`],
    solve: (s) => {
      const h = nums(lines(s)[1] ?? '');
      let l = 0;
      let r = h.length - 1;
      let lmax = 0;
      let rmax = 0;
      let water = 0;
      while (l < r) {
        if (h[l]! < h[r]!) {
          lmax = Math.max(lmax, h[l]!);
          water += lmax - h[l]!;
          l++;
        } else {
          rmax = Math.max(rmax, h[r]!);
          water += rmax - h[r]!;
          r--;
        }
      }
      return String(water);
    },
  },
  {
    key: 'sliding-window-maximum',
    title: 'Sliding Window Maximum',
    difficulty: 'hard',
    tags: ['arrays', 'deque', 'sliding window'],
    statement: 'For every window of k consecutive elements, print the largest value in it.',
    input: ['Line 1: n k', 'Line 2: n integers'],
    output: 'n − k + 1 values separated by spaces.',
    hints: ['Keep a deque of indices whose values are decreasing.'],
    visible: ['8 3\n1 3 -1 -3 5 3 6 7', '1 1\n1'],
    hidden: [
      '5 5\n4 2 12 3 8',
      '6 2\n9 8 7 6 5 4',
      `30000 100\n${randArr(201, 30_000, -10_000, 10_000).join(' ')}`,
    ],
    solve: (s) => {
      const ls = lines(s);
      const [, k = 1] = nums(ls[0] ?? '');
      const a = nums(ls[1] ?? '');
      const dq: number[] = [];
      const out: number[] = [];
      let head = 0;
      for (let i = 0; i < a.length; i++) {
        while (dq.length > head && a[dq[dq.length - 1]!]! <= a[i]!) dq.pop();
        dq.push(i);
        if (dq[head]! <= i - k) head++;
        if (i >= k - 1) out.push(a[dq[head]!]!);
      }
      return out.join(' ');
    },
  },
  {
    key: 'word-break',
    title: 'Word Break',
    difficulty: 'medium',
    tags: ['dynamic programming', 'strings'],
    statement:
      'Can the string be split into a sequence of one or more words from the dictionary? Words may be reused.',
    input: ['Line 1: the string', 'Line 2: dictionary words separated by spaces'],
    output: '`true` or `false`.',
    hints: ['ok[i] is true if some word ends at i and ok[i − len(word)] is true.'],
    visible: ['leetcode\nleet code', 'catsandog\ncats dog sand and cat'],
    hidden: ['applepenapple\napple pen', 'a\nb', `${'a'.repeat(300)}b\na aa aaa aaaa`],
    solve: (s) => {
      const [str = '', dictLine = ''] = lines(s);
      const dict = new Set(dictLine.trim().split(/\s+/).filter(Boolean));
      const ok = new Array<boolean>(str.length + 1).fill(false);
      ok[0] = true;
      for (let i = 1; i <= str.length; i++) {
        for (const w of dict) {
          if (w.length <= i && ok[i - w.length] && str.slice(i - w.length, i) === w) {
            ok[i] = true;
            break;
          }
        }
      }
      return String(ok[str.length]);
    },
  },
  {
    key: 'n-queens-count',
    title: 'N-Queens: Count Solutions',
    difficulty: 'hard',
    tags: ['backtracking'],
    statement:
      'In how many ways can n queens be placed on an n×n board so that no two attack each other?',
    input: ['Line 1: n (1 ≤ n ≤ 10)'],
    output: 'The number of solutions.',
    hints: ['Place one queen per row; track used columns and both diagonals.'],
    visible: ['4', '1'],
    hidden: ['2', '6', '8', '10'],
    solve: (s) => {
      const n = Number(lines(s)[0]);
      let count = 0;
      const place = (row: number, cols: number, d1: number, d2: number) => {
        if (row === n) {
          count++;
          return;
        }
        let free = ~(cols | d1 | d2) & ((1 << n) - 1);
        while (free) {
          const bit = free & -free;
          free -= bit;
          place(row + 1, cols | bit, (d1 | bit) << 1, (d2 | bit) >> 1);
        }
      };
      place(0, 0, 0, 0);
      return String(count);
    },
  },
  {
    key: 'group-anagrams-count',
    title: 'Count Anagram Groups',
    difficulty: 'medium',
    tags: ['strings', 'hashing'],
    statement:
      'Group the words so that each group contains words that are anagrams of each other. How many groups are there?',
    input: ['Line 1: words separated by spaces'],
    output: 'The number of groups.',
    hints: ['Use each word’s sorted letters as a hash-map key.'],
    visible: ['eat tea tan ate nat bat', 'a'],
    hidden: [
      'abc bca cab xyz zyx',
      'aa a',
      Array.from({ length: 5000 }, (_, i) => randWord(rng(211 + (i % 700)), 4)).join(' '),
    ],
    solve: (s) => {
      const words = (lines(s)[0] ?? '').trim().split(/\s+/).filter(Boolean);
      return String(new Set(words.map((w) => [...w].sort().join(''))).size);
    },
  },
];
