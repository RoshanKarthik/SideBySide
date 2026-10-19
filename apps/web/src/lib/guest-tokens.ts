/**
 * Guest candidates have no account; their room-scoped token is kept per room in this browser
 * so a refresh or reconnect lands them back in the same seat.
 */
const KEY = (roomKey: string) => `sbs-guest:${roomKey}`;

export function getGuestToken(roomKey: string): string | null {
  try {
    return localStorage.getItem(KEY(roomKey));
  } catch {
    return null;
  }
}

export function setGuestToken(roomKey: string, token: string): void {
  try {
    localStorage.setItem(KEY(roomKey), token);
  } catch {
    // Storage blocked: the guest can still use the room until they reload.
  }
}
