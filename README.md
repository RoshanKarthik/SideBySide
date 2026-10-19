# SideBySide

Live technical interviews from one link. The interviewer and candidate share a room with
**collaborative notes** and a **real code editor that runs code**, without screen sharing. Every
edit is recorded with a server timestamp, so the whole session can be **replayed** afterwards.

- Interviewers sign in (Google or GitHub) and create a room.
- Candidates open the link, enter their name, accept the recording notice and join. No account.
- Notes and code sync live, with everyone's cursors and presence.
- Python, JavaScript and TypeScript run in the browser in a sandboxed WebAssembly worker.
- When the interviewer ends the session, the replay is available with a marker for every code run.

## Stack

| Layer          | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Hosting        | One Cloudflare Worker serves the web app, the REST API and the WebSockets   |
| Realtime       | Yjs, one Durable Object per room (`y-partyserver`), SQLite storage per room |
| Database       | Neon Postgres via Cloudflare Hyperdrive, Drizzle ORM                        |
| Auth           | Better Auth (Google + GitHub), room-scoped JWTs for guests                  |
| API            | Hono + zod                                                                  |
| Web            | React 19, Vite, React Router, TanStack Query, Tailwind CSS 4, Radix UI      |
| Editors        | Monaco + `y-monaco` (code), TipTap + Yjs (notes)                            |
| Code execution | Pyodide (Python) and a JS/TS runner in a locked-down Web Worker             |
| Tooling        | TypeScript (strict), pnpm workspaces, Turborepo, Vitest, ESLint, Prettier   |

Everything runs on free plans that don't need a card: Cloudflare Workers Free (including SQLite
Durable Objects and Hyperdrive) and Neon Free.

## Repository layout

```
apps/
  web/        React app (routes, room, editors, replay, code runner worker)
  server/     Cloudflare Worker: Hono API, Better Auth, room Durable Object
packages/
  shared/     zod schemas, event types, languages, Yjs document layout, replay format
  db/         Drizzle schema, migrations, database client, PGlite test helper
```

### Where data lives

- **Postgres (Neon):** users and sessions, rooms, participants, rounds, events, code runs.
- **Each room's Durable Object (SQLite):** the live Yjs document, every update with its server
  timestamp, and a snapshot every minute. Replay reads from here.

## Local development

Prerequisites: Node.js 22+, pnpm 10 (`npm i -g pnpm@10`), and a free [Neon](https://neon.tech)
project. Use a separate Neon branch (for example `dev`) for development.

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create `.env` in the repository root from `.env.example`, using your Neon dev branch's
   **direct** connection string for both values.

3. Create `apps/server/.dev.vars` from `apps/server/.dev.vars.example`. Generate the two secrets
   with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   With `ALLOW_DEV_LOGIN=true` you can sign in with email and password locally, so OAuth apps are
   optional for development.

4. Create the tables:

   ```bash
   pnpm db:migrate
   ```

5. Start the Worker (port 8787) and the web app (port 5173):

   ```bash
   pnpm dev
   ```

   Open http://localhost:5173. To try a guest join next to a signed-in tab, open the room link
   on http://guest.localhost:5173 (a different hostname, so it has its own cookies).

### Useful scripts

| Command            | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Worker + web app with hot reload                   |
| `pnpm test`        | All unit and API tests (Postgres runs in PGlite)   |
| `pnpm typecheck`   | TypeScript across the workspace                    |
| `pnpm lint`        | ESLint                                             |
| `pnpm db:generate` | New SQL migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate`  | Apply migrations to `DATABASE_URL`                 |

## Deploying

1. **Database.** In Neon, use the `main` branch for production. Copy its direct connection
   string and run migrations against it:

   ```bash
   DATABASE_URL="postgresql://…" pnpm db:migrate
   ```

2. **Cloudflare.** Sign in and create a Hyperdrive config pointing at the production database:

   ```bash
   cd apps/server
   npx wrangler login
   npx wrangler hyperdrive create sidebyside-db --connection-string="postgresql://…"
   ```

   Put the printed id in `apps/server/wrangler.jsonc` under `hyperdrive[0].id`.

3. **Sign-in providers.** Create OAuth apps with the callback URL
   `https://<your-app>/api/auth/callback/google` (Google Cloud console) and
   `https://<your-app>/api/auth/callback/github` (GitHub → Settings → Developer settings).

4. **Secrets.** From `apps/server`, set each one (you'll be prompted for the value):

   ```bash
   npx wrangler secret put BETTER_AUTH_SECRET
   ```

   Repeat for `GUEST_TOKEN_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`
   and `GITHUB_CLIENT_SECRET`.

5. **App URL.** Set `PUBLIC_APP_URL` in `wrangler.jsonc` to the Worker's URL (for example
   `https://sidebyside.<account>.workers.dev`). Keep `ALLOW_DEV_LOGIN` set to `"false"`.

6. **Deploy:**

   ```bash
   pnpm deploy
   ```

### Production checklist

- `ALLOW_DEV_LOGIN` is `"false"` and the secrets are long random values.
- `PUBLIC_APP_URL` matches the deployed origin; OAuth callback URLs match it too.
- Migrations have been applied to the production branch.
- The Privacy and Terms pages contain reviewed text. They are placeholders today; have them
  reviewed (for example against India's Digital Personal Data Protection Act) before a public
  launch.

## Security notes

- Every permission check lives in `apps/server/src/auth/permissions.ts` and is enforced on the
  server for both REST and WebSocket requests.
- Cookie-authenticated writes are rejected unless they come from a trusted origin.
- Guests get a 12-hour token scoped to one room.
- Candidate code runs in a dedicated worker that has its network, messaging and storage APIs
  removed before the code starts. In production the worker script is also served with a
  Content-Security-Policy that only allows loading Pyodide from the app's own origin.
- IP addresses are not stored.

## Known limitations

- Only Python, JavaScript and TypeScript can be run; Java, C++, C and Go can be edited but not run.
- Output printed before a program hits the 10-second time limit is not shown.
- Code runs are reported by the browser that ran them, so a participant could fake their own
  run's output.
- Sign-in by email link isn't available (it needs an email sender and a domain).
