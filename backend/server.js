import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import presentationRoutes from './routes/presentations.js';
import promptChatRoutes from './routes/promptChat.js';
import { apiLimiter } from './middleware/rateLimiter.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Startup environment validation ──────────────────────────────────────────
// Fail fast so a misconfigured deployment is immediately obvious rather than
// silently using empty/default secrets (OWASP A02: Cryptographic Failures).
const REQUIRED_ENV = ['JWT_SECRET'];
const missingEnv = REQUIRED_ENV.filter(k => !process.env[k]);
if (missingEnv.length > 0) {
  console.error(`FATAL: Missing required environment variables: ${missingEnv.join(', ')}`);
  process.exit(1);
}
if ((process.env.JWT_SECRET ?? '').length < 32) {
  console.warn('WARNING: JWT_SECRET is shorter than 32 characters — use a cryptographically random value in production.');
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.warn('WARNING: ANTHROPIC_API_KEY not set — running in mock mode.');
}
if (!process.env.GOOGLE_API_KEY) {
  console.warn('WARNING: GOOGLE_API_KEY not set — running in mock mode for image generation.');
}

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Security headers (OWASP A05: Security Misconfiguration) ─────────────────
// helmet sets X-Content-Type-Options, X-Frame-Options, Strict-Transport-Security, etc.
// CSP is disabled here because the API is consumed by a separate React SPA — the SPA's
// own server is responsible for its CSP. Re-enable and tighten if the API ever serves HTML.
app.use(helmet({ contentSecurityPolicy: false }));

// ─── CORS ─────────────────────────────────────────────────────────────────────
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:5173',
  credentials: true,
}));

// ─── Body parsing ─────────────────────────────────────────────────────────────
// 50 MB cap supports the heaviest legitimate payload: ~3 reference images at 10 MB each
// (base64 adds ~33% overhead). Per-attachment size enforcement is in validation middleware.
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ─── Global rate limit ────────────────────────────────────────────────────────
// Blanket 300 req/15 min per IP on all /api/* routes.
// Individual routers layer tighter limits where needed (auth, AI generation).
app.use('/api/', apiLimiter);

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationRoutes);
app.use('/api/prompt-chat', promptChatRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// ─── Global error handler ─────────────────────────────────────────────────────
// Must have 4 parameters for Express to recognise it as an error handler.
// Returns a safe, generic message in production so stack traces stay server-side.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, _next) => {
  console.error('Unhandled error:', err);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(err.status || 500).json({
    error: isDev ? err.message : 'An unexpected error occurred',
  });
});

initDatabase();
app.listen(PORT, () => {
  console.log(`HyperBeing API running on http://localhost:${PORT}`);
});
