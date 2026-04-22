# HyperBeing — AI Presentation Maker

iPhone-inspired AI presentation maker. Describe your brief, let the AI ask smart questions, then watch your slides generate in real time.

## Setup

### 1. Environment variables

```bash
cp backend/.env.example backend/.env
```

Edit `backend/.env` and add:
- `ANTHROPIC_API_KEY` — from [console.anthropic.com](https://console.anthropic.com)
- `GOOGLE_API_KEY` — from [aistudio.google.com](https://aistudio.google.com) (needs Imagen 3 / Gemini 2.0 access)
- `JWT_SECRET` — any long random string

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

## How it works

1. **Sign up / log in** — JWT-based auth
2. **Describe your brief** — type, paste, or drop images/logos
3. **Chat with Nova** — the AI agent asks clarifying questions about audience, tone, key messages, etc.
4. **Generate** — once Nova has enough detail, click "Generate Presentation"
5. **Watch slides appear** — each slide streams in as images are generated via Google Imagen 3
6. **Edit any slide** — tap a slide, describe changes, Nova regenerates just that slide
7. **Export PDF** — download the full deck as a PDF

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, Framer Motion |
| Backend | Node.js, Express, SQLite (better-sqlite3) |
| Auth | JWT (7-day tokens) |
| AI Agent | Anthropic Claude (claude-sonnet-4-6) |
| Image Generation | Google Imagen 3 / Gemini 2.0 Flash |
| PDF Export | html2canvas + jsPDF (client-side) |
| Real-time | Server-Sent Events (SSE) |
