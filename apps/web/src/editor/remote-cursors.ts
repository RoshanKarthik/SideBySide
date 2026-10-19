import type { Peer } from '@/room/use-room';

const cssString = (s: string) => `"${s.replace(/[\\"\n\r]/g, ' ')}"`;

/**
 * y-monaco marks remote selections with per-client class names; this writes the matching
 * colour and name-label rules for everyone currently in the room.
 */
export function remoteCursorCss(peers: Peer[], selfClientId: number): string {
  return peers
    .filter((p) => p.clientId !== selfClientId)
    .map(({ clientId, state }) => {
      const color = /^#[0-9a-f]{6}$/i.test(state.user.color) ? state.user.color : '#888888';
      return [
        `.yRemoteSelection-${clientId} { background-color: ${color}33; }`,
        `.yRemoteSelectionHead-${clientId} { border-color: ${color}; }`,
        `.yRemoteSelectionHead-${clientId}::after { content: ${cssString(state.user.name)}; background: ${color}; }`,
      ].join('\n');
    })
    .join('\n');
}
