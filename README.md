# SideBySide

Live technical interviews from one link. The interviewer and candidate share a room with a
**video call**, **collaborative notes** and a **real code editor that runs code**, without screen
sharing. Every edit is recorded with a server timestamp, so the whole session can be
**replayed** afterwards.

**Live:** https://sidebyside.roshankarrthik.workers.dev

- Interviewers sign in (Google, GitHub or a link sent to their email) and create a room.
- Candidates open the link, enter their name, accept the recording notice and join. No account.
- A lobby checks camera and microphone (with device pickers and a level meter) before anyone
  enters. In the room, a peer-to-peer video call floats over the corner with camera, mute,
  device settings and leave controls; calls are never recorded.
- Notes and code sync live, with everyone's cursors and presence.
- Python, JavaScript and TypeScript run in the browser in a sandboxed WebAssembly worker;
  Java, C, C++ and Go compile and run on Wandbox (wandbox.org, a free public compiler service)
  through the Worker.
  HTML/CSS/JS renders in a live, sandboxed preview with its console output.
- A shared whiteboard (Design tab) with live pointers, starter templates and images.
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
- **Keep your feedback:** when the interviewer shares the replay or report, a guest candidate
  can save the ended session to an account (sign up or sign in) from the "Session ended" screen,
  or copy a private link to do it later on any device, then open their AI feedback and the
  replay (whichever were shared) from their dashboard.
- **Deleting sessions:** the interviewer who owns a session can delete it for everyone at any
  time. Anyone else (a practice partner, a co-interviewer, a candidate who saved it) removes it
  from their own sessions; a practice session is deleted for good once both partners remove it.
- **Retention:** each room is deleted for good once its retention period (7, 30 or 90 days
  after the session ends) is over. An hourly Cron Trigger purges the room's Durable Object
  documents, then its Postgres rows.
- **AI post-interview reports** (Cloudflare Workers AI free tier, with Groq taking over when its
  daily allowance runs out): when a session ends, a draft
  report for the hiring team (approach, correctness, complexity, code quality, hints, key
  moments, neutral activity summary, suggested rubric scores, debrief questions) and a feedback
  report for the candidate. The candidate sees theirs only when the interviewer shared it, and
  interviewers can regenerate either.
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
| Auth           | Better Auth (Google, GitHub, email links), room-scoped JWTs for guests      |
| API            | Hono + zod                                                                  |
| Web            | React 19, Vite, React Router, TanStack Query, Tailwind CSS 4, Radix UI      |
| UI             | Geist + Instrument Serif (self-hosted), cmdk palette, sonner toasts         |
| Video call     | WebRTC mesh signalled through the room; Cloudflare TURN relay when set up   |
| Editors        | Monaco + `y-monaco` (code), TipTap + Yjs (notes)                            |
| Whiteboard     | Excalidraw, synced through the room's Yjs document                          |
| Code execution | Pyodide and a JS/TS runner in a Web Worker; Wandbox for Java, C, C++, Go    |
| Tooling        | TypeScript (strict), pnpm workspaces, Turborepo, Vitest, ESLint, Prettier   |

Everything runs on free plans that don't need a card: Cloudflare Workers Free (including SQLite
Durable Objects and Hyperdrive) and Neon Free.

## Architecture

```mermaid
flowchart LR
  subgraph browser["Browser · React app"]
    pages["Dashboard, room, replay,<br/>question bank, practice"]
    editors["Notes, code and whiteboard<br/>TipTap · Monaco · Excalidraw on Yjs"]
    runner["Code runner Web Worker<br/>Pyodide · JavaScript · TypeScript"]
    video["Video call<br/>WebRTC"]
  end

  subgraph cloudflare["Cloudflare Workers"]
    worker["Worker<br/>static assets · Hono REST API · Better Auth"]
    room["Room Durable Object<br/>one per room document<br/>Yjs sync · update log and snapshots in SQLite"]
    matchmaker["Matchmaker Durable Object<br/>practice queue"]
    cron["Cron Trigger<br/>hourly retention cleanup"]
    ai["Workers AI<br/>post-interview reports"]
    hyperdrive["Hyperdrive<br/>pooled Postgres connections"]
  end

  wandbox["Wandbox<br/>runs Java · C · C++ · Go"]
  groq["Groq<br/>report fallback"]

  postgres[("Neon Postgres<br/>users · rooms · participants · events<br/>questions · code runs · reports")]
  oauth["Google and GitHub sign-in"]
  gmail["Gmail SMTP<br/>sign-in links"]

  pages -- "HTTPS /api" --> worker
  editors <-- "WebSocket /collab" --> room
  runner -. "run and test results" .-> room
  video <-. "signalling only" .-> room
  worker --> room
  worker --> matchmaker
  worker <--> oauth
  worker -- "sign-in emails" --> gmail
  cron --> worker
  room -- "report job" --> ai
  room -. "if Workers AI fails" .-> groq
  worker -- "compiled languages" --> wandbox
  worker --> hyperdrive
  room --> hyperdrive
  hyperdrive --> postgres
```

- **Realtime:** each room document (shared, interviewer-only, and one pair per practice round)
  is its own Durable Object. It merges Yjs updates from every browser, stamps them with server
  time for replay, and enforces who may connect, so candidates never receive private data.
- **Code execution:** Python, JavaScript and TypeScript run in a locked-down Web Worker in the
  browser; Java, C, C++ and Go are compiled and run on Wandbox, called through the Worker. Hidden
  tests run from the interviewer's browser and only pass/fail results reach the candidate.
- **Video:** audio and video go peer to peer between browsers; the room only relays the
  connection setup.
- **Background work:** the Cron Trigger deletes rooms past their retention date, and when a
  session ends the room writes the AI reports with Workers AI (Groq when that fails).

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
  from here. Whiteboard images are stored once beside the document (not inside it, so snapshots
  stay small) and the board references them by id. Interviewer-only data (private notes,
  rubric, timer) lives in a second document that candidates can't connect to. Each practice
  round has its own pair of documents.
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
   optional for development. Email sign-in links are printed to the `pnpm dev` output instead of
   being sent, unless `SMTP_USER` and `SMTP_PASSWORD` are set.

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
| `pnpm db:*:ws`     | `migrate` / `seed` for Neon over port 443          |

To check page weight, `pnpm --filter @sidebyside/web size` builds the app and prints the
gzipped JavaScript the room page needs before the code editor and whiteboard load (about 401 KB
today, against a target of about 400 KB) and what every page needs (about 177 KB). The code
editor, whiteboard, interviewer panel, markdown renderer and every other page load on demand.

To run the hourly retention cleanup by hand while `pnpm dev` is running:
`curl "http://127.0.0.1:8787/cdn-cgi/local/scheduled"`.

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

   If your network blocks Postgres's port 5432 (the commands time out), use
   `pnpm db:migrate:ws` and `pnpm db:seed:ws` instead: they reach Neon over WebSockets on
   port 443. The deployed app is unaffected, since Cloudflare connects to Neon itself.

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

4. **Secrets.** After the first deploy, generate and store the two app secrets (the values are
   never printed):

   ```bash
   pnpm --filter @sidebyside/server secrets:init
   ```

   Then, from `apps/server`, set the sign-in app credentials (you'll be prompted for each value):
   `npx wrangler secret put GOOGLE_CLIENT_ID`, and the same for `GOOGLE_CLIENT_SECRET`,
   `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET`.

5. **AI reports (optional).** In the Cloudflare dashboard, create an API token with the
   **Workers AI: Read** permission and note your account id. For a fallback when the Workers AI
   daily allowance runs out, also create a free API key at console.groq.com. From
   `apps/server`:

   ```bash
   npx wrangler secret put CLOUDFLARE_ACCOUNT_ID
   npx wrangler secret put CLOUDFLARE_AI_TOKEN
   npx wrangler secret put GROQ_API_KEY
   ```

   `AI_SUMMARY_PROVIDER` in `wrangler.jsonc` is `"workers-ai"`; reports stay off until the
   Workers AI secrets are set (or use `"groq"` with only the Groq key). Set it to `"off"` to hide
   the feature. (`"sample"` shows fixed sample reports and is for local development only.)

   **TURN relay for calls (optional, recommended).** In the Cloudflare dashboard, open
   Realtime → TURN Server and create a TURN key (1,000 GB a month free), then from
   `apps/server` run `npx wrangler secret put TURN_KEY_ID` and
   `npx wrangler secret put TURN_KEY_API_TOKEN`. The room hands browsers short-lived
   credentials; the key never leaves the server.

   **Sign-in by email link (optional).** Turn on 2-Step Verification for a Gmail account, then
   create an App Password for it (Google Account → Security → App passwords). From
   `apps/server` run `npx wrangler secret put SMTP_USER` (the Gmail address) and
   `npx wrangler secret put SMTP_PASSWORD` (the App Password). Links are then sent from that
   address; without these secrets the email option doesn't appear on the sign-in page.

6. **App URL.** The `deploy` script in `apps/server/package.json` passes the production URL
   (`https://sidebyside.roshankarrthik.workers.dev`) as `PUBLIC_APP_URL`; `wrangler.jsonc` keeps
   the local one. Change it there if the address changes. Keep `ALLOW_DEV_LOGIN` set to
   `"false"`.

7. **Deploy:**

   ```bash
   pnpm run deploy
   ```

   (`pnpm deploy` without `run` is a different, built-in pnpm command.)

### Production checklist

- `ALLOW_DEV_LOGIN` is `"false"` and the secrets are long random values.
- `PUBLIC_APP_URL` matches the deployed origin; OAuth callback URLs match it too.
- Migrations have been applied to the production branch.
- The retention Cron Trigger (`30 * * * *`, from `wrangler.jsonc`) shows under the Worker's
  Settings → Triggers. Cron Triggers are included in the free plan.
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
- Java, C, C++ and Go code (and its input) is sent to wandbox.org to run, as the Privacy page
  says. Only people in a live room can run code there, the room rate-limits each person, and
  candidates' hidden-test runs go from the interviewer's browser, so the tests stay private.
- AI reports: the candidate's brief never contains private notes or the rubric; the
  interviewer report is only returned to whoever interviewed that round, and the candidate
  report only to its candidate when sharing is on. Model output is validated against a schema
  before it is stored.
- Video calls are peer to peer: the room only relays the connection setup between call
  participants (a tab's call id can't be taken over by another connection), and audio and video
  never pass through or get stored by the server.
- The HTML/CSS/JS preview runs in an iframe sandbox without `allow-same-origin`, so the page
  can't reach the app's cookies, storage or DOM.
- Company logos are stored as small PNG, JPEG or WebP data URLs (SVG is refused).
- Whiteboard images are raster only (PNG, JPEG, WebP, GIF; SVG is redrawn as JPEG in the
  browser), at most about 500 KB each and 30 per board, and only room members can fetch them.
- Sign-in links work once and expire after 10 minutes. Each address gets at most 3 links per
  15 minutes and the app sends at most 400 a day; these limits keep only a SHA-256 hash of the
  address, deleted after a day.
- A guest's claim token is derived from their seat with a server secret, stored only as a
  SHA-256 hash, and cleared once used. Claiming needs a signed-in account that isn't already in
  the room, and is refused if the interviewer no longer shares anything with the candidate.

## Known limitations

- Java, C, C++ and Go run on Wandbox, a free public service run by volunteers: a run takes a
  few seconds (Go compiles slowest), each person can send 20 runs or test cases a minute, and
  "Run tests" makes one call per test case. Set `REMOTE_EXECUTION` to `"off"` to turn it off.
- Code runs are reported by the browser that ran them, so a participant could fake their own
  run's output. Tests run in an interviewer's browser (which already holds the hidden tests), so
  **Run tests** needs an interviewer in the room.
- Calls are a mesh, so they suit interviews of two to four people, not large meetings. Without
  a TURN key (see Deploying), strict networks that block direct routes can't connect calls.
- AI reports use the Workers AI free allocation (about 10,000 neurons a day, roughly a dozen
  sessions' reports). Beyond that, Groq writes them if `GROQ_API_KEY` is set (its free tier has
  its own daily limits); otherwise they fail with a quota message and can be regenerated the
  next day.
- Sign-in emails come from a Gmail account, so the app sends at most 400 a day (Gmail allows
  500), and without a domain of its own they can land in spam.
- Retention cleanup runs every hour and deletes at most 100 rooms per run, so a room can
  outlive its `delete_after` date by up to an hour (longer only with a backlog of over 100
  expired rooms). A room whose documents can't be purged keeps its row and is retried next run.
