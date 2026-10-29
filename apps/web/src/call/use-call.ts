import type { CallPresence, IceServer, RtcSignal } from '@sidebyside/shared';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RoomConnection } from '@/room/use-room';
import type { LocalMedia } from './local-media';

/**
 * Public STUN servers let two browsers find a direct route to each other; used until the room's
 * own list (which adds a TURN relay for strict networks, when the server has one) arrives.
 */
const STUN_ONLY: RTCIceServer[] = [
  { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
];
/** An offer that got no answer in this long is sent again on a fresh connection. */
const ANSWER_TIMEOUT_MS = 10_000;
/** A link the room doesn't list (yet) is kept this long before it's treated as gone. */
const UNLISTED_GRACE_MS = 6_000;

export type LinkState = RTCPeerConnectionState;

export interface RemoteParticipant {
  callId: string;
  clientId: number;
  participantId: string;
  name: string;
  role: string;
  color: string;
  mic: boolean;
  cam: boolean;
  stream: MediaStream | null;
  state: LinkState;
}

export interface CallState {
  joined: boolean;
  callId: string;
  remotes: RemoteParticipant[];
  /** People in the room who haven't joined the call. */
  notJoined: { clientId: number; name: string }[];
  join: () => void;
  leave: () => void;
}

interface PeerLink {
  pc: RTCPeerConnection;
  /** The tab with the smaller call id makes the offers, so the two never offer at once. */
  offerer: boolean;
  /** Signals for this peer are handled one at a time, in order. */
  queue: Promise<void>;
  stream: MediaStream | null;
  createdAt: number;
  offeredAt: number | null;
}

function newCallId(): string {
  return `c${crypto.randomUUID().replaceAll('-', '')}`;
}

/** Puts this tab's current tracks on a connection's senders (no renegotiation needed). */
function attachTracks(pc: RTCPeerConnection, media: MediaStream) {
  for (const t of pc.getTransceivers()) {
    if (t.direction === 'stopped' || t.direction === 'inactive') continue;
    const kind = t.receiver.track.kind;
    const track = (kind === 'audio' ? media.getAudioTracks() : media.getVideoTracks())[0] ?? null;
    if (t.sender.track !== track) void t.sender.replaceTrack(track).catch(() => {});
  }
}

/**
 * A mesh video call between the people in a room: every pair of tabs in the call has its own
 * peer connection. Signalling goes through the room's socket; audio and video go directly
 * between browsers. Fine for an interview (2–4 people).
 */
export function useCall(
  conn: RoomConnection | null,
  media: LocalMedia,
  iceServers?: IceServer[],
): CallState {
  // A new id on every join, so leaving and rejoining looks like a new peer to the others.
  const [callId, setCallId] = useState(newCallId);
  const [joined, setJoined] = useState(false);
  const links = useRef(new Map<string, PeerLink>());
  /** Call ids the room currently lists as in the call. */
  const listed = useRef(new Set<string>());
  // What render needs from the links, copied out of the ref whenever a link changes.
  const [linkInfo, setLinkInfo] = useState<
    Record<string, { stream: MediaStream | null; state: LinkState }>
  >({});
  const rerender = useCallback(() => {
    setLinkInfo(
      Object.fromEntries(
        [...links.current].map(([id, l]) => [
          id,
          { stream: l.stream, state: l.pc.connectionState },
        ]),
      ),
    );
  }, []);
  const mediaRef = useRef(media);
  const connRef = useRef(conn);
  const iceRef = useRef<RTCIceServer[]>(STUN_ONLY);
  useEffect(() => {
    mediaRef.current = media;
    connRef.current = conn;
    if (iceServers?.length) iceRef.current = iceServers;
  });

  const signal = useCallback(
    (to: string, s: RtcSignal) => {
      connRef.current?.send({ kind: 'rtc', from: callId, to, signal: s });
    },
    [callId],
  );

  const closeLink = useCallback(
    (remoteId: string) => {
      const link = links.current.get(remoteId);
      if (!link) return;
      links.current.delete(remoteId);
      link.pc.onicecandidate = null;
      link.pc.ontrack = null;
      link.pc.onconnectionstatechange = null;
      link.pc.onnegotiationneeded = null;
      link.pc.close();
      rerender();
    },
    [rerender],
  );

  const createLink = useCallback(
    (remoteId: string): PeerLink => {
      const offerer = callId < remoteId;
      const pc = new RTCPeerConnection({ iceServers: iceRef.current });
      const link: PeerLink = {
        pc,
        offerer,
        queue: Promise.resolve(),
        stream: null,
        createdAt: Date.now(),
        offeredAt: null,
      };
      links.current.set(remoteId, link);

      pc.onicecandidate = ({ candidate: c }) => {
        signal(remoteId, {
          type: 'candidate',
          candidate: c
            ? {
                candidate: c.candidate,
                sdpMid: c.sdpMid,
                sdpMLineIndex: c.sdpMLineIndex,
                usernameFragment: c.usernameFragment,
              }
            : null,
        });
      };
      pc.ontrack = () => {
        link.stream = new MediaStream(pc.getReceivers().map((r) => r.track));
        rerender();
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' && offerer) pc.restartIce();
        rerender();
      };
      pc.onnegotiationneeded = async () => {
        if (!offerer) return;
        try {
          await pc.setLocalDescription();
          link.offeredAt = Date.now();
          if (pc.localDescription) {
            signal(remoteId, { type: 'description', description: pc.localDescription.toJSON() });
          }
        } catch {
          // A later negotiation will try again.
        }
      };

      if (offerer) {
        pc.addTransceiver('audio', { direction: 'sendrecv' });
        pc.addTransceiver('video', { direction: 'sendrecv' });
        attachTracks(pc, mediaRef.current.stream);
      }
      rerender();
      return link;
    },
    [callId, signal, rerender],
  );

  // Signals from other tabs.
  useEffect(() => {
    if (!conn) return;
    if (!joined) {
      conn.onRtcSignal(null);
      return;
    }
    const answer = async (link: PeerLink, from: string, offer: RTCSessionDescriptionInit) => {
      const { pc } = link;
      await pc.setRemoteDescription(offer);
      for (const t of pc.getTransceivers()) t.direction = 'sendrecv';
      attachTracks(pc, mediaRef.current.stream);
      await pc.setLocalDescription();
      if (pc.localDescription) {
        signal(from, { type: 'description', description: pc.localDescription.toJSON() });
      }
      link.stream = new MediaStream(pc.getReceivers().map((r) => r.track));
      rerender();
    };
    conn.onRtcSignal((from, s) => {
      const link = links.current.get(from) ?? createLink(from);
      link.queue = link.queue
        .then(async () => {
          const { pc } = link;
          if (s.type === 'candidate') {
            if (s.candidate) await pc.addIceCandidate(s.candidate).catch(() => {});
            return;
          }
          const description = s.description as RTCSessionDescriptionInit;
          if (description.type === 'offer') {
            if (link.offerer) return; // Never happens with the id rule; ignore if it does.
            try {
              await answer(link, from, description);
            } catch {
              // The other tab started over with a new connection; do the same.
              closeLink(from);
              await answer(createLink(from), from, description);
            }
          } else if (description.type === 'answer' && pc.signalingState === 'have-local-offer') {
            await pc.setRemoteDescription(description);
            link.offeredAt = null;
          }
        })
        .catch(() => {});
    });
    return () => conn.onRtcSignal(null);
  }, [conn, joined, createLink, closeLink, signal, rerender]);

  // Tell the room this tab's call id (before announcing it, so offers can find us), then
  // publish whether we're in the call and whether mic and camera are on.
  const presence: CallPresence | null = joined
    ? { id: callId, mic: media.mic, cam: media.cam }
    : null;
  const presenceKey = JSON.stringify(presence);
  const connected = conn?.status === 'connected';
  useEffect(() => {
    if (!conn) return;
    if (presence && connected) conn.send({ kind: 'rtc', from: callId });
    conn.provider.awareness.setLocalStateField('call', presence);
    // presenceKey covers presence's contents.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conn, presenceKey, callId, connected]);

  // Create links to everyone in the call (offerers) and drop links to people who left.
  const inCall =
    conn && joined
      ? conn.peers.filter(
          (p) => p.clientId !== conn.doc.clientID && p.state.call && p.state.call.id !== callId,
        )
      : [];
  const inCallKey = inCall.map((p) => p.state.call!.id).join(',');
  useEffect(() => {
    if (!joined) {
      for (const id of [...links.current.keys()]) closeLink(id);
      return;
    }
    const wanted = new Set(inCallKey ? inCallKey.split(',') : []);
    for (const id of wanted) {
      if (!links.current.has(id) && callId < id) createLink(id);
    }
    listed.current = wanted;
  }, [joined, inCallKey, callId, createLink, closeLink]);

  // Housekeeping: drop links to people who left the call (after a grace period, since a signal
  // can arrive before the room lists its sender), and retry offers that went unanswered.
  useEffect(() => {
    if (!joined) return;
    const id = setInterval(() => {
      const now = Date.now();
      for (const [remoteId, link] of links.current) {
        if (!listed.current.has(remoteId) && now - link.createdAt > UNLISTED_GRACE_MS) {
          closeLink(remoteId);
          continue;
        }
        if (
          link.offerer &&
          link.offeredAt !== null &&
          link.pc.signalingState === 'have-local-offer' &&
          now - link.offeredAt > ANSWER_TIMEOUT_MS
        ) {
          closeLink(remoteId);
          createLink(remoteId);
        }
      }
    }, 3_000);
    return () => clearInterval(id);
  }, [joined, closeLink, createLink]);

  // New or changed local tracks go out on every connection.
  useEffect(() => {
    for (const link of links.current.values()) attachTracks(link.pc, media.stream);
  }, [media.stream, media.version]);

  // Leaving the page closes every connection.
  useEffect(
    () => () => {
      for (const link of links.current.values()) link.pc.close();
      links.current.clear();
    },
    [],
  );

  const join = useCallback(() => {
    setCallId(newCallId());
    setJoined(true);
  }, []);
  const leave = useCallback(() => setJoined(false), []);

  const remotes: RemoteParticipant[] = inCall.map((p) => {
    const call = p.state.call!;
    const link = linkInfo[call.id];
    return {
      callId: call.id,
      clientId: p.clientId,
      participantId: p.state.user.participantId,
      name: p.state.user.name,
      role: p.state.user.role,
      color: p.state.user.color,
      mic: call.mic,
      cam: call.cam,
      stream: link?.stream ?? null,
      state: link?.state ?? 'new',
    };
  });

  const peers = conn?.peers;
  const selfClient = conn?.doc.clientID;
  const notJoined = useMemo(() => {
    const seen = new Set<string>();
    const list: { clientId: number; name: string }[] = [];
    for (const p of peers ?? []) {
      if (p.clientId === selfClient || p.state.call) continue;
      if (seen.has(p.state.user.participantId)) continue;
      seen.add(p.state.user.participantId);
      list.push({ clientId: p.clientId, name: p.state.user.name });
    }
    return list;
  }, [peers, selfClient]);

  return { joined, callId, remotes, notJoined, join, leave };
}

// ---------------------------------------------------------------------------
// Speaking indicator
// ---------------------------------------------------------------------------

let audioContext: AudioContext | null = null;

function sharedAudioContext(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  audioContext ??= new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume().catch(() => {});
  return audioContext;
}

/** True while the stream's audio is above a speaking level. */
export function useSpeaking(stream: MediaStream | null, version = 0): boolean {
  const [speaking, setSpeaking] = useState(false);
  useEffect(() => {
    const track = stream?.getAudioTracks()[0];
    const ctx = track ? sharedAudioContext() : null;
    if (!track || !ctx) return;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    let last = false;
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      const loud = track.enabled && Math.sqrt(sum / data.length) > 6;
      if (loud !== last) {
        last = loud;
        setSpeaking(loud);
      }
    }, 150);
    return () => {
      clearInterval(id);
      source.disconnect();
      setSpeaking(false);
    };
  }, [stream, version]);
  return speaking;
}

/** 0–1 microphone level, for the lobby's meter. */
export function useAudioLevel(stream: MediaStream, version: number, enabled: boolean): number {
  const [level, setLevel] = useState(0);
  useEffect(() => {
    const track = stream.getAudioTracks()[0];
    const ctx = track && enabled ? sharedAudioContext() : null;
    if (!track || !ctx) return;
    const source = ctx.createMediaStreamSource(new MediaStream([track]));
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const id = setInterval(() => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (const v of data) sum += (v - 128) ** 2;
      setLevel(Math.min(1, Math.sqrt(sum / data.length) / 40));
    }, 100);
    return () => {
      clearInterval(id);
      source.disconnect();
      setLevel(0);
    };
  }, [stream, version, enabled]);
  return level;
}
