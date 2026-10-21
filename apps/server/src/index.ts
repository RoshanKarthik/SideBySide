import { connectDb } from '@sidebyside/db';
import { roomDocumentName } from '@sidebyside/shared';
import { getServerByName, routePartykitRequest, type Server } from 'partyserver';
import { createApp } from './app';
import { authorizeConnection } from './collab/connect';
import type { Room } from './collab/room';
import type { AppDeps } from './context';

export { Room } from './collab/room';
export { Matchmaker } from './practice/matchmaker';

const deps: AppDeps = {
  openDb: (env) => connectDb(env.HYPERDRIVE.connectionString),
  room: async (env, roomId, part = 'shared', round = 1) =>
    (await getServerByName(
      env.Room as unknown as DurableObjectNamespace<Server>,
      roomDocumentName(roomId, part, round),
    )) as unknown as DurableObjectStub<Room>,
  matchmaker: async (env) => env.Matchmaker.get(env.Matchmaker.idFromName('global')),
};

const api = createApp(deps);

/**
 * The code runner executes other people's code, so its worker script gets a policy that only
 * lets it load Pyodide from our origin: no API calls, no other network access.
 */
async function serveRunnerWorker(request: Request, env: Env): Promise<Response> {
  const asset = await env.ASSETS.fetch(request);
  const response = new Response(asset.body, asset);
  const origin = new URL(request.url).origin;
  response.headers.set(
    'content-security-policy',
    [
      "default-src 'none'",
      "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval'",
      `connect-src ${origin}/pyodide/`,
      "worker-src 'none'",
    ].join('; '),
  );
  return response;
}

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
    if (pathname.startsWith('/assets/runner.worker-')) return serveRunnerWorker(request, env);
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
