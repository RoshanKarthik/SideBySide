import {
  ChevronDown,
  ChevronUp,
  Maximize2,
  Mic,
  MicOff,
  Minimize2,
  Phone,
  PhoneOff,
  Settings2,
  Video,
  VideoOff,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/card';
import { Field, NativeSelect } from '@/components/ui/form';
import { Avatar, Dialog, DialogContent, DialogTrigger, Tooltip } from '@/components/ui/overlay';
import { cn } from '@/lib/utils';
import { savedMediaChoice, type LocalMedia } from './local-media';
import { useSpeaking, type CallState, type RemoteParticipant } from './use-call';

type SinkVideo = HTMLVideoElement & { setSinkId?: (id: string) => Promise<void> };

/** One person's video, or their avatar while their camera is off. Remote audio plays here too. */
export function VideoTile({
  stream,
  version,
  name,
  id,
  mic,
  cam,
  self = false,
  speakerId,
  status,
  className,
}: {
  stream: MediaStream | null;
  version?: number;
  name: string;
  id: string;
  mic: boolean;
  cam: boolean;
  self?: boolean;
  speakerId?: string;
  status?: RemoteParticipant['state'];
  className?: string;
}) {
  const video = useRef<SinkVideo>(null);
  const speaking = useSpeaking(stream, version) && mic;

  useEffect(() => {
    const el = video.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    if (stream) void el.play().catch(() => {});
  }, [stream, version]);

  useEffect(() => {
    const el = video.current;
    if (!el || self || !speakerId || !el.setSinkId) return;
    void el.setSinkId(speakerId).catch(() => {});
  }, [speakerId, self]);

  const connecting = !self && status !== 'connected';

  return (
    <div
      className={cn(
        'relative isolate aspect-video overflow-hidden rounded-lg bg-[oklch(0.25_0.015_260)] ring-2 ring-transparent transition-shadow',
        speaking && 'ring-primary',
        className,
      )}
    >
      {/* Kept mounted while the camera is off so remote audio keeps playing. */}
      <video
        ref={video}
        autoPlay
        playsInline
        muted={self}
        className={cn(
          'absolute inset-0 size-full object-cover',
          self && 'scale-x-[-1]',
          !cam && 'opacity-0',
        )}
      />
      {!cam && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Avatar name={name} id={id} size={48} />
        </div>
      )}
      {connecting && (
        <span className="absolute top-1.5 right-1.5 flex items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white">
          <Spinner className="size-2.5" />
          {status === 'failed' ? 'Reconnecting' : 'Connecting'}
        </span>
      )}
      <span className="absolute bottom-1.5 left-1.5 flex max-w-[calc(100%-0.75rem)] items-center gap-1 rounded bg-black/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
        {mic ? <Mic className="size-3" /> : <MicOff className="size-3 text-red-300" />}
        <span className="truncate">
          {name}
          {self && ' (you)'}
        </span>
      </span>
    </div>
  );
}

/** Camera, microphone, devices and join/leave — the call's toolbar in the room header. */
export function CallControls({ call, media }: { call: CallState; media: LocalMedia }) {
  if (!call.joined) {
    return (
      <Button
        size="sm"
        variant="success"
        onClick={() => {
          // Come back with the camera and microphone as they were last chosen.
          const choice = savedMediaChoice();
          if (choice.mic) void media.setMic(true);
          if (choice.cam) void media.setCam(true);
          call.join();
        }}
      >
        <Phone /> Join call
      </Button>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-card p-0.5 shadow-card">
      <Tooltip content={media.cam ? 'Turn camera off' : 'Turn camera on'}>
        <Button
          size="icon-sm"
          variant={media.cam ? 'ghost' : 'secondary'}
          aria-pressed={media.cam}
          aria-label={media.cam ? 'Turn camera off' : 'Turn camera on'}
          disabled={media.busy}
          onClick={() => void media.setCam(!media.cam)}
        >
          {media.cam ? <Video /> : <VideoOff className="text-destructive" />}
        </Button>
      </Tooltip>
      <Tooltip content={media.mic ? 'Mute' : 'Unmute'}>
        <Button
          size="icon-sm"
          variant={media.mic ? 'ghost' : 'secondary'}
          aria-pressed={media.mic}
          aria-label={media.mic ? 'Mute microphone' : 'Unmute microphone'}
          disabled={media.busy}
          onClick={() => void media.setMic(!media.mic)}
        >
          {media.mic ? <Mic /> : <MicOff className="text-destructive" />}
        </Button>
      </Tooltip>
      <DeviceSettings media={media} />
      <Button
        size="sm"
        variant="destructive"
        className="ml-0.5 h-7"
        onClick={() => {
          call.leave();
          media.release();
        }}
      >
        <PhoneOff /> Leave
      </Button>
    </div>
  );
}

export function DeviceSettings({ media, label }: { media: LocalMedia; label?: string }) {
  return (
    <Dialog>
      <Tooltip content="Device settings">
        <DialogTrigger asChild>
          <Button size={label ? 'sm' : 'icon-sm'} variant="ghost" aria-label="Device settings">
            <Settings2 /> {label}
          </Button>
        </DialogTrigger>
      </Tooltip>
      <DialogContent
        title="Device settings"
        description="Choose your camera, microphone and speaker."
      >
        <DeviceFields media={media} className="mt-5" />
      </DialogContent>
    </Dialog>
  );
}

export function DeviceFields({ media, className }: { media: LocalMedia; className?: string }) {
  const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || `${kind} ${i + 1}`;
  const noLabels = media.devices.cams.concat(media.devices.mics).every((d) => !d.label);
  return (
    <div className={cn('space-y-4', className)}>
      <Field label="Camera" htmlFor="cam-device">
        <NativeSelect
          id="cam-device"
          className="w-full"
          value={media.camId}
          onChange={(e) => void media.selectCam(e.target.value)}
          disabled={!media.devices.cams.length}
        >
          {!media.devices.cams.length && <option value="">No camera found</option>}
          {media.devices.cams.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, i, 'Camera')}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Microphone" htmlFor="mic-device">
        <NativeSelect
          id="mic-device"
          className="w-full"
          value={media.micId}
          onChange={(e) => void media.selectMic(e.target.value)}
          disabled={!media.devices.mics.length}
        >
          {!media.devices.mics.length && <option value="">No microphone found</option>}
          {media.devices.mics.map((d, i) => (
            <option key={d.deviceId} value={d.deviceId}>
              {label(d, i, 'Microphone')}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {media.devices.speakers.length > 0 && (
        <Field label="Speaker" htmlFor="speaker-device">
          <NativeSelect
            id="speaker-device"
            className="w-full"
            value={media.speakerId}
            onChange={(e) => media.selectSpeaker(e.target.value)}
          >
            {media.devices.speakers.map((d, i) => (
              <option key={d.deviceId} value={d.deviceId}>
                {label(d, i, 'Speaker')}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
      {noLabels && (
        <p className="text-xs text-muted-foreground">
          Device names appear after you allow camera or microphone access.
        </p>
      )}
    </div>
  );
}

/**
 * The call's video tiles, floating over the corner of the room so the editor stays usable.
 * It can be collapsed to a strip or enlarged.
 */
export function CallDock({
  call,
  media,
  self,
}: {
  call: CallState;
  media: LocalMedia;
  self: { name: string; id: string };
}) {
  const [size, setSize] = useState<'small' | 'large'>('small');
  const [collapsed, setCollapsed] = useState(false);
  if (!call.joined) return null;
  const count = call.remotes.length + 1;

  return (
    <section
      aria-label="Video call"
      className={cn(
        'absolute right-3 bottom-3 z-20 flex flex-col overflow-hidden rounded-xl border bg-card shadow-raised',
        size === 'large' ? 'w-[min(34rem,calc(100%-1.5rem))]' : 'w-[min(17rem,calc(100%-1.5rem))]',
      )}
    >
      <header className="flex items-center gap-2 border-b px-2.5 py-1.5 text-xs">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="size-1.5 animate-pulse-ring rounded-full bg-success" />
          Call · {count} {count === 1 ? 'person' : 'people'}
        </span>
        <span className="ml-auto flex items-center">
          <Tooltip content={size === 'large' ? 'Smaller' : 'Larger'}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={size === 'large' ? 'Make the call smaller' : 'Make the call larger'}
              onClick={() => {
                setSize(size === 'large' ? 'small' : 'large');
                setCollapsed(false);
              }}
            >
              {size === 'large' ? <Minimize2 /> : <Maximize2 />}
            </Button>
          </Tooltip>
          <Tooltip content={collapsed ? 'Show video' : 'Hide video'}>
            <Button
              size="icon-sm"
              variant="ghost"
              className="size-6"
              aria-label={collapsed ? 'Show video' : 'Hide video'}
              aria-expanded={!collapsed}
              onClick={() => setCollapsed(!collapsed)}
            >
              {collapsed ? <ChevronUp /> : <ChevronDown />}
            </Button>
          </Tooltip>
        </span>
      </header>
      <div
        className={cn(
          'grid gap-1.5 p-1.5',
          collapsed && 'hidden',
          size === 'large' && count > 1 && 'grid-cols-2',
        )}
      >
        {call.remotes.map((r) => (
          <VideoTile
            key={r.callId}
            stream={r.stream}
            name={r.name}
            id={r.participantId}
            mic={r.mic}
            cam={r.cam}
            status={r.state}
            speakerId={media.speakerId}
          />
        ))}
        <VideoTile
          stream={media.stream}
          version={media.version}
          name={self.name}
          id={self.id}
          mic={media.mic}
          cam={media.cam}
          self
          className={cn(size === 'small' && call.remotes.length > 0 && 'mx-auto w-1/2')}
        />
      </div>
      {!collapsed && call.notJoined.length > 0 && (
        <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Not in the call: {call.notJoined.map((p) => p.name).join(', ')}
        </p>
      )}
      {!collapsed && call.remotes.length === 0 && call.notJoined.length === 0 && (
        <p className="border-t px-2.5 py-1.5 text-[11px] text-muted-foreground">
          Waiting for others to join…
        </p>
      )}
    </section>
  );
}
