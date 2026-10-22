# Tenzeros

A clean-room app inspired by a modern AI CRM onboarding. Nuxt 4, Vue 3.5, strict TypeScript, SQLite/Drizzle and server-only DeepSeek power six onboarding tasks and six guided setup flows.

## Setup

Use **Node 22.12+** (CI uses Node 24) and **pnpm 10.29.1**. `better-sqlite3` needs a compiler toolchain if a prebuilt binary is unavailable for your platform.

```sh
pnpm install
cp .env.example .env # Only if you do not already have .env
# Put your DEEPSEEK_API_KEY in .env, or set LLM_MOCK=1 for offline AI.
pnpm db:migrate
pnpm db:seed        # Optional, offline, idempotent demo
pnpm dev
```

Open `http://localhost:3000/signup`. Signup creates an admin, a workspace, a 14-day trial and 2,000 credits. Four editable AI contexts appear asynchronously at **Settings → AI context**. A missing key produces a configuration message with **Retry generation**; signup still succeeds.

The seed creates **Demo User / demo@tenzeros.local** for `/login`, four fictional editable contexts and six disabled agents. It preserves existing context edits and agent toggles on reruns. Visit `/demo-workspace/onboarding` (the seed prints the actual slug if that name was taken). It makes no network requests. Use a fresh signup to repeat onboarding from zero.

## Environment

All secrets live in `.env` or the host's environment, never in client runtime config. Nuxt loads `.env` in development; `pnpm start` loads it if present. Host environment values take precedence over the file.

| Variable                                   | Purpose                                                                                                                                                 |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DEEPSEEK_API_KEY`                         | DeepSeek key, server only. Required for real AI, not for mock mode.                                                                                     |
| `DEEPSEEK_MODEL`                           | Optional; defaults to `deepseek-chat`.                                                                                                                  |
| `DEEPSEEK_BASE_URL`                        | Optional; defaults to `https://api.deepseek.com`.                                                                                                       |
| `LLM_MOCK`                                 | `1` gives deterministic AI responses and skips homepage fetching; no provider key or external network is needed. Default `0`.                           |
| `NUXT_SESSION_SECRET`                      | **Required in production**, at least 32 characters. Generate with `openssl rand -hex 32`. Production rejects the development default in `.env.example`. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Optional Google OAuth credentials. Set both to enable the real Google connection alongside simulation.                                                  |
| `DATABASE_PATH`                            | Optional SQLite file; defaults to `.data/tenzeros.db`. Useful for isolated tests or a persistent deployment volume.                                     |
| `HOST`, `PORT`                             | Built-server bind address and port; default port 3000.                                                                                                  |

`DEEPSEEK_*` and `LLM_MOCK` are resolved at request time, not embedded in the build. Nuxt's `NUXT_DEEPSEEK_*` aliases also work; unprefixed values take precedence.

For real Google OAuth, enable Gmail and Calendar APIs, configure a web client and add your sign-in email as a test user. Register the exact callback `http://localhost:3000/api/integrations/google/callback` (or your HTTPS origin and port). The selected Google email must match your signed-in email. OAuth uses expiring session-bound state, PKCE, read-only scopes and encrypted stored tokens. Rotating the client secret requires reconnecting. Mail ingestion and token-refresh workers are not implemented.

## Run and verify

```sh
pnpm dev
# For a production build (stop dev first):
pnpm build
pnpm start
```

Run migrations from the repository root before starting the built server. Supply a unique session secret. Production cookies are Secure: use HTTPS in deployments; Chromium also permits them on localhost for the e2e harness. Keep the SQLite volume persistent. The server requires the repository's migrations and native `better-sqlite3` dependency at runtime.

```sh
pnpm install
pnpm format:check
pnpm typecheck
pnpm test
pnpm build
pnpm exec playwright install chromium # Once per machine; --with-deps on Linux CI
pnpm test:e2e
```

Playwright runs Chromium against the **built production server** on ports **3100 and 3101**. It migrates fresh isolated databases under `.data/`, overrides provider credentials, and removes its databases on shutdown. Port 3100 runs `LLM_MOCK=1`; port 3101 tests real missing-key errors with empty keys. It never uses your normal workspace database or `.env`. Rebuild after app/server changes. Tests wait on UI, responses and state, with no fixed sleeps.

Coverage includes signup → all six tasks (including an actual CSV upload and mapping approval), 150 earned credits and 2,150 balance, live updates in a second tab, once-per-task celebrations across tabs and reloads, completion timestamps, mailbox locks, invited-member visibility and a complete guided flow with refresh/resume/restart. A test fixture accepts a UI-created invite directly in the isolated database; production exposes no test-only acceptance route. Axe checks onboarding, agents, context settings and the docked chat for serious/critical violations. Keyboard and reduced-motion checks accompany recovery tests for missing AI configuration, mid-stream errors, SSE reconnect/resync, expired sessions and 404s. Mid-stream and disconnect tests inject transport failures; ordinary cross-tab delivery uses real SSE.

Vitest covers the real h3 handlers, SQLite transactions, permissions, credits, flow/tool protocols, AI errors, CSV validation, homepage SSRF defenses, rate limiting and the offline seed. GitHub Actions runs formatting, typechecking, unit/API tests, build and e2e without secrets. Failure traces/screenshots are retained for seven days. The existing DCO check is independent; sign commits with `git commit -s`.

For **real DeepSeek** verification (uses provider credits):

```sh
LLM_MOCK=0 pnpm dev --host 127.0.0.1 --port 3001
# In a second terminal:
VERIFY_BASE_URL=http://127.0.0.1:3001 pnpm verify:real
```

The script creates a test workspace, waits for company context, simulates a mailbox and completes all six guided flows plus CSV import through the API. It saves local transcripts and account details to `/tmp/tenzeros-m3-real-transcripts.json` and `/tmp/tenzeros-m3-verification-account.json`; `VERIFY_REUSE=1` reuses that account. Keep the server stable during the run. This opt-in live-provider check is separate from CI.

Other commands: `pnpm format` formats source, `pnpm db:generate` generates migrations after schema changes, and `pnpm test:screenshots` captures onboarding against an already-running mock dev server (`PLAYWRIGHT_BASE_URL` overrides its default `http://127.0.0.1:3000`).

## Architecture

- **UI:** `app/pages/[workspace]/onboarding.vue` composes the task grid, reward progress, native dialogs and guided carousel. The docked chat lives in `app/components/chat/`; persisted server controls render as continue, conversation, menu and choice inputs. Keyboard focus stays visible, dialogs contain focus and restore it on close, and reduced-motion preferences suppress confetti, springs and CSS animation.
- **AI:** `server/utils/llm.ts` is the sole LLM SDK entry point, using DeepSeek streaming/tool calls with sanitized errors. `server/utils/bootstrap.ts` generates company overview, ICP, sales motion and example-customer context. Real-mode homepage fetching limits time/size, validates DNS and redirects, and pins connections to public addresses.
- **Flows:** `server/ai/flows/` holds server-only prompts for pipeline/lists, agents, existing customers, target accounts, outreach and writing style. `server/ai/chat-engine.ts` persists turns and controls, validates tool input, serializes per-chat mutations and caps each turn at eight tool rounds. Domain tools write actual CRM rows. Pipeline/outreach payloads require approval; generated example accounts are explicitly labelled. CSV mapping uses only headers and the first five rows, followed by approval and a transactional import of the full file (UTF-8 CSV, ≤5 MB). Excel and record deduplication are not supported.
- **Data and rewards:** `server/db/schema.ts` and committed SQL migrations define SQLite storage. `server/utils/onboarding.ts` owns qualifying mutations, idempotent completion and credit accounting. Each task awards 25 credits; personal-task rewards have a four-user cap. Workspace tasks are admin-only. The server validates all visible tasks before storing `onboardingCompletedAt`. The browser remembers celebrations in `onboarding-seen-tasks:<workspace>:<user>`; Web Locks serialize claims across tabs in secure contexts.
- **Realtime:** authenticated `GET /api/stream` pushes committed row changes and custom flow events. `useRealtime()` shares one EventSource per app, shows reconnect status and refetches snapshots on each `ready` event, including events missed while offline. Chat turns use separate POST SSE streams. There is no polling, replay log or multi-process broadcast. SQLite, bootstrap jobs, chat locks, SSE subscribers and rate limits assume a **single Node process**.
- **Production basics:** CSP limits assets and connections to this app, with inline scripts/styles for Nuxt hydration and Vue/Motion; `frame-ancestors 'none'`, `X-Frame-Options: DENY`, `nosniff` and a strict-origin referrer policy are included. In-memory token buckets allow signup bursts of 20 per socket IP (one token refilled every 30 seconds), and chat bursts of 60 per authenticated user (one per second), shared across their chats/sessions. A 429 includes `Retry-After`. Forwarded IP headers are deliberately untrusted; behind a proxy, signup requests share its bucket unless a trusted proxy identity strategy is added. Buckets reset on restart and do not replace edge protection.

## Demo boundaries and clean room

This is a local demo authentication model: matching name/email is sufficient to sign in, with **no password or email verification**. Do not use it for sensitive customer data or expose it as a public multi-user service without real authentication. Encrypted HttpOnly, SameSite=Lax sessions last seven days.

Gmail/Calendar, notetaker, LinkedIn and CRM simulations are visibly labelled **Demo**. Invites are stored without sending email. Agents can be enabled but do not execute in the background; customer lists are curated, not self-updating. Outreach creates drafts/sequences without sending messages. Writing style uses pasted samples. Broader CRM destinations and workspace search remain placeholders. Simulation and mock AI are separate: simulated connections can be used with real DeepSeek, and real Google OAuth can be enabled while other integrations stay simulated.

The implementation is independently written from behavioral/layout references. No proprietary source, logos, fonts or assets are included. It uses self-hosted Inter, MIT Tabler icons, CC0 Simple Icons and original illustrations. Local reference research, `.env` and `.data/` are gitignored and must never be committed. [PLAN.md](PLAN.md) records the milestone boundaries.
