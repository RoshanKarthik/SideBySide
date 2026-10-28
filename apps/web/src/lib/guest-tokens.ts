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

/**
 * A guest's claim token for an ended session, kept in this browser (not the URL) while they
 * sign up or sign in, so the link can't leak through history or a provider redirect.
 */
const CLAIM_KEY = (roomId: string) => `sbs-claim:${roomId}`;

export function getClaimToken(roomId: string): string | null {
  try {
    return localStorage.getItem(CLAIM_KEY(roomId));
  } catch {
    return null;
  }
}

export function setClaimToken(roomId: string, token: string): void {
  try {
    localStorage.setItem(CLAIM_KEY(roomId), token);
  } catch {
    // Storage blocked: the claim page explains that the link can't be used.
  }
}

export function clearClaimToken(roomId: string): void {
  try {
    localStorage.removeItem(CLAIM_KEY(roomId));
  } catch {
    // Nothing to clear.
  }
}

/**
 * A link that claims the session from any browser: the token rides in the fragment, which
 * browsers never send to a server or leak in Referer headers.
 */
export function claimLink(roomId: string, token: string): string {
  return `${window.location.origin}/claim/${roomId}#t=${encodeURIComponent(token)}`;
}

/** Moves a token from a claim link's fragment into this browser's storage and off the URL. */
export function takeClaimTokenFromUrl(roomId: string): string | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get('t');
  if (!token) return null;
  setClaimToken(roomId, token);
  window.history.replaceState(window.history.state, '', window.location.pathname);
  return token;
}
