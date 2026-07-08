# CLAUDE.md

HyperBeing — AI presentation maker. Slides are AI-generated **images** (not structured docs). React/Vite SPA (`frontend/`, deploys to Vercel) + Express/SQLite API (`backend/`, deploys to Railway).

- **Architecture, data flow, and design decisions:** read `PROJECT.md` (start with "The core generation pipeline").
- **Known bugs, tech debt, and security issues with scoped fixes:** read `GAPS.md` before assuming something is intended behavior.
- **Product voice & design principles:** `PRODUCT.md` (no purple-gradient "AI slop", WCAG AA, output quality is the pitch).

## Commands

```bash
# Backend (from backend/) — Node 20+, ESM
npm install
npm run dev            # nodemon + Sentry instrument, port 3001
npm start              # production start

# Frontend (from frontend/)
npm install
npm run dev            # Vite on 5173, proxies /api → localhost:3001
npm run build          # production build (Sentry plugin needs SENTRY_* or warns)

# Both at once (repo root)
./start.sh

# One-off scripts
node backend/scripts/topup-free-users.js
python3 scripts/generate_markdown_mirrors.py   # regenerates frontend/public/**/index.md
```

There are **no tests and no linter** (see GAPS #4). Verify changes by running the app; with no API keys set (or keys = `demo`) every AI service runs in **mock mode** with canned plans and SVG placeholder images — that's the intended way to exercise the pipeline locally.

Env: copy `backend/.env.example` → `backend/.env`. The example file is incomplete — the code also reads `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_*_PRICE_ID`, `ADMIN_EMAILS`, `ADMIN_TOKEN`, `SESSION_SECRET`, OAuth client ids/secrets, `API_URL`, `DB_PATH`, `LOG_LEVEL`. Missing keys degrade silently (Stripe/email/OAuth just don't work). DB file: `backend/data/hyperbeing.db` (gitignored).

## Conventions this codebase actually follows

- **ESM everywhere** (`import`/`export`, `"type": "module"`). No TypeScript. 2-space indent, single quotes.
- **Routes:** one file per domain in `backend/routes/`, `Router()` export default. Auth via `authenticateToken` middleware (sets `req.user`, `req.userId`). Input validation via `validate({field: isString(1,500)})` from `middleware/validate.js` for simple bodies, hand-rolled checks for complex ones (attachments).
- **Error style:** return `res.status(4xx).json({ error: 'human-friendly sentence' })` — user-facing copy, not codes. Machine-readable failures add `code: 'INSUFFICIENT_CREDITS' | 'TOKEN_LIMIT_EXCEEDED'` with HTTP 402. Never leak stack traces (global handler in `server.js` masks 5xx).
- **Logging:** `logger.info('short lowercase message', { contextObject })` from `services/logger.js` — never `console.log` in backend code. Request/user IDs are auto-attached via AsyncLocalStorage.
- **Long async work:** respond to HTTP immediately, run the job as a detached promise, communicate progress via SSE `broadcast()` + incremental DB writes. Follow the existing pattern in `presentations.js` exactly.
- **Money:** every credit change goes through `deductCredits`/`refundCredits`/`deductCreditsForEdit` in `stripeService.js` (atomic + ledger row). **Never hardcode credit amounts** — import from `config/credits.js`. Every deduction must have a matching refund on the failure path.
- **Frontend:** function components + hooks only; Tailwind utility classes inline (no CSS modules); Framer Motion for animation; lucide-react icons; API calls through `src/api/client.js` (the axios instance with token refresh) — never raw fetch except fire-and-forget `track()`. Pages in `src/pages/`, shared pieces in `src/components/`. Comments are used generously to explain *why* (especially race conditions) — keep that habit.

## Gotchas (things that look wrong but aren't, and vice versa)

- **"Nano Banana" / "NB2" = Google Gemini image model** (`gemini-3.1-flash-image-preview`). `style === 'minimalistic'` decks render via OpenAI `gpt-image-2` instead. The README's "Imagen 3" is stale.
- **Image generators return an SVG placeholder instead of throwing on failure.** Always check `isPlaceholderImage(imageData)` after `generateSlideImage`/`editSlideImage`; treating a placeholder as success ships a blank slide and skips the credit refund.
- **Slide identity is the `index` property, NOT array position.** Indices are never reused after deletion; new slides get `max(index)+1`. Always `slides.find(s => s.index === n)`.
- **Before writing `slides_data` from any async continuation, re-read the row fresh** and check the slide's current `status` — if it's no longer `'generating'`, another actor won; discard your result and refund. This pattern appears (with explanatory comments) in retry, regenerate, and add-slides. Copy it; don't write back stale arrays.
- **A slide with `_edited: true` must never be overwritten** by pipeline progress merges (`persistProgress` respects this).
- **SSE event names are an API contract** with `PresentationPage.jsx` (`plan_started`, `plan_slide_streamed`, `slide_ready`, `slide_error`, `slide_locked`, `slide_updated`, `slides_trimmed`, `partial_generation`, `complete`…). Changing/adding one requires touching both ends.
- **`PREFLIGHT ANSWERS:` is a magic string** — the Dashboard appends it to briefs and Nova's system prompts branch on it verbatim ("skip questions, generate now").
- **Claude streams `HEADER:{json}` / `SLIDE:{json}` lines** parsed by `extractPrefixedObjects` (bracket-counting). Prompt-format changes and parser changes must move together.
- **EventSource can't send headers** → SSE routes auth via `?token=` query param and `utils/sse.js` handles reconnection/refresh. Access tokens last 15 min (refresh 7 days) — don't assume long-lived tokens.
- **Mock mode makes every image an SVG placeholder**, which the error-detection paths then flag — mock generations showing "error" slides with refunds is a known quirk, not your bug.
- **`POST /:id/generate` (chat-flow path) is legacy** — serial pipeline, currently charges no credits (GAPS #1). The real pipeline is `runFullFlow` behind `POST /api/presentations`.
- **`PUT /api/auth/profile` is currently broken** (writes nonexistent `users.updated_at` — GAPS #3).
- Frontend env: empty `VITE_API_URL` = use dev proxy; set it to the Railway URL in production builds.

## Rules

- **Never change `config/credits.js` values or ledger semantics casually** — it's real money. Keep deduct/refund symmetry.
- **Schema changes are append-only**: add columns via the try/catch `ALTER TABLE` pattern in `database.js` `initDatabase()`; never rename, retype, or drop. Migrations run on every boot and must be idempotent.
- **Generated files — never hand-edit:** `frontend/public/**/index.md` (markdown mirrors; regenerate via `scripts/generate_markdown_mirrors.py`, auto-run by `.githooks/pre-commit`). Keep `frontend/public/llms.txt` and `sitemap.xml` in sync when adding public routes.
- **The giant prompt blocks in `claudeAgent.js`, `backend/prompts/*.md`, and `minimalisticExamples.js` are product behavior.** Edit them like code: smallest possible diff, and check every consumer of the output format (`extractPrefixedObjects`, the `\n---\n` chat separator, the 5-layer prompt structure).
- **Stripe webhook route must keep `express.raw` body** (mounted before `express.json` in `server.js`) — moving middleware order breaks signature verification.
- **All Claude output goes through `sanitizeText`/`sanitizeDeep`** (strips em/en dashes) — preserve this on any new AI call, and record token usage via `recordTokenUsage(userId, …)` + `checkTokenBudget(userId)` before the call.
- **Model IDs in use:** Claude `claude-sonnet-4-6`, Gemini `gemini-3.1-flash-image-preview`, OpenAI `gpt-image-2` (env-overridable). Don't "upgrade" them as a drive-by.
- Assume **single-process deployment**: SSE registries, rate limiters, auth backoff, metrics/tracer are all in-memory. Anything multi-instance requires externalizing those first.
