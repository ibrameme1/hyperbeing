import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import session from 'express-session';
import passport from 'passport';
import helmet from 'helmet';
import path from 'path';
import { fileURLToPath } from 'url';
import { initDatabase } from './database.js';
import authRoutes from './routes/auth.js';
import presentationRoutes from './routes/presentations.js';
import promptChatRoutes from './routes/promptChat.js';
import billingRoutes from './routes/billing.js';
import { apiLimiter } from './middleware/rateLimits.js';
import analyticsRoutes from './routes/analytics.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Railway/Vercel) so req.ip reflects the real client IP
app.set('trust proxy', 1);

// Security headers (HSTS, X-Frame-Options, CSP, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image CDN assets
  contentSecurityPolicy: false, // frontend handles its own CSP via Vite
}));

const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, health checks)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Raw body must be captured BEFORE json() for Stripe signature verification
app.use('/api/billing/webhook', express.raw({ type: 'application/json' }));

// 50mb to accommodate base64 images in slide payloads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Short-lived session for OAuth state only (not used for app auth — we use JWT)
const sessionSecret = process.env.SESSION_SECRET || process.env.JWT_SECRET;
if (!sessionSecret || sessionSecret === 'change-this-to-a-long-random-secret-in-production') {
  console.warn('⚠️  WARNING: SESSION_SECRET is not set or using default. Set a strong secret in production.');
}
app.use(session({
  secret: sessionSecret || 'dev-session-secret-DO-NOT-USE-IN-PROD',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,    // prevent XSS access to session cookie
    sameSite: 'lax',   // CSRF protection
    maxAge: 5 * 60 * 1000, // 5 min — only needed for OAuth redirect flow
  },
}));
app.use(passport.initialize());
app.use(passport.session());

// Apply general API rate limit to all /api routes except webhook
app.use('/api', (req, res, next) => {
  if (req.path === '/billing/webhook') return next();
  return apiLimiter(req, res, next);
});

app.use('/api/auth', authRoutes);
app.use('/api/presentations', presentationRoutes);
app.use('/api/prompt-chat', promptChatRoutes);
app.use('/api/billing', billingRoutes);
app.use('/api/analytics', analyticsRoutes);

app.get('/api/health', (_, res) => res.json({ status: 'ok' }));

// Global error handler — never leak stack traces or internal messages to clients
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    console.error('Unhandled error:', err);
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
  });
});

initDatabase();
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 HyperBeing API running on http://localhost:${PORT}`);
});
