# SideBySide

Live technical interviews from one link. The interviewer and candidate share a room with a
**video call**, **collaborative notes** and a **real code editor that runs code**, without screen
sharing. Every edit is recorded with a server timestamp, so the whole session can be
**replayed** afterwards.

- Interviewers sign in (Google or GitHub) and create a room.
- Candidates open the link, enter their name, accept the recording notice and join. No account.
- A lobby checks camera and microphone (with device pickers and a level meter) before anyone
  enters. In the room, a peer-to-peer video call floats over the corner with camera, mute,
  device settings and leave controls; calls are never recorded.
- Notes and code sync live, with everyone's cursors and presence.
- Python, JavaScript and TypeScript run in the browser in a sandboxed WebAssembly worker.
  HTML/CSS/JS renders in a live, sandboxed preview with its console output.
- A shared whiteboard (Design tab) with live pointers and starter templates.
- Interviewers keep a question bank (their own questions plus a public practice bank) with
  starter code, hints and test cases. **Show to candidate** loads the problem and starter code;
  **Run tests** reports pass/fail and a score out of 100 weighted by each test's weight, and
  candidates never see the contents of hidden tests.
- A private interviewer panel: private notes with one-click timestamps, a rubric, a timer, an
  editor lock and a co-interviewer invite link.
- Transparent activity signals (pastes, tab switches, leaving the window) that everyone in the
  room sees — signals, never verdicts.
- When the interviewer ends the session, a session summary (rubric, timeline, test results,
  signals) and a replay of notes, code and whiteboard with markers for every key moment.
- **Practice with a peer:** matchmaking by topic, difficulty and language, two rounds with a
  role swap, and ratings afterwards.
- Dashboard with a candidates table (score, duration, status), live and upcoming rooms, stats
  and search; a command palette (Ctrl+K); settings with company branding (name, logo and colour
  shown to candidates on join pages and in rooms), a low-bandwidth mode, data export and account
  deletion. Light theme by default, dark as an option. The landing page opens with a cinematic
  video hero, every page change cross-fades (view transitions), pages rise in on arrival, and
  signing in or out plays a curtain transition.

## Stack

| Layer          | Choice                                                                      |
| -------------- | --------------------------------------------------------------------------- |
| Hosting        | One Cloudflare Worker serves the web app, the REST API and the WebSockets   |
| Realtime       | Yjs, one Durable Object per room (`y-partyserver`), SQLite storage per room |
| Matchmaking    | One `Matchmaker` Durable Object holding the practice queue                  |
| Database       | Neon Postgres via Cloudflare Hyperdrive, Drizzle ORM                        |
| Auth           | Better Auth (Google + GitHub), room-scoped JWTs for guests                  |
| API            | Hono + zod                                                                  |
| Web            | React 19, Vite, React Router, TanStack Query, Tailwind CSS 4, Radix UI      |
| UI             | Geist + Instrument Serif (self-hosted), cmdk palette, sonner toasts         |
| Video call     | WebRTC mesh between browsers, signalled through the room's Durable Object   |
| Editors        | Monaco + `y-monaco` (code), TipTap + Yjs (notes)                            |
| Whiteboard     | Excalidraw, synced through the room's Yjs document                          |
| Code execution | Pyodide (Python) and a JS/TS runner in a locked-down Web Worker             |
| Tooling        | TypeScript (strict), pnpm workspaces, Turborepo, Vitest, ESLint, Prettier   |

Everything runs on free plans that don't need a card: Cloudflare Workers Free (including SQLite
Durable Objects and Hyperdrive) and Neon Free.

## Repository layout

```
apps/
  web/        React app (routes, room, editors, replay, code runner worker)
  server/     Cloudflare Worker: Hono API, Better Auth, room Durable Object
  e2e/        Playwright end-to-end tests for the acceptance flows
packages/
  shared/     zod schemas, event types, languages, Yjs document layout, replay format
  db/         Drizzle schema, migrations, database client, PGlite test helper
```

### Where data lives

- **Postgres (Neon):** users and sessions, rooms, participants, rounds, events, code runs,
  questions and test cases, rubric scores, practice ratings.
- **Each room's Durable Objects (SQLite):** the live shared Yjs document (notes, code,
  whiteboard), every update with its server timestamp, and a snapshot every minute. Replay reads
  from here. Interviewer-only data (private notes, rubric, timer) lives in a second document
  that candidates can't connect to. Each practice round has its own pair of documents.
- **The Matchmaker Durable Object:** the practice queue (people waiting and recent matches).

## Local development

Prerequisites: Node.js 22+, pnpm 10 (`npm i -g pnpm@10`), and a Postgres database: either a
free [Neon](https://neon.tech) project (use a separate branch, for example `dev`) or a local
Postgres, for example in Docker:

```bash
docker run -d --name sbs-dev-postgres -e POSTGRES_USER=sbs -e POSTGRES_PASSWORD=sbs -e POSTGRES_DB=sidebyside -p 55432:5432 postgres:17-alpine
```

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Create `.env` in the repository root from `.env.example`, using your database's **direct**
   connection string for both values. For the local Docker database that is
   `postgresql://sbs:sbs@127.0.0.1:55432/sidebyside`, with `?sslmode=disable` added to the
   second (Hyperdrive) value.

3. Create `apps/server/.dev.vars` from `apps/server/.dev.vars.example`. Generate the two secrets
   with:

   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
   ```

   With `ALLOW_DEV_LOGIN=true` you can sign in with email and password locally, so OAuth apps are
   optional for development.

4. Create the tables and load the public question bank:

   ```bash
   pnpm db:migrate
   pnpm db:seed
   ```

5. Start the Worker (port 8787) and the web app (port 5173):

   ```bash
   pnpm dev
   ```

   Open http://localhost:5173. To try a guest join next to a signed-in tab, open the room link
   on http://guest.localhost:5173 (a different hostname, so it has its own cookies). For a
   second signed-in user (for example a co-interviewer), add another `*.localhost` origin to
   `TRUSTED_ORIGINS` in `.dev.vars` and use that hostname.

### Useful scripts

| Command            | What it does                                       |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Worker + web app with hot reload                   |
| `pnpm test`        | All unit and API tests (Postgres runs in PGlite)   |
| `pnpm e2e`         | Playwright end-to-end tests (see below)            |
| `pnpm typecheck`   | TypeScript across the workspace                    |
| `pnpm lint`        | ESLint                                             |
| `pnpm db:generate` | New SQL migration from `packages/db/src/schema.ts` |
| `pnpm db:migrate`  | Apply migrations to `DATABASE_URL`                 |
| `pnpm db:seed`     | Load (or refresh) the public question bank         |

### End-to-end tests

`apps/e2e` drives the three acceptance flows in Chromium with Playwright: an interview with a
guest candidate (consent, Show to candidate, Run, Run tests with hidden tests, private notes and
rubric, End session, replay), practice matchmaking with a role swap and ratings, and a candidate
who keeps typing for 40 seconds offline and merges on reconnect. A fourth test runs a video call
between interviewer and candidate with Chromium's fake camera and microphone. Each person has their own
browser context, and signed-in users are fresh accounts made through the development sign-in,
so runs don't depend on earlier data.

They run against `pnpm dev` and your development database, so set up `.env` and `.dev.vars`
(with `ALLOW_DEV_LOGIN=true`) as above, then:

```bash
pnpm db:migrate
pnpm db:seed
pnpm --filter @sidebyside/e2e exec playwright install chromium
pnpm e2e
```

`pnpm e2e` starts `pnpm dev` itself, or reuses it if it is already running. Pass Playwright
options after it, for example `pnpm e2e offline` or `pnpm e2e --headed`. After a failure,
`pnpm --filter @sidebyside/e2e exec playwright show-report` opens the report with a trace of
each step. The tests are not part of `pnpm test`.

## Deploying

1. **Database.** In Neon, use the `main` branch for production. Copy its direct connection
   string and run migrations against it:

   ```bash
   DATABASE_URL="postgresql://…" pnpm db:migrate
   DATABASE_URL="postgresql://…" pnpm db:seed
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
- Candidates can't connect to a room's private document, and the interviewer-only question API
  rejects them. Test results are filtered on the server, so a candidate's copy never contains
  hidden tests' input or expected output.
- Pyodide and the whiteboard fonts are served from the app's own origin, not a third-party CDN.
- Candidate code runs in a dedicated worker that has its network, messaging and storage APIs
  removed before the code starts. In production the worker script is also served with a
  Content-Security-Policy that only allows loading Pyodide from the app's own origin.
- IP addresses are not stored.
- Video calls are peer to peer: the room only relays the connection setup between call
  participants (a tab's call id can't be taken over by another connection), and audio and video
  never pass through or get stored by the server.
- The HTML/CSS/JS preview runs in an iframe sandbox without `allow-same-origin`, so the page
  can't reach the app's cookies, storage or DOM.
- Company logos are stored as small PNG, JPEG or WebP data URLs (SVG is refused).

## Known limitations

- Only Python, JavaScript and TypeScript can be run; Java, C++, C and Go can be edited but not run.
- Output printed before a program hits the 10-second time limit is not shown.
- Code runs are reported by the browser that ran them, so a participant could fake their own
  run's output. Tests run in an interviewer's browser (which already holds the hidden tests), so
  **Run tests** needs an interviewer in the room.
- Images can't be added to the whiteboard.
- Video calls use public STUN servers only. Most networks connect directly, but some strict
  corporate networks need a TURN relay (for example Cloudflare's), which isn't set up yet. Calls
  are a mesh, so they suit interviews of two to four people, not large meetings.
- Sign-in by email link isn't available (it needs an email sender and a domain).
