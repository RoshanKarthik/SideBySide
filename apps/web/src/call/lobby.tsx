import type { Brand } from '@sidebyside/shared';
import { ArrowRight, Mic, MicOff, ShieldCheck, Video, VideoOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge, Spinner } from '@/components/ui/card';
import { Switch } from '@/components/ui/form';
import { BrandMark } from '@/components/brand';
import { cn } from '@/lib/utils';
import { DeviceSettings } from './call-ui';
import { mediaSupported, savedMediaChoice, type LocalMedia } from './local-media';
import { useAudioLevel } from './use-call';
import { VideoTile } from './call-ui';

const ROLE_LABEL: Record<string, string> = {
  owner: 'Interviewer',
  interviewer: 'Interviewer',
  candidate: 'Candidate',
  peer: 'Practice partner',
};

/**
 * Before entering the room: check camera and microphone, pick devices, then join. The
 * choices carry into the room's call.
 */
export function Lobby({
  title,
  brand,
  name,
  participantId,
  role,
  media,
  lowBandwidth,
  onJoin,
}: {
  title: string;
  brand: Brand | null;
  name: string;
  participantId: string;
  role: string;
  media: LocalMedia;
  lowBandwidth: boolean;
  onJoin: (withCall: boolean) => void;
}) {
  const supported = mediaSupported();
  const [started, setStarted] = useState(false);

  // Start with what the visitor chose last time (camera off by default on slow connections).
  useEffect(() => {
    if (!supported || started) return;
    const choice = savedMediaChoice();
    queueMicrotask(() => {
      setStarted(true);
      if (choice.mic) void media.setMic(true);
      if (choice.cam && !lowBandwidth) void media.setCam(true);
    });
  }, [supported, started, media, lowBandwidth]);

  const level = useAudioLevel(media.stream, media.version, media.mic);

  return (
    <div className="flex min-h-full flex-col bg-background">
      <header className="flex h-14 items-center gap-3 border-b bg-card px-4 sm:px-6">
        <BrandMark brand={brand} />
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="grid w-full max-w-5xl items-center gap-8 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <VideoTile
              stream={media.stream}
              version={media.version}
              name={name}
              id={participantId}
              mic={media.mic}
              cam={media.cam}
              self
              className="rounded-2xl shadow-raised"
            />
            <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border bg-card px-4 py-3 shadow-card">
              <label className="flex items-center gap-2.5 text-sm font-medium">
                {media.cam ? <Video className="size-4" /> : <VideoOff className="size-4" />}
                Camera
                <Switch
                  checked={media.cam}
                  disabled={!supported || media.busy}
                  onCheckedChange={(on) => void media.setCam(on)}
                  aria-label="Camera"
                />
              </label>
              <label className="flex items-center gap-2.5 text-sm font-medium">
                {media.mic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
                Microphone
                <Switch
                  checked={media.mic}
                  disabled={!supported || media.busy}
                  onCheckedChange={(on) => void media.setMic(on)}
                  aria-label="Microphone"
                />
              </label>
              <MicMeter level={level} active={media.mic} />
              <span className="ml-auto">
                <DeviceSettings media={media} label="Devices" />
              </span>
            </div>
            {media.error && (
              <p role="alert" className="mt-3 text-sm text-destructive">
                {media.error}
              </p>
            )}
            {!supported && (
              <p className="mt-3 text-sm text-muted-foreground">
                This browser can’t use a camera or microphone here. You can still join the room
                without the call.
              </p>
            )}
          </div>

          <div>
            <Badge tone="info">{ROLE_LABEL[role] ?? role}</Badge>
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {title}
            </h1>
            <p className="mt-2 text-muted-foreground">
              You’re joining as <span className="font-medium text-foreground">{name}</span>.
            </p>
            <div className="mt-8 space-y-3">
              <Button size="lg" className="w-full" variant="glow" onClick={() => onJoin(true)}>
                {media.busy ? <Spinner /> : null}
                Join now <ArrowRight />
              </Button>
              <Button
                size="lg"
                variant="outline"
                className="w-full"
                onClick={() => {
                  media.release();
                  onJoin(false);
                }}
              >
                Join without audio or video
              </Button>
            </div>
            <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-primary" />
              Audio and video go directly between participants and are never recorded. You can turn
              them on or off at any time in the room.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

function MicMeter({ level, active }: { level: number; active: boolean }) {
  const bars = 8;
  return (
    <span className="flex h-4 items-end gap-0.5" aria-hidden>
      {Array.from({ length: bars }, (_, i) => (
        <span
          key={i}
          className={cn(
            'w-1 rounded-sm transition-colors',
            active && level * bars > i ? 'bg-success' : 'bg-muted-foreground/25',
          )}
          style={{ height: `${40 + (i / bars) * 60}%` }}
        />
      ))}
    </span>
  );
}
