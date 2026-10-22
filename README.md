# Tenzeros

A clean-room rebuild of an AI CRM onboarding experience, built with Nuxt 4, Vue 3.5, strict TypeScript, Drizzle/SQLite, and DeepSeek. See [PLAN.md](PLAN.md) for the milestone boundaries.

## Setup

Requires Node.js **22.12+** (verified on Node 24) and **pnpm 10**. `better-sqlite3` uses a native module; platforms without a prebuilt binary need a compiler toolchain.

```sh
pnpm install
cp .env.example .env # Skip this if .env already exists.
# Set DEEPSEEK_API_KEY in .env. Never commit this file.
pnpm db:migrate
pnpm db:seed        # Optional: creates the demo account, without an LLM call.
pnpm dev
```

Open `http://localhost:3000/signup`. Enter your name, email, workspace name, and company domain. Signup creates an admin workspace with a 14-day trial and 2,000 top-up credits, then immediately opens `/:workspace/onboarding` while AI context is generated in the background. Find the four editable contexts under **Settings → AI context**.

The optional seed is idempotent. Sign in at `/login` with **Demo User** and **demo@tenzeros.local**; the workspace is `/demo-workspace/onboarding`. To generate its contexts, open Settings → AI context and select **Restart if interrupted**. The seed itself makes no network requests.

**Local demo authentication:** v1 intentionally accepts a matching name and email without a password or email verification, as specified in the plan. It is not an identity verification system. Sessions are encrypted, HttpOnly, SameSite=Lax cookies, valid for seven days; production uses Secure cookies.

## Environment

| Variable              | Purpose                                                                                                                                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `DEEPSEEK_API_KEY`    | Real DeepSeek key; only read on the server. Missing keys produce a clear context-generation error.                                                                             |
| `DEEPSEEK_BASE_URL`   | Defaults to `https://api.deepseek.com`.                                                                                                                                        |
| `DEEPSEEK_MODEL`      | Defaults to `deepseek-chat`.                                                                                                                                                   |
| `LLM_MOCK`            | `1` enables deterministic text, JSON, and tool-call responses without LLM network requests. Default `0`. Homepage fetching still runs, with its safety limits.                 |
| `NUXT_SESSION_SECRET` | At least 32 characters. `.env.example` includes a development-only default; replace it with `openssl rand -hex 32` for production. Production rejects the development default. |

Nuxt reads `.env` during development. The LLM adapter resolves `DEEPSEEK_*` and `LLM_MOCK` into a server-only runtime-config snapshot, so secrets are not baked into a build or exposed through `runtimeConfig.public`. Nuxt's `NUXT_DEEPSEEK_*` overrides also work; the unprefixed names take precedence.

## Commands and verification

```sh
pnpm typecheck   # Nuxt app/server plus scripts and tests, all strict
pnpm test        # Vitest unit and HTTP API tests; in-memory SQLite + LLM_MOCK=1
pnpm build       # Production Node server
pnpm db:generate # Generate SQL after a schema change; review and commit it
pnpm db:migrate  # Apply committed migrations to .data/tenzeros.db
pnpm db:seed     # Optional demo account
```

For a local production smoke test, set a non-default `NUXT_SESSION_SECRET`, then run `pnpm preview` after building. This loads `.env` with Node's `--env-file`; use HTTPS when accessing production session routes because their cookies are Secure. For deployment, run `node .output/server/index.mjs` with environment variables supplied by your host. Run migrations from the repository root first and keep the `.data/` volume persistent. The app uses a single Node process and a local SQLite file; the SSE hub and job queue are in-memory.

Tests cover transactional signup, unique slugs, session cookies, workspace authorization, editable contexts, scoped SSE (including an actual HTTP stream), context bootstrap and retries, deterministic LLM text/tool streaming, and homepage SSRF defenses, redirects, byte limits, and timeouts. Tests never read the real `.env` or call DeepSeek.

## M1 scope and extension points

- Self-hosted Inter, Tabler icons, and independently retyped CSS tokens; no Tailwind or Zero assets.
- Sidebar with workspace switching, a command-palette stub (`⌘K` / `Ctrl+K`), pinned lists, Chats, a computed trial pill, settings/footer links, collapse, mouse/touch/keyboard resizing, and the sidebar dismiss confirmation. Dismissal persists per membership and, for admins, the workspace.
- All 26 tables from PLAN §2, foreign keys, uniqueness constraints, migrations, and the demo seed. `listEntries.entityId` is deliberately polymorphic; future domain tools must validate its entity type and workspace. Membership onboarding timestamps support the shell dismissal semantics from the spec. `workspaces.contextStatus/contextError` expose asynchronous generation state and allow retry after interruption.
- `server/utils/llm.ts` is the only LLM SDK entry point. `chat()` returns content/tool calls; `streamChat()` yields SDK-shaped text/tool-call deltas. Provider failures are sanitized typed `LLMError`s.
- The homepage fetch has an 8-second total deadline, validates all DNS addresses and redirects, pins sockets to validated public IPs, retains the first 1.5 MB of large responses, prepends title/description/Open Graph metadata, excludes scripts and hidden markup, and passes at most 12,000 characters as untrusted evidence. Truncated scripts cannot consume the visible-text budget. Generation hedges uncertain claims and labels hypothetical customers.
- Authenticated `GET /api/stream` publishes row changes through `emitChange(workspaceId, model, op, row)` and custom events through `emitCustomEvent()`. Membership access is rechecked per event. Streams heartbeat and reconnect periodically; `useRealtime()` shares one EventSource, reconnects natively, and offers `onConnected` for a fresh snapshot. The context page coalesces connection and bootstrap events into one refresh per burst, with a trailing refresh for events received during an in-flight request. There is no event replay log or multi-process broadcast in M1.
- Bootstrap jobs run in-process via Nitro `event.waitUntil`. Interrupted jobs can be restarted from the context page. A ready workspace is not regenerated, so retries do not overwrite edited context.
- Onboarding contains **only its header and subtitle**. Other feature pages are placeholders. Task cards, reward progress, integrations, agents catalogue, invites, imports, and guided chat tools belong to M2/M3; the full Playwright suite belongs to M4.

`research/`, `.env`, `.data/`, dependencies, and build output are gitignored. The implementation uses the behavior/layout references without copying the original source, assets, or fonts.
