# HyperBeing — Project Overview

*Written 2026-07-08 as a deep knowledge-transfer document. Read this before touching anything. See `GAPS.md` for known problems and `CLAUDE.md` for day-to-day operational rules.*

## What this is

HyperBeing is an AI presentation maker. A user types a plain-text brief ("pitch deck for my fintech startup"), an AI agent named **Nova** asks a few clarifying questions, and the app generates a complete slide deck — every slide is a **single AI-generated image** — streamed to the browser in real time. Users can then edit individual slides with natural-language instructions, add slides, reorder, and export to PDF/PNG.

Target users: founders, marketers, and consultants under deadline pressure who don't want to fight PowerPoint. There is also a secondary **Design Mode** (standalone image generation gallery) and a **Prompt Generator** (conversational tool that writes image prompts). Business model: monthly credit subscriptions via Stripe (free / basic / pro / ultra1–4).

The single most important mental model: **slides are not structured documents — they are images.** All slide "content" (titles, bullets, typography, layout) is baked into a generated bitmap by an image model. The slide plan JSON exists to drive prompt generation and the UI shell, not to render text.

## Tech stack and why

| Layer | Tech | Why (inferred) |
|---|---|---|
| Frontend | React 18 + Vite + Tailwind + Framer Motion | Fast SPA iteration; heavy animation is a product requirement ("watching slides generate is the product") |
| Data fetching | axios + a small amount of TanStack Query | Query was added later (`api/queries.js`); most pages still use raw axios + useState |
| Backend | Node 20 + Express (ESM, `"type": "module"`) | Simple single-process API server |
| Database | SQLite via better-sqlite3 (synchronous), WAL mode | Zero-ops persistence; everything including images and logs lives in one file |
| Auth | JWT (15-min access + 7-day refresh) + Passport for Google/Meta/TikTok OAuth | Stateless API auth; express-session exists **only** for the OAuth redirect dance (5-min cookie) |
| Planning/copy AI | Anthropic Claude (`claude-sonnet-4-6`) | Nova's brain: brief analysis, slide plans, image-prompt writing |
| Image AI (classic style) | Google `gemini-3.1-flash-image-preview` — called "Nano Banana"/"NB2" throughout the code | Multimodal: accepts reference images + text, returns slide bitmaps |
| Image AI (minimalistic style) | OpenAI `gpt-image-2` (`gptImageGeneration.js`) | The restrained "minimalistic" deck style renders better here; also powers Design Mode |
| Payments | Stripe (subscriptions + webhook) | Credit economy defined in `backend/config/credits.js` |
| Email | Resend (`emailService.js`) | Transactional email (welcome, receipts, "deck ready") |
| Observability | Sentry (both ends), PostHog (both ends), plus a home-grown logger/metrics/tracer + admin dashboards | Belt and suspenders; the home-grown stack persists logs into SQLite |
| Real-time | Server-Sent Events (SSE), hand-rolled | One-directional streaming fits generation progress; no websocket infra needed |
| Hosting | Frontend on Vercel (`vercel.json` SPA rewrite), backend on Railway (`railway.toml`) | The `VITE_API_URL` env points the SPA at the Railway API |

The backend has a small vitest suite (`backend/test/` — credit ledger, streaming parser, SSRF guard; `npm test`). There is still no linter and no CI.

## Repository layout

```
backend/
  server.js            Express bootstrap: helmet, CORS, session, rate limit, routes, error handler
  database.js          SQLite schema + ad-hoc try/catch ALTER migrations (run on every boot)
  instrument.js        Sentry init (loaded via node --import)
  config/credits.js    THE single source of truth for the credit economy
  middleware/          auth (JWT), validate (schema validators), rateLimits, requestLogger
  routes/
    auth.js            register/login/refresh/OAuth (Google, Meta, TikTok)/profile/account
    presentations.js   THE core file (~1600 lines): full generation pipeline, SSE, edit/retry/add/unlock/reorder/delete
    promptChat.js      Prompt Generator sessions
    design.js          Design Mode: batch image generation + gallery SSE
    billing.js         Stripe checkout/portal/webhook/upgrade/downgrade
    user.js            GET /credits
    analytics.js       In-house event tracking (POST /track is public-ish) + admin-only analytics API
    admin.js           Admin API: logs, metrics, grant-credits, DB browsing
    adminDashboard.js  Self-contained HTML monitoring dashboard at /admin (ADMIN_TOKEN query auth)
    feedback.js        Feedback form → DB + email
  services/
    claudeAgent.js     All Claude calls + the giant Nova system prompts (~1160 lines)
    imageGeneration.js Gemini/NB2 slide image generation + retry + SVG placeholder fallback
    gptImageGeneration.js  OpenAI image calls (minimalistic slides + Design Mode)
    designPromptGenerator.js  Nova crafts Design Mode prompts (forced tool call)
    promptGenerator.js Prompt Generator conversation (system prompt in backend/prompts/)
    stripeService.js   Credit ledger, plans, deduct/refund/reset, admin checks
    emailService.js    Resend templates
    logger.js / metrics.js / tracer.js / posthogClient.js  Observability
    minimalisticExamples.js  Few-shot exemplar prompts for the minimalistic style
  prompts/             Markdown system prompts loaded from disk (prompt generator, design mode)
frontend/
  src/pages/           Route-level components (Dashboard, PresentationPage, Homepage, Pricing…)
  src/components/      PresentationViewer, PlanRevealScreen, QuestionFlow, modals, etc.
  src/api/client.js    axios instance with token-refresh interceptor
  src/utils/sse.js     Auth-aware EventSource wrapper (token via query param)
  src/utils/pdfExport.js  Client-side PDF/PNG export (jsPDF), free-plan watermark
  public/              llms.txt, sitemap, robots.txt, generated markdown mirrors (index.md files)
scripts/generate_markdown_mirrors.py  Renders each public route headlessly → markdown mirror (SEO for AI crawlers)
.githooks/pre-commit   Auto-regenerates mirrors when frontend page content changes (never blocks commits)
design-system/         Marketing-site design tokens/rules (docs, not code)
.impeccable/           Historical audit/critique reports (docs, not code)
PRODUCT.md             Product positioning + design principles — read it before UI work
```

## Architecture and data flow

```
 Browser (React SPA, Vercel)
   │  axios (JWT in Authorization header; auto-refresh on 401)
   │  EventSource (JWT in ?token= query param — EventSource can't set headers)
   ▼
 Express API (Railway, single process)
   ├── SQLite (backend/data/hyperbeing.db) — users, presentations, messages,
   │     subscriptions, credit_transactions (ledger), design_generations,
   │     prompt_sessions, feedback, analytics_events, app_logs
   ├── Anthropic API (claude-sonnet-4-6) — planning, prompts, web_search tool
   ├── Google Gemini image API ("Nano Banana") — classic-style slide images
   ├── OpenAI images API (gpt-image-2) — minimalistic slides + Design Mode
   ├── Stripe — checkout, webhook at /api/billing/webhook (raw body, sig-verified)
   ├── Resend — transactional email
   └── PostHog / Sentry
```

### The core generation pipeline (the thing that matters most)

Front-door flow (Dashboard → new presentation):

1. **Analyze** — `POST /api/presentations/analyze` (SSE response). Claude classifies the brief, optionally runs its `web_search` tool (queries are streamed to the UI live), and returns 3–5 contextual multiple-choice questions (`QuestionFlow.jsx`).
2. **Create** — the user's answers are appended to the brief as a `PREFLIGHT ANSWERS:` section (this exact string tells Nova's prompts to skip questions and generate immediately). `POST /api/presentations` inserts a `processing` row, **returns 201 immediately**, then runs `runFullFlow()` fully async — no job queue, just a dangling promise.
3. **Phase 1: plan** — `generateCompactPlan()` streams `HEADER:{json}` + `SLIDE:{json}` lines from Claude, parsed incrementally by `extractPrefixedObjects()` (bracket-counting parser, `jsonrepair` fallback). Each slide row is broadcast over SSE as it arrives (`plan_slide_streamed`) so the UI's `PlanRevealScreen` animates the outline appearing.
4. **Credit gate** — `computeAffordableSlides()` figures out how many of the planned slides the user can afford at 18 credits each (`CREDIT_COSTS.PER_SLIDE`). Affordable slides are charged up-front in one atomic ledger transaction; unaffordable ones become **locked** placeholder slides. Their image prompts are stored server-side only in `presentations.locked_slides` (never sent to the client) so `POST /:id/unlock-slides` can generate them later after an upgrade, without re-running Claude.
5. **Phase 2: image prompts** — `streamSlidePrompts()` streams one detailed `nano_banana_prompt` per slide (250–600 word art-directed prompts following a mandatory "5-layer structure"). As each prompt arrives, image generation for that slide starts immediately in parallel. Any slide the stream misses gets a targeted `generateSingleSlidePrompt()` fallback (the stream historically dropped the last slide).
6. **Phase 3: images** — `generateSlideImage()` calls Gemini with 4 retry attempts and exponential backoff. On persistent failure it returns an **SVG gradient placeholder**; `isPlaceholderImage()` (checks the `data:image/svg` prefix) is how every caller distinguishes success from failure. Failures set slide `status:'error'` and **refund** that slide's credits. Completed slides are broadcast (`slide_ready`) and persisted incrementally via `persistProgress()`, which merges by slide index and never overwrites slides flagged `_edited`.
7. **Finish** — status → `completed`, slide 0's image becomes the dashboard `thumbnail`, a "deck ready" email is sent.

There is no alternate flow anymore: the in-presentation chat path (`POST /:id/messages` → `streamChat` → `POST /:id/generate` → `runGeneration()`, plus the frontend `ChatPhase`) was **removed in 2026-07** — it was unreachable in practice (no code path ever created a presentation with status `'chat'`) and its serial pipeline charged no credits. The Dashboard prompt is the only way decks are created. The `messages` table remains: it stores the initial brief (and its attachments, which the pipeline re-reads).

### SSE / real-time design

Two in-memory registries in `presentations.js`: `sseRegistry` (presentationId → Set of responses) for the generation page, `userSseRegistry` (userId → Set) for live dashboard updates; `design.js` has its own per-user registry. On connect, `GET /:id/events` does **catch-up replay**: it re-sends the plan and every completed slide from the DB so a client that reconnects mid-generation resyncs (this replays full base64 images — heavy). Heartbeats every 25s. `frontend/src/utils/sse.js` wraps EventSource with re-auth logic since EventSource can't attach headers or use the axios refresh interceptor.

Meaningful subtlety: on catch-up for a `completed` presentation, the server withholds the `complete` event if any slide is still `status:'generating'` (an add-slides run keeps the row `completed` while cooking; the separate `adding_slides` column makes the dashboard say "Generating…").

### The credit economy

`backend/config/credits.js` is documented as the single source of truth. Costs: 18/slide to generate or add, edits are tiered (5 credits until a per-plan monthly threshold, then 15), Design Mode 15–18/image. Every mutation goes through `stripeService.js` — `deductCredits` / `refundCredits` / `deductCreditsForEdit` are atomic better-sqlite3 transactions that also write a `credit_transactions` ledger row (balance before/after, slide counts, edit tier, metadata). The invariant the code works hard to maintain: **every failed image generation refunds its deduction**. Admins (emails in `ADMIN_EMAILS` env) bypass all credit and token checks with fake 999999 balances.

Separate from credits, there is a **token budget** per plan (`tokens_used` vs `PLANS[plan].tokenLimit`) checked before every Claude call via `checkTokenBudget()` — throws `TOKEN_LIMIT_EXCEEDED` → HTTP 402.

Plan changes: upgrades charge a prorated invoice immediately (`error_if_incomplete`) but the credit grant only lands when the `invoice.paid` webhook (billing_reason `subscription_update`) confirms payment. Downgrades set `pending_plan` and apply at the next cycle. Cancellations keep credits until `credits_reset_date`, then a **lazy reset** (`maybeApplyScheduledReset`, called from `getCreditsInfo`) drops the user to free — there is no cron; state advances only when the user loads their credits.

### Slide data model

Everything about a presentation's slides lives in two JSON TEXT columns on the `presentations` row: `slide_plan` (outline, no images) and `slides_data` (array of slide objects **including full base64 image data URLs**, `_edited` flags, `status` of `generating|complete|error|locked`). Slide identity is the `index` field (stable, never reindexed after deletion — new slides get `max(index)+1`; using array position instead of max-index caused a nasty duplicate-index bug that the comments in `add-slides` describe in detail). Every slide mutation is a read-parse-modify-rewrite of the whole JSON array.

Version history is the exception: since 2026-07, prior slide images live in the `slide_versions` table (capped at 10 per slide, pruned on insert, one-time boot migration moved legacy embedded versions over); slides carry only `{id, instruction, created_at}` stubs so old images never bloat `slides_data`. Dashboard thumbnails are likewise no longer inlined in list payloads — `GET /api/presentations` returns `has_thumbnail` and the image is served by `GET /:id/thumbnail`.

## Key design decisions you should respect

- **Fire-and-forget async jobs, not a queue.** Generation runs as a detached promise after the HTTP response. A startup sweep (`services/recovery.js`) now cleans up after crashes/deploys — anything still marked in-flight at boot is errored and refunded. All coordination happens through the DB + SSE. Comments throughout `presentations.js` document the concurrency bugs this caused and the re-read-before-write patterns adopted to mitigate them. When mutating `slides_data` from an async continuation, **always re-read the row fresh right before writing** and check the slide's current `status` — the codebase treats "slide no longer `generating`" as "someone else won; discard my result and refund".
- **Mock mode everywhere.** If `ANTHROPIC_API_KEY` / `GOOGLE_API_KEY` / `OPENAI_API_KEY` are unset or literally `demo`, each service silently switches to canned responses and SVG placeholder images. The whole app is demoable with zero keys. Don't break this — it's also the only way to exercise the pipeline cheaply.
- **Prompts are product.** More than half of `claudeAgent.js` is prompt text (the 5-layer nano-banana structure, the non-negotiable black/hot-pink/neon-green palette, the "BANNED FOREVER" clichés list). The "minimalistic" style learns from 12 few-shot exemplars in `minimalisticExamples.js` instead of rules. Treat prompt edits as behavior changes with the same care as code.
- **Streaming line-protocol over JSON documents.** Claude outputs `HEADER:`/`SLIDE:` prefixed JSON lines so the UI can react per-slide instead of waiting for a full document. If you change a prompt's output format, you must update `extractPrefixedObjects` consumers, and vice versa.
- **AI-visible marketing site.** `frontend/public/llms.txt`, per-route markdown mirrors (`index.md`), sitemap/robots, and JSON-LD in `index.html` exist for AI-crawler SEO. The mirrors are **generated** by `scripts/generate_markdown_mirrors.py` (wired into `.githooks/pre-commit`) — never hand-edit them.
- **Em-dash sanitization.** All Claude output passes through `sanitizeText` which replaces em/en dashes with hyphens — a deliberate brand/AI-tell decision.
- **Two admin systems on purpose-ish.** JSON admin API (`/api/admin`, `/api/analytics`) uses JWT + `ADMIN_EMAILS`; the HTML monitor at `/admin` uses a static `ADMIN_TOKEN` query param. They coexist; don't unify casually without checking who uses what.

## Critical paths (ranked)

1. **`backend/routes/presentations.js` + `backend/services/claudeAgent.js` + `backend/services/imageGeneration.js`** — the product. Nearly every hard-won concurrency/UX lesson is encoded in comments here. Change with maximum care; the failure modes are silent (clobbered slides, stuck `generating` states, double-charging).
2. **`backend/services/stripeService.js` + `backend/config/credits.js` + `backend/routes/billing.js`** — money. Deduct/refund symmetry and webhook idempotency are the invariants.
3. **`backend/database.js`** — schema is append-only via try/catch ALTERs; never rename/retype columns, only add.
4. **Auth (`middleware/auth.js`, `routes/auth.js`, `frontend/src/api/client.js`, `utils/sse.js`)** — the 401→refresh→retry loop and the SSE re-auth wrapper are load-bearing for every page.
5. **`frontend/src/pages/PresentationPage.jsx` + `components/PresentationViewer.jsx`** — the SSE event reducer lives here; event names are a de-facto API contract with the backend (`plan_started`, `plan_slide_streamed`, `slide_ready`, `slide_error`, `slide_locked`, `slides_trimmed`, `partial_generation`, `complete`, …).

Safe to change casually: marketing pages (`Homepage`, `Pricing`, `ServicePage`, `Terms`, `Privacy`), email templates, the admin HTML dashboard, `design-system/` and `.impeccable/` docs.

## Things that will trip you up

- **"Nano Banana" / "NB2" = Gemini image generation.** The README's "Imagen 3" is stale. Minimalistic-style decks don't use Gemini at all — they go to OpenAI.
- **Placeholder-as-error convention:** image generators return an SVG data-URL placeholder instead of throwing. Forgetting an `isPlaceholderImage()` check makes failures look like successes (blank gradient slides) and skips refunds.
- **`slides_data` slide `index` ≠ array position.** Always `find(s => s.index === …)`, never index into the array.
- **The apiLimiter's per-user keying never works** — it's mounted before auth, so it's always IP-keyed. Per-route limiters mounted after `authenticateToken` do key by user.
- **EventSource auth is query-param tokens**, so a JWT appears in URLs/server logs for SSE routes; OAuth callbacks also put tokens in the redirect URL. Known tradeoff (see GAPS).
- **`getOrCreateSubscription` is called lazily everywhere** — a user row without a subscription row is normal and self-heals; the `subscriptions` schema DEFAULT of 5 credits is dead (real default is `PLAN_CREDITS.free` = 54).
- **Access tokens last 15 minutes.** Anything that holds a connection or token longer must handle refresh (this is why `utils/sse.js` exists).
- **Frontend `.env`:** empty `VITE_API_URL` means "use the Vite dev proxy to localhost:3001". Setting it in production points at Railway.
- **DB lives at `backend/data/hyperbeing.db`** (gitignored), overridable via `DB_PATH`. Logs are *in the same database* (`app_logs`, capped at 10k rows).
- **`PREFLIGHT ANSWERS:` is a magic string** — both the Dashboard composer and multiple system prompts depend on it verbatim.
