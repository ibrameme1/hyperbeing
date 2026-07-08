# GAPS — Honest audit of weaknesses

*Compiled 2026-07-08 from a full read of the codebase. Ordered by severity, most important first. Each item says what/where/why and a fix scoped small enough to execute as a single task. Line numbers are approximate — re-locate by the quoted identifiers.*

**Remediation pass (2026-07-08, same day):** every item now carries a STATUS line. Nearly all are fixed; the notable survivors are the full images-out-of-SQLite migration (#7), linter/CI (#4), and SSE query-param tokens (#8b). Two extra bugs surfaced and were fixed during remediation: `emailService.js` crashed the entire server at boot when `RESEND_API_KEY` was unset (Resend's constructor throws on a missing key — now lazily constructed), and mock-mode generation always produced an empty deck because `generateCompactPlan` called `mockChat([])` with zero user turns. The chat-flow feature (Nova chat inside a presentation + its legacy serial pipeline) was **removed entirely** rather than patched — it was unreachable dead weight with a billing hole.*

---

## 1. `POST /:id/generate` charges no credits (free generation + refund minting)

> **FIXED (2026-07-08)** — resolved by removing the chat-flow feature entirely: `POST /:id/generate`, `runGeneration()`, `POST /:id/messages`, `streamChat`, and the frontend `ChatPhase` are deleted. Decks are created only via `POST /api/presentations` (`runFullFlow`), which charges correctly.

- **What:** The legacy chat-flow generation path deducts nothing. `runGeneration()` in `backend/routes/presentations.js` (route `POST /api/presentations/:id/generate`, ~line 721; function ~line 747) generates every slide in the plan without calling `deductCredits`/`computeAffordableSlides`. Worse, on placeholder failure it calls `refundCredits(userId, CREDIT_COSTS.PER_SLIDE, …)` — refunding credits that were **never deducted**, i.e. failures mint free credits.
- **Where:** `backend/routes/presentations.js` (`router.post('/:id/generate'…)`, `runGeneration`). Reachable from the UI: `frontend/src/pages/PresentationPage.jsx:802` calls it after the chat flow reaches `state:'ready'`.
- **Why it matters:** Direct revenue leak and ledger corruption. A user who creates a presentation via the chat path (not the Dashboard preflight path) gets unlimited slides for free.
- **Fix (single task):** In the `/:id/generate` route, before responding, run the same `computeAffordableSlides` + `deductCredits` + locked-slide logic used in `runFullFlow` (or, simpler: charge `slides.length * CREDIT_COSTS.PER_SLIDE` and 402 with `novaInsufficientCredits` when unaffordable). Keep the refund calls only if a deduction happened.

## 2. SSRF in `POST /api/presentations/fetch-url`

> **FIXED (2026-07-08)** — `services/urlGuard.js` (`assertPublicUrl`) resolves DNS and rejects private/loopback/link-local/CGN ranges, non-http(s) schemes, and non-standard ports; redirects are followed manually with re-validation per hop. Covered by tests in `test/parsers.test.js`.

- **What:** Authenticated endpoint fetches an arbitrary user-supplied URL server-side and returns the page text. Only validation is `^https?:\/\/.+`. No blocking of private/link-local addresses, no DNS-rebind protection, redirects are followed.
- **Where:** `backend/routes/presentations.js` ~lines 101–135.
- **Why it matters (severity: high):** From Railway, this can probe internal networks / cloud metadata endpoints (e.g. `http://169.254.169.254/…`, `http://localhost:3001/admin?token=…`) and exfiltrate the response body to the caller.
- **Fix (single task):** Before fetching, resolve the hostname (`dns.lookup`) and reject if any resolved address is private/loopback/link-local (10.x, 172.16–31.x, 192.168.x, 127.x, 169.254.x, ::1, fc00::/7); also reject literal IPs in those ranges, non-80/443 ports, and set `redirect: 'manual'` (or re-validate on redirect).

## 3. `PUT /api/auth/profile` is broken — writes a nonexistent column

> **FIXED (2026-07-08)** — the UPDATE no longer writes the nonexistent column; verified end-to-end.

- **What:** The UPDATE sets `updated_at = CURRENT_TIMESTAMP` on `users`, but the `users` table has no `updated_at` column (see schema + migrations in `backend/database.js`). better-sqlite3 throws → the global handler returns 500. Every "save profile" from `frontend/src/pages/Profile.jsx` fails.
- **Where:** `backend/routes/auth.js:333` (`router.put('/profile'…`).
- **Why it matters:** A user-facing feature is fully broken in production; also proof that this path has never been exercised by a test.
- **Fix (single task):** Remove `updated_at = CURRENT_TIMESTAMP,` from that UPDATE (or add the column via a try/catch ALTER in `database.js` like the other migrations). Verify by calling the endpoint.

## 4. Zero automated tests, no linter, no CI

> **PARTIALLY FIXED (2026-07-08)** — vitest added (`npm test` in `backend/`), 45 tests across `test/credits.test.js`, `test/stripeService.test.js` (ledger atomicity, tiering, affordability), `test/parsers.test.js` (streaming parser, SSRF guard). Still missing: linter, CI, webhook-handler tests, frontend tests.

- **What:** There is not a single test file, no test runner dependency, no eslint config, and no `.github/workflows`. The only scripts are `dev`/`build`/`start`.
- **Where:** Whole repo (`backend/package.json`, `frontend/package.json`).
- **Why it matters:** The most intricate logic in the app — the credit ledger (`stripeService.js`), affordability partitioning, webhook plan transitions, the streaming `extractPrefixedObjects` parser, slide merge/race logic — has zero regression protection. Bugs #1 and #3 in this list are exactly what tests would have caught.
- **Fix (single task, first increment):** Add `vitest` to `backend/`, plus one test file covering `config/credits.js` (`suggestPlanForCost`, `getEditTierThreshold`) and `stripeService.js` credit functions (`deductCredits`, `refundCredits`, `deductCreditsForEdit`, `computeAffordableSlides`) against an in-memory SQLite (`DB_PATH=:memory:` needs a small `initDatabase` tweak or a temp file). Add `"test": "vitest run"` script. Later increments: `extractPrefixedObjects` unit tests, webhook handler tests with fake events.

## 5. In-house analytics tracking is admin-gated — no user events are ever recorded

> **FIXED (2026-07-08)** — `POST /track` now registered before the admin guard with input size caps; all read/SSE analytics routes remain admin-only.

- **What:** `analytics.js` applies `router.use(requireAdmin)` to the **entire** router, including `POST /api/analytics/track`. The frontend fires `track()` on nearly every page (`frontend/src/utils/track.js`) with fire-and-forget `fetch`, so every non-admin call 401/403s silently. The `analytics_events` table and the entire `/analytics` dashboard (`AnalyticsDashboard.jsx`, 2700 lines) therefore only ever see the admin's own events.
- **Where:** `backend/routes/analytics.js:31` (`router.use(requireAdmin)`), routes below it.
- **Why it matters:** A large feature (custom analytics dashboard) is silently non-functional for its actual purpose; also wasted request volume from every visitor.
- **Fix (single task):** Move the admin guard off `/track`: register `router.post('/track', …)` **before** `router.use(requireAdmin)` (keep `optionalUserId` for attribution), leaving all read/SSE routes admin-only. Decide explicitly whether unauthenticated visitors may track (currently the frontend sends events without a token too).

## 6. Fire-and-forget generation has no crash recovery — stuck rows and lost credits on restart/deploy

> **FIXED (2026-07-08)** — `services/recovery.js` `sweepStaleWork()` runs at boot: stuck presentations get slides marked `error` with per-slide refunds and the row recovered; stuck design rows are errored and refunded (unblocking the parallel cap).

- **What:** `runFullFlow`, add-slides, and design batches run as detached promises. If the process restarts mid-run (Railway deploy, crash, OOM), presentations stay `processing`/`generating` forever (credits already deducted, no refund) and `design_generations` rows stay `pending`/`generating` forever. Stuck design rows also count against the 8-image parallel cap (`design.js` in-flight query), permanently blocking Design Mode for that user.
- **Where:** `backend/routes/presentations.js` (`runFullFlow` invocation ~line 279, add-slides IIFE), `backend/routes/design.js` (`runDesignBatch`), no recovery anywhere in `server.js`.
- **Why it matters:** Real users lose paid credits and get permanently wedged UI states; support burden.
- **Fix (single task):** Add a startup sweep in `server.js` (after `initDatabase()`): mark `presentations` stuck in `processing`/`generating` older than ~15 minutes as `error`, clear `adding_slides`, and mark `design_generations` stuck in `pending`/`generating` older than ~15 minutes as `error` with refunds via `refundCredits`. (A periodic `setInterval` version can follow.)

## 7. Base64 images inside SQLite JSON columns — scale ceiling and hot-path bloat

> **FIRST STEP DONE (2026-07-08)** — version images moved to a new `slide_versions` table (one-time boot migration guarded by `PRAGMA user_version`); slides now carry metadata stubs only, cutting row size up to ~10×. The full fix (all slide images out of the DB row into files/object storage) remains open and is the biggest remaining architectural task.

- **What:** Every slide image (~1–3 MB base64) is stored inline in `presentations.slides_data`, duplicated into `thumbnail`, `versions` (up to 10 old images **per slide**), and streamed repeatedly: SSE catch-up replays the entire deck's images on every reconnect; every slide mutation rewrites the whole multi-megabyte JSON array; `express.json({ limit: '50mb' })` exists to accommodate this.
- **Where:** `backend/database.js` (schema), `backend/routes/presentations.js` (`persistProgress`, catch-up replay in `/:id/events`, `pushSlideVersion`), `server.js:70`.
- **Why it matters:** A 10-slide deck with version history can exceed 100 MB in one row. SQLite copies the full value on each write; WAL grows fast; memory spikes; SSE reconnects re-transfer everything. This is the #1 architectural constraint on growth.
- **Fix (scoped first step, not the full migration):** Stop storing full-resolution images in `versions` — store versions in a new `slide_versions` table (`id, presentation_id, slide_index, image_data, instruction, created_at`) and keep only version IDs in `slides_data`. That alone cuts row size ~10×. The full fix (images on disk/object storage, URLs in DB) is a larger project — document before attempting.

## 8. Tokens leak into URLs

> **MOSTLY FIXED (2026-07-08)** — (a) OAuth tokens now redirect in the URL **fragment** and `AuthCallback.jsx` scrubs it via `replaceState`; (c) the admin dashboard prefers the `x-admin-token` header and strips `?token=` from the address bar. (b) SSE and the new thumbnail endpoint still use `?token=` (EventSource/`<img>` can't send headers) — bounded by the 15-min access-token lifetime; short-lived single-purpose tokens remain a possible follow-up.

- **What:** Three separate cases: (a) OAuth callback redirects to `/auth/callback?token=…&refresh=…` — access **and refresh** JWTs land in browser history, Vercel logs, and Referer headers; (b) all SSE endpoints authenticate via `?token=` (unavoidable-ish with EventSource, but the token then appears in Railway request logs); (c) the `/admin` dashboard authenticates with a static `ADMIN_TOKEN` query param.
- **Where:** `backend/routes/auth.js` (`redirectWithToken`), `presentations.js`/`design.js`/`analytics.js` SSE routes, `adminDashboard.js` (`requireAdminToken`).
- **Why it matters (severity: medium-high for (a)):** A leaked 7-day refresh token = full account takeover.
- **Fix (single task for the worst case):** Change `redirectWithToken` to redirect with tokens in the **URL fragment** (`/auth/callback#token=…&refresh=…`) — fragments never hit servers/logs/referrers — and update `frontend/src/pages/AuthCallback.jsx` to read `window.location.hash` instead of search params. SSE could later use short-lived (60s) single-purpose tokens minted by an authenticated endpoint.

## 9. Stripe SDK / API drift: `invoices.retrieveUpcoming` no longer exists

> **FIXED (2026-07-08)** — `invoices.createPreview` with a logged (not silent) failure path; the stale `apiVersion` pin is removed so the SDK default applies.

- **What:** `billing.js` calls `stripe.invoices.retrieveUpcoming(...)` inside `GET /subscription`. The installed SDK is `stripe@^22`, which removed `retrieveUpcoming` (replaced by `invoices.createPreview` around v18/basil). Calling `undefined` throws a synchronous TypeError, which the surrounding try/catch swallows — so `next_payment_date` is silently always `null` and the whole Stripe enrichment block may be skipped. The pinned `apiVersion: '2024-12-18.acacia'` in `stripeService.js` also predates the SDK's expected version.
- **Where:** `backend/routes/billing.js:73`, `backend/services/stripeService.js:12`.
- **Why it matters:** Billing UI shows incomplete info; the silent-catch pattern hides the breakage; version pinning mismatches invite subtle webhook shape differences.
- **Fix (single task):** Replace with `stripe.invoices.createPreview({ subscription: … })` (verify against the installed SDK's types), and align/remove the pinned `apiVersion`. Add a log line in the catch so future API drift isn't silent.

## 10. Unvalidated 50 MB blob into `users.profile_data` via `/api/auth/onboarding`

> **FIXED (2026-07-08)** — route now uses `authenticateToken` + `validate()` with the eight known onboarding fields (unknown fields stripped, 200-char caps).

- **What:** `POST /api/auth/onboarding` stringifies the **entire raw `req.body`** into the user row with no schema, no size cap (body limit is the global 50 MB), and hand-rolled JWT verification instead of `authenticateToken`.
- **Where:** `backend/routes/auth.js:259–271`.
- **Why it matters:** Any user can persist 50 MB of junk per account into the primary DB; also bypasses the `validate()` conventions used everywhere else.
- **Fix (single task):** Use `authenticateToken` + `validate({...})` with the actual onboarding fields (mirror the field list used by `PUT /profile`), and reject bodies over a few KB.

## 11. Concurrent `slides_data` writes are not transactional

> **VERIFIED — NOT A BUG (2026-07-08)** — better-sqlite3 is synchronous and every mutation site re-reads and writes with **no `await` in between**, so each read-modify-write block is atomic within the single-process deployment. The re-read-before-write pattern remains mandatory for the async gaps it was designed for. Revisit only if the app ever goes multi-process.

- **What:** Every slide mutation is read-JSON → modify → write-JSON in separate statements. The code mitigates with "re-read fresh right before writing" and status checks (extensively commented in retry/add-slides/regenerate), but two writes interleaving between read and write still lose one update — e.g. an edit completing during another slide's `persistProgress` merge window.
- **Where:** `backend/routes/presentations.js` — `persistProgress`, regenerate/retry/add-slides continuation blocks, `reorder`, `unlock-slides` merge.
- **Why it matters:** Rare, silent data loss ("my edit vanished"). The comments prove this class of bug has already bitten multiple times.
- **Fix (single task):** Wrap each read-modify-write in a `db.transaction(...)` (better-sqlite3 transactions are synchronous, and all these mutations are synchronous once the image data is in hand). Introduce a small helper `mutateSlides(presentationId, fn)` in `presentations.js` and route all seven-ish mutation sites through it.

## 12. ~700 lines of dead code in `claudeAgent.js` (and a legacy duplicate pipeline)

> **FIXED (2026-07-08)** — deleted `chat`, `streamChat`, `analyzePresentation`, `regenerateSlide`, `streamSlidePlan`, `mockRegenerateSlide`, `buildHistoryContent`, and their orphaned prompt constants (~40k chars). The legacy `runGeneration` pipeline is gone with the chat-flow removal (see #1). `claudeAgent.js` is now ~1,160 lines, all reachable.

- **What:** `chat()`, `analyzePresentation()` (non-streaming), `regenerateSlide()`, `streamSlidePlan()`, the giant `SYSTEM_PROMPT` const (only used by dead `chat`/`streamChat`? — `streamChat` IS used; `SYSTEM_PROMPT` stays), and `ANALYZE_PROMPT` const are exported but never imported by any route. `runGeneration()`/`POST /:id/generate` is a live-but-legacy duplicate of `runFullFlow` (serial, no credits — see #1). `SYSTEM_PROMPT_STREAM`/`MINIMALISTIC_SYSTEM_PROMPT_STREAM` back the unused `streamSlidePlan`.
- **Where:** `backend/services/claudeAgent.js` lines ~451–504 (`chat`), ~637–692 (`analyzePresentation`), ~781–858 (`regenerateSlide`), ~1351–1573 (`SYSTEM_PROMPT_STREAM`, `streamSlidePlan`).
- **Why it matters:** Confuses every future change ("which chat function is real?"), inflates prompt-maintenance surface, and dead prompts drift from live ones.
- **Fix (single task):** Delete `chat`, `analyzePresentation`, `regenerateSlide`, `streamSlidePlan` and their orphaned prompt consts after `grep -rn` confirms no imports. Do **not** touch `streamChat`, `analyzePresentationStream`, `generateCompactPlan`, `streamSlidePrompts`, `generateSingleSlidePrompt`, `generateSingleNewSlide`, `streamNewSlides`, `suggestTitle`.

## 13. Free-credit constants disagree in four places

> **FIXED (2026-07-08)** — schema defaults set to 0 with a pointer comment, `topup-free-users.js` imports `PLAN_CREDITS`, README corrected.

- **What:** Schema default `credits_remaining INTEGER DEFAULT 5` (`database.js`), real allocation `PLAN_CREDITS.free = 54` (`config/credits.js`), top-up script targets 15 (`scripts/topup-free-users.js`), and README implies 5 free decks. Only `PLAN_CREDITS.free` matters (rows are created by `getOrCreateSubscription`), the rest are traps.
- **Where:** `backend/database.js:77–78`, `backend/config/credits.js:38`, `backend/scripts/topup-free-users.js:11`.
- **Why it matters:** A future change to the schema-default path (or anyone reading the schema) gets the wrong number.
- **Fix (single task):** Change the schema defaults to comment-documented `0` (or remove defaults), have `topup-free-users.js` import `PLAN_CREDITS`, and fix the README.

## 14. Missing indexes on the hottest foreign keys

> **FIXED (2026-07-08)** — all four indexes added in `initDatabase()`.

- **What:** No index on `presentations(user_id)`, `messages(presentation_id)`, `credit_transactions(user_id)`, `feedback(user_id)`. Every dashboard load, message fetch, and ledger read is a full table scan. (Indexes exist for `app_logs`, `design_generations`, `analytics_events` — the pattern was known, just not applied to the core tables.)
- **Where:** `backend/database.js`.
- **Why it matters:** With base64 blobs in `presentations` rows (#7), scans are extra expensive.
- **Fix (single task):** Add `CREATE INDEX IF NOT EXISTS` statements for those four columns in `initDatabase()`.

## 15. `GET /api/presentations` returns full base64 thumbnails for every deck, uncapped

> **FIXED (2026-07-08)** — list/SSE payloads carry `has_thumbnail`; images served by new `GET /:id/thumbnail` (JWT via `?token=`, `Cache-Control: private`); `Dashboard.jsx` updated.

- **What:** The list endpoint (and the dashboard SSE snapshot) selects `thumbnail` for all of a user's presentations with no pagination — for a power user that's dozens of MB per dashboard load, re-sent on every SSE reconnect.
- **Where:** `backend/routes/presentations.js:138–152` and `dashboard-events` ~line 167; `broadcastDashboardUpdate` also ships the thumbnail per event.
- **Why it matters:** Dashboard latency, memory, mobile data. Compounds #7.
- **Fix (single task):** Add a dedicated `GET /:id/thumbnail` endpoint (returns the image with cache headers) and replace `thumbnail` in list/SSE payloads with a boolean `has_thumbnail` + versioned URL; update `Dashboard.jsx` to use `<img src>`.

## 16. Admin monitor: static token + fully relaxed CSP

> **FIXED (2026-07-08)** — `timingSafeEqual` comparison, `x-admin-token` header preferred, `?token=` stripped via `history.replaceState`, 30-req/15-min rate limit on the router.

- **What:** `/admin` uses a constant `ADMIN_TOKEN` compared with `!==` (not constant-time; no rate limit on guesses) passed via query string, and `server.js` sets `unsafe-inline` + `unsafe-eval` CSP for it. It also exposes DB row counts and traces.
- **Where:** `backend/routes/adminDashboard.js:8–16`, `backend/server.js:109–118`.
- **Why it matters (severity: medium):** If `ADMIN_TOKEN` leaks via logs/history (it's a URL param), an attacker gets operational telemetry; XSS surface is wide open on that page.
- **Fix (single task):** Compare with `crypto.timingSafeEqual`, accept the token only via the `x-admin-token` header (keep the query param only for the initial page load and immediately strip via `history.replaceState` in the dashboard HTML), and add a small rate limit to the router.

## 17. Login user-enumeration and inconsistent auth responses

> **FIXED (2026-07-08)** — one identical 401 for unknown email and wrong password; the frontend's "no account — sign up instead" special case was removed with it.

- **What:** Login returns a distinct `USER_NOT_FOUND` code/message vs `Invalid credentials`, and register returns 409 `Email already in use` — both enumerate accounts. The code carefully does a constant-time bcrypt compare against a dummy hash (anti-timing) but then undoes the benefit in the response body.
- **Where:** `backend/routes/auth.js:244–251, 208–211`.
- **Why it matters (severity: low-medium):** Credential-stuffing recon. Possibly a deliberate UX choice — decide, don't drift.
- **Fix (single task):** Merge both login failure branches into a single message/code. For register, keep the 409 (unavoidable UX) but ensure `authLimiter` covers it (it does).

## 18. Duplicated logic drifting apart

> **MOSTLY FIXED (2026-07-08)** — shared `middleware/attachments.js`, `PLAN_RANK` derived from `PLAN_LADDER`, `previewEditCost` centralized in `stripeService.js`. Still open: SSE-registry unification and the duplicate `isAdmin` in `rateLimits.js` (different signature: checks `req.user.email`, no DB hit — left as-is deliberately).

- **What:**
  - `validateAttachment`/`validateAttachments` copy-pasted between `presentations.js` and `design.js` (different max counts, same body).
  - `PLAN_RANK` in `billing.js` duplicates the ordering already expressed by `PLAN_LADDER` in `config/credits.js`.
  - Admin checks exist twice: `isAdmin(userId)` in `stripeService.js` and a private `isAdmin(req)` re-parsing `ADMIN_EMAILS` in `rateLimits.js`.
  - `previewEditCost` in `presentations.js` re-implements the tier logic inside `deductCreditsForEdit`.
  - Two SSE registry implementations (`presentations.js` × 2 registries, `design.js` × 1) with identical broadcast/heartbeat/cleanup code.
- **Where:** as listed.
- **Why it matters:** Each pair can (and will) drift; `PLAN_RANK` vs `PLAN_LADDER` already encode plan ordering twice.
- **Fix (single task):** Extract `backend/middleware/attachments.js` (shared validators) and derive `PLAN_RANK` from `PLAN_LADDER` (`Object.fromEntries(PLAN_LADDER.map((p,i)=>[p,i]))`, plus the `ultra` alias). The SSE-registry unification is a separate, slightly larger task.

## 19. `checkout` validate schema rejects direct ultra-tier keys but PLANS has them

> **FIXED (2026-07-08)** — checkout accepts `ultra1..ultra4` directly ('ultra'+tier kept for compat) and a boot migration normalizes `plan='ultra'` rows to `ultra1`.

- **What:** `POST /billing/checkout` accepts `planKey ∈ {basic, pro, ultra}` only; `ultra1–4` must go through `planKey:'ultra'` + `ultraTier:0–3`. Meanwhile the legacy `'ultra'` alias maps to ultra1 in `PLANS`. Not broken today, but the plan-naming has three representations (ladder keys, checkout keys, slider indices).
- **Where:** `backend/routes/billing.js:106–123`, `backend/services/stripeService.js:40–49`.
- **Why it matters:** Easy to mis-wire a future plan change; the `'ultra'` legacy alias can silently mis-price DB rows that still carry `plan='ultra'`.
- **Fix (single task):** Accept `ultra1..ultra4` directly in the validator (keep `ultra`+tier for backward compat) and add a one-off migration normalizing `plan='ultra'` rows to `ultra1`.

## 20. Stale/rotting docs and dead config

> **FIXED (2026-07-08)** — `.env.example` now lists every env var the backend reads, README rewritten (stack table, mock mode, tests), `.vade-report` deleted, tracer comment corrected.

- **What:** README says Imagen 3 / Gemini 2.0, "JWT (7-day tokens)", and omits OpenAI/Stripe/Resend/PostHog env vars entirely; `backend/.env.example` is missing ~15 vars the code reads (`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID` ×12, `ADMIN_EMAILS`, `ADMIN_TOKEN`, `SESSION_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `META_APP_ID/SECRET`, `TIKTOK_CLIENT_KEY/SECRET`, `API_URL`, `DB_PATH`, `LOG_LEVEL`, `NODE_ENV`). `frontend/.vade-report` is a leftover tool artifact. `tracer.js` says "last 100 requests" but `MAX_REQUESTS = 500`.
- **Where:** `README.md`, `backend/.env.example`, `frontend/.vade-report`, `backend/services/tracer.js:1–3`.
- **Why it matters:** New devs configure the wrong things; missing env vars fail silently (Stripe/emails just don't work).
- **Fix (single task):** Rewrite `backend/.env.example` with every `process.env.*` referenced in the backend (grep for them), correct the README stack table, delete `.vade-report`.

## 21. Minor fragilities worth a line each

- **`suggestPlanForCost` compares monthly allocation to incremental need** — FIXED by documentation: the semantics are intentional and now stated in a comment in `config/credits.js`.
- **`clearStaleTestSubscriptions` on every boot** — FIXED: opt out with `STRIPE_CLEANUP_ON_BOOT=false`; stale IDs also self-heal lazily in `GET /billing/subscription`.
- **Webhook handler is synchronous per event but `invoice.paid` does an awaited Stripe fetch** — a Stripe outage delays webhook ack past its timeout, causing retries; acceptable now, note the idempotency of `applyCheckoutSession` makes retries safe.
- **`design.js` retry ignores the 8-parallel cap** — FIXED: retry now re-checks the in-flight count.
- **`express-session` default MemoryStore** is used for OAuth state — fine single-process, leaks slowly, breaks multi-instance (like the rate limiters, backoff store, and SSE registries — this app is single-instance by construction; scaling out requires externalizing all four).
- **Frontend watermark/plan checks are client-side only** (`pdfExport.js`) — free users can trivially export unwatermarked; accept or move export server-side.
- **`isPlaceholderImage` conflates mock mode with failure** — in mock mode every slide is an SVG placeholder, so mock generations mark slides as errors in `runFullFlow`'s check paths and issue refunds; harmless locally but makes mock-mode behavior diverge from real mode.
- **Accessibility debt** on the app UI (icon-only buttons without labels, <44px touch targets, color-only credit ring) — a full audit with file/line detail already exists in `.impeccable/audit/2026-06-04T22-08-16Z__frontend-src.md`; treat it as the backlog.
- **`analyzeLimiter` etc. key by `req.userId`** — set correctly because limiters run after `authenticateToken` in those routes, but the global `apiLimiter` in `server.js` runs pre-auth and silently falls back to IP keying; corporate-NAT users share a 200 req/15 min budget.
