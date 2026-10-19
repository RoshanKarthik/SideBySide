import { ROOM_SLUG_LENGTH } from '@sidebyside/shared';

// No look-alike characters (0/O, 1/l/I), so links survive being read aloud or retyped.
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** A random, URL-safe, unguessable room slug (~57 bits of entropy at 10 characters). */
export function randomSlug(length = ROOM_SLUG_LENGTH): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length * 2));
  let out = '';
  // Rejection sampling keeps the distribution uniform.
  const limit = 256 - (256 % ALPHABET.length);
  for (const b of bytes) {
    if (b >= limit) continue;
    out += ALPHABET[b % ALPHABET.length];
    if (out.length === length) return out;
  }
  return out + randomSlug(length - out.length);
}
