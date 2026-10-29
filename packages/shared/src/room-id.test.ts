import { describe, expect, it } from 'vitest';
import { generateRoomId, parseRoomId } from './room-id';

describe('room IDs', () => {
  it('are three groups of four lowercase letters and digits, without look-alikes', () => {
    const ids = Array.from({ length: 200 }, generateRoomId);
    for (const id of ids)
      expect(id).toMatch(/^[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}-[a-km-np-z2-9]{4}$/);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('read back from what people type, in any case and with or without dashes', () => {
    for (const typed of ['kxmp-7rtw-q4hn', 'KXMP-7RTW-Q4HN', 'kxmp7rtwq4hn', ' kxmp 7rtw q4hn ']) {
      expect(parseRoomId(typed)).toBe('kxmp-7rtw-q4hn');
    }
  });

  it('read back from a pasted room link', () => {
    expect(parseRoomId('https://sidebyside.example/r/kxmp-7rtw-q4hn')).toBe('kxmp-7rtw-q4hn');
    expect(parseRoomId('sidebyside.example/r/kxmp-7rtw-q4hn?invite=abc')).toBe('kxmp-7rtw-q4hn');
  });

  it('keep older rooms’ case-sensitive slugs exactly as typed', () => {
    expect(parseRoomId('aB3kq7XmPz')).toBe('aB3kq7XmPz');
    expect(parseRoomId('https://sidebyside.example/r/aB3kq7XmPz')).toBe('aB3kq7XmPz');
  });

  it('turn down anything that can’t be a room', () => {
    for (const typed of [
      '',
      'hello',
      '482913',
      'kxmp-7rtw-q4h',
      'kxmp-7rtw-q4hnn',
      'oxmp-7rtw-q4hn',
    ]) {
      expect(parseRoomId(typed)).toBeNull();
    }
  });
});
