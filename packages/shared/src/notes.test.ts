import { describe, expect, it } from 'vitest';
import * as Y from 'yjs';
import { getNotes, notesToText } from './doc';

function paragraph(text: string) {
  const p = new Y.XmlElement('paragraph');
  p.insert(0, [new Y.XmlText(text)]);
  return p;
}

describe('notesToText', () => {
  it('turns blocks into lines and list items into dashes', () => {
    const doc = new Y.Doc();
    const notes = getNotes(doc);
    const list = new Y.XmlElement('bulletList');
    const item = new Y.XmlElement('listItem');
    item.insert(0, [paragraph('use a hash map')]);
    list.insert(0, [item]);
    notes.insert(0, [paragraph('Two Sum'), list, paragraph('O(n) time')]);
    expect(notesToText(notes)).toBe('Two Sum\n- use a hash map\nO(n) time');
  });

  it('is empty for empty notes', () => {
    expect(notesToText(getNotes(new Y.Doc()))).toBe('');
  });
});
