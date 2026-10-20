import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getCodeMap, getHints, initializeSharedDoc, readProblem, showQuestionInDoc } from './doc';
import { outputsMatch } from './questions';

const problem = (id: string) => ({
  questionId: id,
  title: `Q ${id}`,
  difficulty: 'easy',
  descriptionMd: 'Do it',
  hintCount: 1,
});

describe('showQuestionInDoc', () => {
  it('loads starter code only into buffers the candidate has not touched', () => {
    const doc = new Y.Doc();
    initializeSharedDoc(doc, 'python');
    const code = getCodeMap(doc);
    code.get('javascript')!.insert(0, '// my work\n');
    getHints(doc).push([{ index: 0, text: 'old hint' }]);

    showQuestionInDoc(doc, problem('a'), { python: 'PY A', javascript: 'JS A' });
    expect(code.get('python')!.toString()).toBe('PY A');
    expect(code.get('javascript')!.toString()).toContain('// my work');
    expect(readProblem(doc)?.questionId).toBe('a');
    expect(getHints(doc).length).toBe(0);

    // A second question replaces the first question's untouched starter.
    showQuestionInDoc(doc, problem('b'), { python: 'PY B' });
    expect(code.get('python')!.toString()).toBe('PY B');

    // Edited code survives the next question.
    code.get('python')!.insert(0, 'x = 1\n');
    showQuestionInDoc(doc, problem('c'), { python: 'PY C' });
    expect(code.get('python')!.toString()).toBe('x = 1\nPY B');
  });
});

describe('outputsMatch', () => {
  it('ignores trailing whitespace and trailing blank lines only', () => {
    expect(outputsMatch('1 2\n3\n', '1 2\n3')).toBe(true);
    expect(outputsMatch('1 2   \r\n3\n\n\n', '1 2\n3')).toBe(true);
    expect(outputsMatch(' 1 2\n3', '1 2\n3')).toBe(false);
    expect(outputsMatch('1  2', '1 2')).toBe(false);
    expect(outputsMatch('', '')).toBe(true);
    expect(outputsMatch('\n', '')).toBe(true);
  });
});
