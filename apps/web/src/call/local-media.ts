import { useCallback, useEffect, useMemo, useState } from 'react';

export interface MediaDevices {
  mics: MediaDeviceInfo[];
  cams: MediaDeviceInfo[];
  speakers: MediaDeviceInfo[];
}

export interface LocalMedia {
  /** Holds this tab's current audio and video tracks (either may be missing). */
  stream: MediaStream;
  /** Changes whenever a track is added, removed or swapped. */
  version: number;
  mic: boolean;
  cam: boolean;
  devices: MediaDevices;
  micId: string;
  camId: string;
  speakerId: string;
  /** Why the camera or microphone could not be used, in words for the user. */
  error: string | null;
  busy: boolean;
  setMic: (on: boolean) => Promise<void>;
  setCam: (on: boolean) => Promise<void>;
  selectMic: (deviceId: string) => Promise<void>;
  selectCam: (deviceId: string) => Promise<void>;
  selectSpeaker: (deviceId: string) => void;
  /** Stops every track (camera light off). */
  release: () => void;
}

const PREFS_KEY = 'sbs-call-devices';

interface Prefs {
  micId?: string;
  camId?: string;
  speakerId?: string;
  mic?: boolean;
  cam?: boolean;
}

function readPrefs(): Prefs {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Prefs;
  } catch {
    return {};
  }
}

function writePrefs(update: Prefs) {
  try {
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...readPrefs(), ...update }));
  } catch {
    // Not remembered; fine.
  }
}

type Device = 'camera' | 'microphone';

interface DeviceError {
  blocked: boolean;
  text: string;
}

function describeError(err: unknown, what: Device): DeviceError {
  const name = err instanceof DOMException ? err.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return {
      blocked: true,
      text: `Your browser blocked the ${what}. Allow it from the icon in the address bar, then try again.`,
    };
  }
  if (name === 'NotFoundError' || name === 'OverconstrainedError') {
    return { blocked: false, text: `No ${what} was found. Check that one is connected.` };
  }
  if (name === 'NotReadableError') {
    return {
      blocked: false,
      text: `The ${what} is in use by another app. Close it there and try again.`,
    };
  }
  return { blocked: false, text: `Could not start the ${what}.` };
}

/** One message for the user, combining camera and microphone problems. */
function errorText(errors: Partial<Record<Device, DeviceError>>): string | null {
  const { camera, microphone } = errors;
  if (camera?.blocked && microphone?.blocked) {
    return 'Your browser blocked the camera and microphone. Allow them from the icon in the address bar, then try again.';
  }
  return [camera?.text, microphone?.text].filter(Boolean).join(' ') || null;
}

export function mediaSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

/**
 * The local camera and microphone. Turning the camera off stops its track so the camera light
 * goes out; muting only disables the microphone track so unmuting is instant.
 */
export function useLocalMedia({ lowBandwidth = false }: { lowBandwidth?: boolean } = {}) {
  const [stream] = useState(() => new MediaStream());
  const [version, setVersion] = useState(0);
  const [prefs] = useState(readPrefs);
  const [mic, setMicState] = useState(false);
  const [cam, setCamState] = useState(false);
  const [devices, setDevices] = useState<MediaDevices>({ mics: [], cams: [], speakers: [] });
  const [micId, setMicId] = useState(prefs.micId ?? '');
  const [camId, setCamId] = useState(prefs.camId ?? '');
  const [speakerId, setSpeakerId] = useState(prefs.speakerId ?? '');
  const [errors, setErrors] = useState<Partial<Record<Device, DeviceError>>>({});
  const fail = useCallback(
    (what: Device, err: unknown) => setErrors((e) => ({ ...e, [what]: describeError(err, what) })),
    [],
  );
  const clear = useCallback(
    (what: Device) =>
      setErrors((e) => {
        const { [what]: _gone, ...rest } = e;
        return rest;
      }),
    [],
  );
  const error = errorText(errors);
  const [busy, setBusy] = useState(false);

  const bump = () => setVersion((v) => v + 1);

  // Device labels appear once the page has camera or microphone permission.
  const refreshDevices = useCallback(() => {
    void navigator.mediaDevices
      ?.enumerateDevices?.()
      .then((list) =>
        setDevices({
          mics: list.filter((d) => d.kind === 'audioinput' && d.deviceId),
          cams: list.filter((d) => d.kind === 'videoinput' && d.deviceId),
          speakers: list.filter((d) => d.kind === 'audiooutput' && d.deviceId),
        }),
      )
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  const replaceTrack = useCallback(
    (kind: 'audio' | 'video', track: MediaStreamTrack | null) => {
      for (const old of kind === 'audio' ? stream.getAudioTracks() : stream.getVideoTracks()) {
        old.stop();
        stream.removeTrack(old);
      }
      if (track) stream.addTrack(track);
      bump();
    },
    [stream],
  );

  const startAudio = useCallback(
    async (deviceId: string) => {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      const track = media.getAudioTracks()[0] ?? null;
      replaceTrack('audio', track);
      if (track) setMicId(track.getSettings().deviceId ?? deviceId);
      refreshDevices();
      return track;
    },
    [replaceTrack, refreshDevices],
  );

  const startVideo = useCallback(
    async (deviceId: string) => {
      const media = await navigator.mediaDevices.getUserMedia({
        video: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          width: { ideal: lowBandwidth ? 320 : 640 },
          height: { ideal: lowBandwidth ? 180 : 360 },
          frameRate: { ideal: lowBandwidth ? 12 : 24 },
        },
      });
      const track = media.getVideoTracks()[0] ?? null;
      replaceTrack('video', track);
      if (track) setCamId(track.getSettings().deviceId ?? deviceId);
      refreshDevices();
      return track;
    },
    [lowBandwidth, replaceTrack, refreshDevices],
  );

  const setMic = useCallback(
    async (on: boolean) => {
      clear('microphone');
      writePrefs({ mic: on });
      const existing = stream.getAudioTracks()[0];
      if (existing && existing.readyState === 'live') {
        existing.enabled = on;
        setMicState(on);
        bump();
        return;
      }
      if (!on) {
        setMicState(false);
        return;
      }
      setBusy(true);
      try {
        await startAudio(micId);
        setMicState(true);
      } catch (err) {
        // A saved device that's gone: fall back to the default one.
        if (micId && err instanceof DOMException && err.name === 'OverconstrainedError') {
          try {
            await startAudio('');
            setMicState(true);
            return;
          } catch (retry) {
            fail('microphone', retry);
          }
        } else {
          fail('microphone', err);
        }
        setMicState(false);
      } finally {
        setBusy(false);
      }
    },
    [stream, micId, startAudio, clear, fail],
  );

  const setCam = useCallback(
    async (on: boolean) => {
      clear('camera');
      writePrefs({ cam: on });
      if (!on) {
        replaceTrack('video', null);
        setCamState(false);
        return;
      }
      setBusy(true);
      try {
        await startVideo(camId);
        setCamState(true);
      } catch (err) {
        if (camId && err instanceof DOMException && err.name === 'OverconstrainedError') {
          try {
            await startVideo('');
            setCamState(true);
            return;
          } catch (retry) {
            fail('camera', retry);
          }
        } else {
          fail('camera', err);
        }
        setCamState(false);
      } finally {
        setBusy(false);
      }
    },
    [camId, replaceTrack, startVideo, clear, fail],
  );

  const selectMic = useCallback(
    async (deviceId: string) => {
      setMicId(deviceId);
      writePrefs({ micId: deviceId });
      if (!stream.getAudioTracks()[0]) return;
      try {
        const track = await startAudio(deviceId);
        if (track) track.enabled = mic;
      } catch (err) {
        fail('microphone', err);
      }
    },
    [stream, mic, startAudio, fail],
  );

  const selectCam = useCallback(
    async (deviceId: string) => {
      setCamId(deviceId);
      writePrefs({ camId: deviceId });
      if (!cam) return;
      try {
        await startVideo(deviceId);
      } catch (err) {
        fail('camera', err);
      }
    },
    [cam, startVideo, fail],
  );

  const selectSpeaker = useCallback((deviceId: string) => {
    setSpeakerId(deviceId);
    writePrefs({ speakerId: deviceId });
  }, []);

  const release = useCallback(() => {
    // Nothing running: don't re-render (callers may run this from an effect).
    if (!stream.getTracks().length) {
      setMicState(false);
      setCamState(false);
      return;
    }
    for (const t of stream.getTracks()) {
      t.stop();
      stream.removeTrack(t);
    }
    setMicState(false);
    setCamState(false);
    bump();
  }, [stream]);

  // Stop the camera and microphone when the room is left.
  useEffect(() => () => stream.getTracks().forEach((t) => t.stop()), [stream]);

  return useMemo<LocalMedia>(
    () => ({
      stream,
      version,
      mic,
      cam,
      devices,
      micId,
      camId,
      speakerId,
      error,
      busy,
      setMic,
      setCam,
      selectMic,
      selectCam,
      selectSpeaker,
      release,
    }),
    [
      stream,
      version,
      mic,
      cam,
      devices,
      micId,
      camId,
      speakerId,
      error,
      busy,
      setMic,
      setCam,
      selectMic,
      selectCam,
      selectSpeaker,
      release,
    ],
  );
}

/** What the visitor chose last time (the lobby starts from it). */
export function savedMediaChoice(): { mic: boolean; cam: boolean } {
  const p = readPrefs();
  return { mic: p.mic ?? true, cam: p.cam ?? true };
}
