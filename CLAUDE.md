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

# Tests (backend only — vitest)
cd backend && npm test

# One-off scripts
node backend/scripts/topup-free-users.js
node backend/scripts/layered-benchmark.js briefs.json out/   # real timings/usage for layered slides
python3 scripts/generate_markdown_mirrors.py   # regenerates frontend/public/**/index.md
```

Backend tests live in `backend/test/` (credit ledger, streaming parser, SSRF guard, layered-slide layout/imaging) — run them before pushing backend changes. There is still **no linter and no CI** (GAPS #4). Beyond tests, verify by running the app; with no API keys set (or keys = `demo`) every AI service runs in **mock mode** with canned plans and SVG placeholder images — that's the intended way to exercise the pipeline locally (a mock deck generates 3 slides + 7 locked on the free plan; the "error" states + refunds are the documented placeholder quirk).

Env: copy `backend/.env.example` → `backend/.env` — it now lists every variable the backend reads. Missing keys degrade silently (Stripe/email/OAuth just don't work). DB file: `backend/data/hyperbeing.db` (gitignored).

## Conventions this codebase actually follows

- **ESM everywhere** (`import`/`export`, `"type": "module"`). No TypeScript. 2-space indent, single quotes.
- **Routes:** one file per domain in `backend/routes/`, `Router()` export default. Auth via `authenticateToken` middleware (sets `req.user`, `req.userId`). Input validation via `validate({field: isString(1,500)})` from `middleware/validate.js` for simple bodies, hand-rolled checks for complex ones (attachments).
- **Error style:** return `res.status(4xx).json({ error: 'human-friendly sentence' })` — user-facing copy, not codes. Machine-readable failures add `code: 'INSUFFICIENT_CREDITS' | 'TOKEN_LIMIT_EXCEEDED'` with HTTP 402. Never leak stack traces (global handler in `server.js` masks 5xx).
- **Logging:** `logger.info('short lowercase message', { contextObject })` from `services/logger.js` — never `console.log` in backend code. Request/user IDs are auto-attached via AsyncLocalStorage.
- **Long async work:** respond to HTTP immediately, run the job as a detached promise, communicate progress via SSE `broadcast()` + incremental DB writes. Follow the existing pattern in `presentations.js` exactly.
- **Money:** every credit change goes through `deductCredits`/`refundCredits`/`deductCreditsForEdit` in `stripeService.js` (atomic + ledger row). **Never hardcode credit amounts** — import from `config/credits.js`. Every deduction must have a matching refund on the failure path.
- **Frontend:** function components + hooks only; Tailwind utility classes inline (no CSS modules); Framer Motion for animation; lucide-react icons; API calls through `src/api/client.js` (the axios instance with token refresh) — never raw fetch except fire-and-forget `track()`. Pages in `src/pages/`, shared pieces in `src/components/`. Comments are used generously to explain *why* (especially race conditions) — keep that habit.

## Gotchas (things that look wrong but aren't, and vice versa)

- **Slides are LAYERED, not single images (since 2026-11).** Every new slide is a layout (`slides_data[].layout`): background + generated image elements + native text/shapes/charts/icons/logos. Pipeline: `designDeckSystem` (shared style block/fonts/palette, once per deck, saved in `slide_plan.design`) → per slide `buildLayeredSlide` (`services/layeredSlide.js`): Claude streams the layout (`designSlideLayout`, forced tool call) → `normalizeLayout` (`services/slideLayout.js` — ALWAYS normalize Claude layout output) → every image layer generated in parallel by OpenAI `gpt-image-2.5-flare` (`services/openaiImages.js`, priority queue) starting while the layout is still streaming → post-processing (`services/layerImaging.js`) → `fitLayout` text-fit checks → Claude visually reviews a rendered preview (`reviewSlideLayout`) → flattened preview stored as the slide's `image_file`/`image_data` (thumbnails, PDF, version history, legacy viewers). `buildLayeredSlide` returns **null on failure** (layout failed, or background/hero layer failed) → caller marks `error` + refunds; minor element failures are dropped into `layout.dropped`. Old flat decks still render from `image_data`; Gemini/NB2 (`editSlideImage`) remains only for natural-language edits of those legacy flat slides. The old `streamSlidePrompts`/`generateSlideImage` path is gone — don't reintroduce it.
- **Layer files**: every layer image is an `imageStore` file referenced from the layout (`layoutFiles(layout)` lists them) and served by `GET /:id/assets/:file` (JWT `?token=`, file must be referenced by that deck). Any delete/replace path must remove `slideFiles(slide)`; the orphan sweep counts layout files as referenced.
- **Layout coordinates** are canvas px (16:9 → 1920×1080), z-order = array order. Device layers with `screen` get a chroma-green screen that's detected and filled; their `in_screen` children are authored in 0-1 screen coords and become absolute (`screen_of`) once placed. Light effects (`role:'effect'`) are generated on black and "unscreened" to alpha.
- **PPTX export**: `GET /:id/export/pptx` → `services/pptxExport.js` (pptxgenjs). Layered slides export as native PowerPoint objects (text boxes with runs/fonts, one picture per image layer, native shapes, native charts, lucide icons as PNG, speaker notes); legacy flat slides as a full-slide picture; locked/error slides are skipped; free plan gets the watermark. Pictures are embedded at 1.5× display size (backgrounds JPEG, layers palette PNG) — ~2 s and a few MB per 10-slide deck.
- **Fonts**: a curated Google Fonts list (`slideLayout.FONTS`) — the backend bundles the TTFs (`@expo-google-fonts/*`) so previews and the fit checker use real metrics (`services/fonts.js`, imported by `layoutPreview.js`).
- **"Nano Banana" / "NB2" = Google Gemini image model** (`gemini-3.1-flash-image-preview`) — now only used to edit legacy flat slides. The README's "Imagen 3" is stale.
- **Image generators return an SVG placeholder instead of throwing on failure.** Always check `isPlaceholderImage(imageData)` after `generateSlideImage`/`editSlideImage`; treating a placeholder as success ships a blank slide and skips the credit refund.
- **Slide identity is the `index` property, NOT array position.** Indices are never reused after deletion; new slides get `max(index)+1`. Always `slides.find(s => s.index === n)`.
- **Before writing `slides_data` from any async continuation, re-read the row fresh** and check the slide's current `status` — if it's no longer `'generating'`, another actor won; discard your result and refund. This pattern appears (with explanatory comments) in retry, regenerate, and add-slides. Copy it; don't write back stale arrays.
- **A slide with `_edited: true` must never be overwritten** by pipeline progress merges (`persistProgress` respects this).
- **SSE event names are an API contract** with `PresentationPage.jsx` (`plan_started`, `plan_slide_streamed`, `slide_layout`, `slide_layer_ready`, `slide_ready`, `slide_error`, `slide_locked`, `slide_updated`, `slides_trimmed`, `partial_generation`, `complete`…). Changing/adding one requires touching both ends.
- **`PREFLIGHT ANSWERS:` is a magic string** — the Dashboard appends it to briefs and Nova's system prompts branch on it verbatim ("skip questions, generate now").
- **Claude streams `HEADER:{json}` / `SLIDE:{json}` lines** parsed by `extractPrefixedObjects` (bracket-counting). Prompt-format changes and parser changes must move together.
- **EventSource can't send headers** → SSE routes auth via `?token=` query param and `utils/sse.js` handles reconnection/refresh. Access tokens last 15 min (refresh 7 days) — don't assume long-lived tokens.
- **Mock mode** (keys unset/`demo`): layered slides use a canned layout (`layoutAgent.mockLayout`) and real mock PNG layers, so mock decks now COMPLETE with editable layered slides (no more error-slide quirk for new decks). Legacy flat-slide edits in mock mode still return SVG placeholders.
- **There is no chat flow.** Decks are created ONLY from the Dashboard prompt (`POST /api/presentations` → `runFullFlow`). The old in-presentation Nova chat (`POST /:id/messages`, `POST /:id/generate`, `runGeneration`, `ChatPhase`) was removed in 2026-07 — don't reintroduce it from old references. The `messages` table still stores the initial brief.
- **Slide images live on disk, not in the DB** (`services/imageStore.js`). Real raster images are written to `IMAGE_STORAGE_DIR` (persistent volume in prod) and `slides_data[].image_data` holds an authed URL (`/api/presentations/:id/slides/:i/image?f=…`) plus `image_file` (the filename). SVG placeholders stay inline as `data:` URLs (so `isPlaceholderImage`/mock mode still work). Use `storeSlideImage(presId, index, dataUrl)` when persisting a freshly generated image. Serve/consume via the frontend `mediaUrl()` helper (appends the token). Delete paths must `imageStore.remove()` orphaned files.
- **Slide version images also live on disk** in the `slide_versions` table via `image_file` (not base64); slides carry `{id, instruction, created_at}` stubs. `pushSlideVersion(db, presId, slideIndex, outgoingImageFile, instruction)` moves the outgoing FILE into history (reused, not re-encoded) and prunes+unlinks beyond 10.
- **Dashboard thumbnails are served by `GET /:id/thumbnail`** (JWT via `?token=`, like SSE); list/SSE payloads carry `has_thumbnail`, never base64.
- **OAuth callback tokens arrive in the URL fragment** (`#token=…`), not the query string — `AuthCallback.jsx` parses `location.hash`.
- **The `users` table has no `updated_at` column** — don't write one (this broke profile saves once already).
- Frontend env: empty `VITE_API_URL` = use dev proxy; set it to the Railway URL in production builds.

## Rules

- **Never change `config/credits.js` values or ledger semantics casually** — it's real money. Keep deduct/refund symmetry. `backend/test/stripeService.test.js` guards the basics — run it.
- **User-supplied URLs fetched server-side must go through `assertPublicUrl`** (`services/urlGuard.js`) — SSRF guard; follow redirects manually and re-validate each hop (see `fetch-url` in presentations.js).
- **Schema changes are append-only**: add columns via the try/catch `ALTER TABLE` pattern in `database.js` `initDatabase()`; never rename, retype, or drop. Migrations run on every boot and must be idempotent.
- **Generated files — never hand-edit:** `frontend/public/**/index.md` (markdown mirrors; regenerate via `scripts/generate_markdown_mirrors.py`, auto-run by `.githooks/pre-commit`). Keep `frontend/public/llms.txt` and `sitemap.xml` in sync when adding public routes.
- **The giant prompt blocks in `claudeAgent.js`, `backend/prompts/*.md`, and `minimalisticExamples.js` are product behavior.** Edit them like code: smallest possible diff, and check every consumer of the output format (`extractPrefixedObjects`, the `\n---\n` chat separator, the 5-layer prompt structure).
- **Stripe webhook route must keep `express.raw` body** (mounted before `express.json` in `server.js`) — moving middleware order breaks signature verification.
- **All Claude output goes through `sanitizeText`/`sanitizeDeep`** (strips em/en dashes) — preserve this on any new AI call, and record token usage via `recordTokenUsage(userId, …)` + `checkTokenBudget(userId)` before the call.
- **Model IDs in use:** Claude `claude-sonnet-4-6`; OpenAI `gpt-image-2.5-flare` for every slide layer (`OPENAI_LAYER_IMAGE_MODEL`; quality: backgrounds medium, objects high — `OPENAI_LAYER_QUALITY_BACKGROUND`/`_OBJECTS`); OpenAI `gpt-image-2` for Design Mode (`OPENAI_IMAGE_MODEL`); Gemini `gemini-3.1-flash-image-preview` for legacy flat-slide edits. Don't "upgrade" them as a drive-by.
- Assume **single-process deployment**: SSE registries, rate limiters, auth backoff, metrics/tracer are all in-memory. Anything multi-instance requires externalizing those first.
