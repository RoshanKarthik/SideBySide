import type { RunOutput } from '@sidebyside/shared';
import { api } from '@/lib/api';
import type { RemoteRunner } from './runner';

/** Runs compiled languages (Java, C, C++, Go) through the room's server-side code runner. */
export function serverRunner(roomId: string, roomKey: string): RemoteRunner {
  return (req) =>
    api.json<RunOutput>(`/rooms/${roomId}/execute`, { method: 'POST', roomKey, body: req });
}
