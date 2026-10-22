# Tenzeros: PLAN

A clean-room rebuild of the "Get started" onboarding experience of Zero (an AI CRM, `app.zero.inc/<workspace>/onboarding`).
The behaviour was reverse engineered with [REA](https://github.com/morluto/rea).
Every LLM call inside the app goes through **DeepSeek**.

- **Coding agent:** GPT-6-Astra (Codex), one milestone per branch and PR.
- **Reviewer:** Claude Opus 5.5. It reviews every PR against this plan and the spec, and requests fixes until sign-off.

## 0. Sources of truth

| File | What |
|---|---|
| `research/zero-onboarding/SPEC-onboarding.md` | Evidence-backed spec: component tree, verbatim copy, task and flow catalogue, credit rules, API, realtime, AI control protocol |
| `research/zero-onboarding/screenshot-onboarding.png` | Reference screenshot |
| `research/zero-onboarding/design-tokens.css` | Observed design tokens (colours, radii, shadows, type scale, easings) |
| `research/zero-onboarding/onboarding-page.reference.css` | Original scoped page CSS (minified), for reference |

`research/` is **gitignored** (raw reverse-engineering material, public repo). It exists only in the main checkout at
`/Users/moeghashim/tenzeros/research/`. Agents read it from that absolute path.

**Clean-room rules.**
- Do not copy Zero source code, logos, the FT Polar font or brand assets.
- Re-implement the behaviour and layout from the spec.
- The product name is **Tenzeros**.
- Use Inter (or Geist) instead of FT Polar.
- Icons are Tabler (`@tabler/icons-vue`, MIT). Third-party brand logos (Gmail, LinkedIn, HubSpot…) come from `simple-icons` (CC0).

## 1. Stack (decided)

- **Nuxt 4 + Vue 3.5 + TypeScript (strict)**, pnpm. This mirrors the original architecture: Nuxt pages and Nitro server routes.
- **Styling:** scoped SFC CSS with CSS custom properties, seeded from `design-tokens.css`. No Tailwind.
- **DB:** SQLite via **Drizzle ORM** (`better-sqlite3`), file at `.data/tenzeros.db`. Migrations are in `server/db/migrations`.
- **Realtime:** Server-Sent Events, `GET /api/stream`. The server pushes row changes (`onboardingTaskCompletions`, `onboardingFlowStatuses`, `chats`, `subscriptions`) so the page never polls.
- **AI:** `openai` npm SDK pointed at DeepSeek, wrapped in a single module, `server/utils/llm.ts`. Nothing else may import an LLM SDK.
  Config comes from env only: `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` (default `https://api.deepseek.com`) and `DEEPSEEK_MODEL` (default `deepseek-chat`).
  It is server-only (`runtimeConfig`, never `public`) and supports streaming and tool calling.
- **Chat transport:**
  - `POST /api/chats/:id/messages` streams the assistant turn back as SSE (text deltas, tool calls, tool results).
  - The chat history is persisted in the `chatMessages` table.
- **Animation:** `motion-v` (spring progress bar) and `canvas-confetti` (card completion).
- **Validation:** zod on every API input.
- **Tests:** Vitest (unit and API) and Playwright (e2e). The LLM is mocked in tests through a `LLM_MOCK=1` switch in `llm.ts`.
- **Auth (v1):** a local cookie session (h3 `useSession`) with a simple sign-up and sign-in form (email + name). No passwords or OAuth for app login in v1.

## 2. Data model (minimum)

| Table | Key columns |
|---|---|
| `users` | id, email, name, avatarColor |
| `workspaces` | id, key (url slug), name, domain, settings json, trialEndsAt, onboardingStartedAt, onboardingCompletedAt, onboardingSkippedAt |
| `memberships` | id, workspaceId, userId, role (`admin`\|`member`), invitedById, inviteEmail, status (`active`\|`invited`) |
| `subscriptions` | id, workspaceId, status (`trialing`), monthlyCreditsRemaining, topupCreditsRemaining (starts at 2000) |
| `onboardingTaskCompletions` | id, workspaceId, userId (null for workspace-level tasks), taskKey, creditsAwarded, completedAt |
| `onboardingFlowStatuses` | id, workspaceId, userId, flowKey, status (`not_started`\|`in_progress`\|`completed`), chatId |
| `aiContexts` | id, workspaceId, name, content (markdown), type (`prompt`). Seeded by AI at sign-up. |
| `mailboxes`, `calendars`, `notetakers`, `linkedinAccounts`, `integrations` | rows created by the connect flows (simulated in v1) |
| `pipelines`, `pipelineStages`, `lists`, `listEntries`, `companies`, `contacts`, `deals`, `agents`, `sequences`, `sequenceSteps`, `writingStyles`, `imports` | targets that the guided flows and migration write into |
| `chats`, `chatMessages` | chat id, workspaceId, userId, flowKey?, title; messages hold role, content, toolCalls json, toolCallId |

## 3. Features and acceptance criteria

### 3.1 App shell
- A sidebar matching the spec and screenshot:
  - workspace switcher and collapse button;
  - Search ⌘K (opens an empty command palette stub);
  - **Get started**, then Home, Inbox, Tasks, Lead search, Agents, Sequences, Reports, Records & Lists;
  - Pinned lists (Sales Pipeline, My deals);
  - Chats ("No chats yet", or the list of chats);
  - footer: a trial pill ("N/14 days left on your trial"), Settings, referral, docs and feedback icons.
- The sidebar is resizable and collapsible.
- Non-onboarding routes render a simple placeholder page with the right title. `/:workspace/agents`, `/lists` and `/settings/workspace/users` are real enough for the flows below.
- "Get started" shows a progress ring and lets the user dismiss onboarding (spec: the sidebar "Dismiss" flow).

### 3.2 Sign-up and workspace bootstrap (AI)
- `/signup` collects name, email, workspace name and company domain. It creates the user, the workspace (slug from the name), an admin membership and a trialing subscription (14 days, 2000 credits), then redirects to `/:workspace/onboarding`.
- **DeepSeek job:** after sign-up the server fetches the company homepage text (timeout 8s; fail-soft) and asks DeepSeek to write four `aiContexts`: **Company overview**, **Ideal Customer Profile (ICP)**, **Sales motion** and **Example customers**.
  - Each is 2–4 short paragraphs and must hedge where it is unsure, matching the style of the observed outputs.
  - They are written asynchronously, so the page must not block on them. Each is pushed over SSE when ready.
- The contexts are viewable and editable at `/:workspace/settings/workspace/context`. Every AI prompt below includes them as grounding.

### 3.3 Onboarding page `/:workspace/onboarding` (pixel and behaviour parity with spec §1–§2)
- The header copy, progress bar with credit badge and milestones, and bento grid layout are exactly as in the spec and screenshot.
- **Six task cards**, keys from the spec: `connect_gmail`, `connect_notetaker`, `install_extension` (LinkedIn), `create_automation` (Enable agents), `invite_colleague`, `import_data`.
  - Each has a 25-credit reward chip, the reward rules from the spec (per-user vs workspace, admin-only visibility) and the completed state with a checkmark.
  - Confetti fires once per task per browser, using the `onboarding-seen-tasks:<ws>:<user>` localStorage key.
- **Completion is decided server-side only.** When a qualifying row is created, the server inserts the `onboardingTaskCompletions` row, adds the credits to `topupCreditsRemaining` and emits SSE.
- **Connect flows in v1:**
  - Gmail + Calendar: real Google OAuth when `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set. Otherwise a consent modal (same copy as the spec) with **"Simulate connection"**, which creates mailbox and calendar rows.
  - Notetaker and LinkedIn: provider picker, then "Simulate connection".
  - Every simulated path is clearly labelled "Demo".
- **Enable agents:** opens `/:workspace/agents`, a catalogue of 6 ready-made agents (name, description, toggle). Enabling one completes `create_automation`.
- **Invite your team:**
  - the invite modal takes emails and a role and creates `memberships` with status `invited`, which completes `invite_colleague`;
  - invite suggestions are empty when there is no mailbox (`{status:"no_mailbox"}`), as observed.
- **Migrate existing data:**
  - **CSV** opens the AI import chat (§3.5);
  - HubSpot, Attio, Affinity and Pipedrive show "Connect" and the demo simulation, which imports 20 sample records;
  - completion happens when an import reaches `Completed`.
- **Completing all tasks** shows the "Complete onboarding" state from the spec and sets `onboardingCompletedAt`.

### 3.4 Guided setup (AI, DeepSeek)
- **Gallery:** a carousel with prev/next buttons that appear only when the track overflows. It has six flows: `set_up_pipeline`, `activate_agents`, `track_customers`, `target_account_list`, `start_outreach` and `personalize_emails`.
  - The last two are locked until a mailbox exists (lock icon + "Connect Gmail" CTA, as in the spec).
  - Status badges come from `GET /api/onboarding/flows/statuses` → `{statuses:{[flowKey]:status}, chatIds:{[flowKey]:chatId}}`.
- **Starting a flow:** clicking a card calls `POST /api/onboarding/flows/start {workspaceId, flowKey, mode:"start"|"resume"|"restart"}`, which returns `{chatId}`. A **docked chat panel** then opens on the right and the agent speaks first.
- **Agent:** DeepSeek with a flow-specific system prompt (`server/ai/flows/<flowKey>.ts`) plus the workspace aiContexts.
- **Tools:**
  - `present_onboarding_control`: the UI control protocol from the spec, with kinds `continue`, `conversation`, `menu` and `choice`. It renders as interactive buttons and chips in the chat; the user's choice is sent back as the tool result.
  - Domain tools, each strictly zod-validated and writing real rows:
    - `create_pipeline_stages`
    - `enable_agents`
    - `create_list` / `add_companies_to_list`
    - `score_accounts`, which ranks the workspace's companies against the ICP. If there are none, it generates **clearly labelled example** accounts and must never present invented companies as real data.
    - `create_sequence`
    - `save_writing_style`
  - `complete_flow`, which sets the status to `completed`, triggers the celebration on return to the onboarding page and emits SSE.
- **Resilience:**
  - The tool loop is capped (max 8 tool rounds per turn).
  - DeepSeek errors surface as a retryable chat error.
  - If `DEEPSEEK_API_KEY` is missing, the flows show a clear configuration message instead of crashing.

### 3.5 CSV import chat (AI)
- The first assistant message is verbatim from the spec, followed by an upload block.
- The user uploads a CSV (≤ 5 MB, parsed server-side with papaparse).
- DeepSeek proposes a column → field mapping for contacts, companies and deals. It sees the headers plus the first 5 rows only, never the full file.
- The mapping is shown as a confirm control. On confirm the import runs, the `imports` row becomes `Completed`, and `import_data` completes.

## 4. Milestones (one PR each, stacked on `main`)

| # | Branch | Scope | Done when |
|---|---|---|---|
| M1 | `m1-foundation` | Nuxt scaffold, tokens and fonts, app shell and sidebar, Drizzle schema and migrations, session and sign-up, SSE hub, `llm.ts` + AI context generation, seed script, Vitest set up | `pnpm dev` runs; sign-up creates a workspace and the 4 AI contexts appear; `pnpm typecheck && pnpm test` pass |
| M2 | `m2-onboarding-page` | §3.3 in full except the AI chat: cards, progress, credits, completions, SSE updates, confetti, connect modals (demo), agents catalogue, invites, demo CRM imports, complete-onboarding | Page matches the screenshot; every task can be completed and credits update live; tests pass |
| M3 | `m3-ai-flows` | Chat engine (persisted, streaming, tool loop), docked chat panel, `present_onboarding_control` renderer, 6 guided flows + domain tools, CSV import chat, celebration | Each flow can be run end-to-end against real DeepSeek and against `LLM_MOCK`; tests pass |
| M4 | `m4-hardening` | Playwright e2e (sign-up → complete all tasks with the LLM mocked), a11y pass, error states, README (setup, env, DeepSeek) | `pnpm test:e2e` is green; README is accurate |

## 5. Process

1. Opus 5.5 (the reviewer) writes this plan and the milestone briefs.
2. GPT-6-Astra implements a milestone on its branch, commits, pushes and opens a PR to `main`.
3. Opus 5.5 reviews: it reads the diff, runs `pnpm install && pnpm typecheck && pnpm test` (and the app where needed), and checks the work against this plan and the spec. Findings go back to Astra in a new round until there are none blocking.
4. Opus 5.5 signs off and merges, then the next milestone starts from the updated `main`.

## 6. Non-goals (v1)
- Real LinkedIn, notetaker, HubSpot, Attio, Affinity or Pipedrive integrations.
- Billing.
- Email sending.
- Multi-region.
- Pixel-perfect parity for pages other than onboarding.
