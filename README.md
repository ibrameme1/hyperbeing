# HyperBeing — AI Presentation Maker

Describe your brief, answer a few smart preflight questions, then watch your slides generate in real time. Every slide is an AI-generated image.

## Setup

### 1. Environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add (see the example file for the full list — Stripe, OAuth, email, and admin settings are all optional and degrade silently):
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `GOOGLE_API_KEY` — from [aistudio.google.com](https://aistudio.google.com) (Gemini image generation access)
- `OPENAI_API_KEY` — for the "minimalistic" deck style and Design Mode
- `JWT_SECRET` — any long random string

Leaving the AI keys unset (or set to `demo`) runs everything in **mock mode** with canned plans and placeholder images — the intended way to develop locally.

### 2. Install dependencies

```bash
cd backend && npm install
cd ../frontend && npm install
```

### 3. Run

**Terminal 1 — backend:**
```bash
cd backend && npm run dev
```

**Terminal 2 — frontend:**
```bash
cd frontend && npm run dev
```

Open http://localhost:5173

### 4. Test

```bash
cd backend && npm test
```

## How it works

1. **Sign up / log in** — JWT auth (15-minute access tokens + 7-day refresh tokens), or Google/Meta/TikTok OAuth
2. **Describe your brief** on the dashboard — type, paste, drop images/logos, or pull in a URL
3. **Answer preflight questions** — Nova analyzes the brief (optionally with live web search) and asks 3–5 targeted multiple-choice questions
4. **Watch slides appear** — Claude streams the outline, then each slide's image generates in parallel and streams in over SSE
5. **Edit any slide** — describe changes in natural language; version history lets you restore earlier takes
6. **Add slides, reorder, delete** — the deck stays consistent with the established visual language
7. **Export** — PDF or PNGs, client-side

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, SQLite (better-sqlite3) |
| Auth | JWT (15-min access + 7-day refresh), Passport OAuth |
| AI planning agent | Anthropic Claude (`claude-sonnet-4-6`) |
| Image generation | Google Gemini (`gemini-3.1-flash-image-preview`, "Nano Banana") for classic decks; OpenAI `gpt-image-2` for minimalistic decks and Design Mode |
| Payments | Stripe subscriptions + credit ledger |
| PDF export | jsPDF (client-side) |
| Real-time | Server-Sent Events (SSE) |
| Tests | Vitest (`backend/test/`) |

See `PROJECT.md` for architecture, `GAPS.md` for the known-issues audit, and `CLAUDE.md` for working conventions.
