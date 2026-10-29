/**
 * Room IDs: the last part of a room's link, short enough to read out and type, e.g.
 * "kxmp-7rtw-q4hn". Anyone with the ID can join as a guest, so it stays unguessable: 12
 * characters from 32 give 60 random bits. Rooms made before these IDs keep their 10-character
 * mixed-case slug, and their links still work.
 */

/** Lowercase letters and digits without look-alikes (no 0/o, 1/l). 32 characters. */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789';
const GROUPS = 3;
const GROUP_LENGTH = 4;

const ROOM_ID = /^[a-km-np-z2-9]{12}$/;
const OLDER_ROOM_SLUG = /^[a-km-np-zA-HJ-NP-Z2-9]{10}$/;

/** A new random room ID. */
export function generateRoomId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(GROUPS * GROUP_LENGTH));
  // 32 divides 256, so taking each byte modulo 32 keeps every character equally likely.
  return formatRoomId([...bytes].map((b) => ALPHABET[b % ALPHABET.length]).join(''));
}

function formatRoomId(compact: string): string {
  const groups: string[] = [];
  for (let i = 0; i < compact.length; i += GROUP_LENGTH) {
    groups.push(compact.slice(i, i + GROUP_LENGTH));
  }
  return groups.join('-');
}

/**
 * The room slug in what someone typed or pasted: a room ID in any case, with or without dashes
 * or spaces, or a whole room link. Null when it can't be one.
 */
export function parseRoomId(input: string): string | null {
  let text = input.trim();
  const fromLink = /\/r\/([^/?#\s]+)/.exec(text);
  if (fromLink) text = fromLink[1]!;
  const compact = text.replace(/[\s-]/g, '');
  if (ROOM_ID.test(compact.toLowerCase())) return formatRoomId(compact.toLowerCase());
  // Older rooms' slugs are case-sensitive, so they must be typed exactly.
  if (OLDER_ROOM_SLUG.test(compact)) return compact;
  return null;
}
