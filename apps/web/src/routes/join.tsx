import { parseRoomId, type PublicRoom } from '@sidebyside/shared';
import { ArrowRight } from 'lucide-react';
import { useState } from 'react';
import { AppShell } from '@/components/layout';
import { Button } from '@/components/ui/button';
import { Card, ErrorNote, Spinner } from '@/components/ui/card';
import { Field, Input } from '@/components/ui/form';
import { ApiRequestError, api } from '@/lib/api';
import { useNavigate } from '@/lib/navigation';

/** For people who were told a room's ID instead of being sent its link. */
export default function JoinPage() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const slug = parseRoomId(value);
    if (!slug) {
      setError('That doesn’t look like a room ID. A room ID looks like kxmp-7rtw-q4hn.');
      return;
    }
    setError(null);
    setChecking(true);
    try {
      await api.json<PublicRoom>(`/rooms/${slug}/public`);
      navigate(`/r/${slug}`);
    } catch (err) {
      setChecking(false);
      setError(
        err instanceof ApiRequestError && err.status === 404
          ? 'No room has this ID. Check it with the person who shared it.'
          : 'The room couldn’t be checked. Try again in a moment.',
      );
    }
  }

  return (
    <AppShell>
      <div className="relative isolate mx-auto max-w-md px-4 py-20 sm:py-28">
        <div className="bg-dots mask-radial absolute inset-0 -z-10 opacity-60" />
        <h1 className="text-3xl font-semibold tracking-tight">Join a room</h1>
        <p className="mt-2 text-muted-foreground">
          Enter the room ID you were given, or paste the room link.
        </p>
        <Card className="mt-8 p-6">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label="Room ID" htmlFor="room-id">
              <Input
                id="room-id"
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setError(null);
                }}
                placeholder="kxmp-7rtw-q4hn"
                className="font-mono"
                autoFocus
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
              />
            </Field>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button type="submit" className="w-full" disabled={checking || !value.trim()}>
              {checking ? <Spinner /> : <ArrowRight />} Join
            </Button>
          </form>
        </Card>
      </div>
    </AppShell>
  );
}
