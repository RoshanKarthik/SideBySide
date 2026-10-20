import type { QuestionInput } from '@sidebyside/shared';
import { SEED_QUESTIONS, type SeedQuestion } from './questions';
import { starterCode } from './starters';

const fence = (text: string) => '```\n' + (text === '' ? '(empty)' : text) + '\n```';

function describe(q: SeedQuestion): string {
  const example = q.visible[0] ?? '';
  return [
    q.statement,
    '### Input',
    q.input.map((l) => `- ${l}`).join('\n'),
    '### Output',
    q.output,
    '### Example',
    '**Input**',
    fence(example),
    '**Output**',
    fence(q.solve(example)),
  ].join('\n\n');
}

export interface BuiltQuestion extends QuestionInput {
  seedKey: string;
}

/** Turns the seed definitions into question rows with computed expected outputs. */
export function buildSeedQuestions(): BuiltQuestion[] {
  return SEED_QUESTIONS.map((q) => ({
    seedKey: q.key,
    title: q.title,
    descriptionMd: describe(q),
    difficulty: q.difficulty,
    tags: q.tags,
    hints: q.hints,
    starterCode: starterCode(q.input),
    testCases: [
      ...q.visible.map((stdin) => ({
        stdin,
        expectedStdout: q.solve(stdin),
        isHidden: false,
        weight: 1,
      })),
      ...q.hidden.map((stdin) => ({
        stdin,
        expectedStdout: q.solve(stdin),
        isHidden: true,
        weight: 1,
      })),
    ],
  }));
}
