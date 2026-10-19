import { connectDb } from '@sidebyside/db';
import { getServerByName, routePartykitRequest, type Server } from 'partyserver';
import { createApp } from './app';
import { authorizeConnection } from './collab/connect';
import type { Room } from './collab/room';
import type { AppDeps } from './context';

export { Room } from './collab/room';

const deps: AppDeps = {
  openDb: (env) => connectDb(env.HYPERDRIVE.connectionString),
  room: async (env, roomId) =>
    (await getServerByName(
      env.Room as unknown as DurableObjectNamespace<Server>,
      `${roomId}--shared`,
    )) as unknown as DurableObjectStub<Room>,
};

const api = createApp(deps);

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/')) return api.fetch(request, env, ctx);
    if (pathname.startsWith('/collab/')) {
      const response = await routePartykitRequest(request, env, {
        prefix: 'collab',
        onBeforeConnect: (req, lobby) => authorizeConnection(req, lobby, env),
        // Rooms are reachable only by WebSocket; plain HTTP goes through the API.
        onBeforeRequest: () => new Response('Not found', { status: 404 }),
      });
      return response ?? new Response('Not found', { status: 404 });
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
