import 'dotenv/config';
import * as Sentry from '@sentry/node';
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
import userRoutes from './routes/user.js';
import { apiLimiter } from './middleware/rateLimits.js';
import analyticsRoutes from './routes/analytics.js';
import adminRoutes from './routes/admin.js';
import adminDashboardRouter from './routes/adminDashboard.js';
import feedbackRoutes from './routes/feedback.js';
import designRoutes from './routes/design.js';
import { requestLogger } from './middleware/requestLogger.js';
import { logger } from './services/logger.js';
import { getPostHog } from './services/posthogClient.js';
import { clearStaleTestSubscriptions } from './services/stripeService.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

// Trust reverse proxy (Railway/Vercel) so req.ip reflects the real client IP
app.set('trust proxy', 1);

// Security headers (HSTS, X-Frame-Options, CSP, etc.)
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // allow image CDN assets
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'none'"],      // pure JSON API — no resources should load from here
      frameAncestors: ["'none'"],  // prevent embedding this API origin in iframes
    },
  },
  hsts: {
    maxAge: 63072000, // 2 years
    includeSubDomains: true,
    preload: true,
  },
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

// Structured request logging + trace IDs (before auth so every request is covered)
app.use(requestLogger);

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
app.use('/api/user', userRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/design', designRoutes);

// Admin monitoring dashboard — permissive CSP so vis.js CDN and inline scripts load
app.use('/admin', (req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.jsdelivr.net; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data:; " +
    "connect-src 'self';"
  );
  next();
}, adminDashboardRouter);

app.get('/api/health', (_, res) => res.json({ status: 'ok', uptime: process.uptime() }));

// Sentry must catch errors before the global handler so it can capture them
Sentry.setupExpressErrorHandler(app);

// Global error handler — never leak stack traces or internal messages to clients
app.use((err, req, res, next) => {
  const status = err.status || err.statusCode || 500;
  if (status >= 500) {
    logger.error('unhandled exception', {
      errorMessage: err.message,
      errorName: err.name,
      stack: err.stack?.split('\n').slice(0, 8).join('\n'),
      requestId: req.requestId,
    });
    const ph = getPostHog();
    if (ph) {
      const distinctId = req.user?.id ? String(req.user.id) : req.ip || 'anonymous';
      ph.capture({
        distinctId,
        event: 'server_error',
        properties: {
          error_message: err.message,
          error_name: err.name,
          path: req.path,
          method: req.method,
          status,
          request_id: req.requestId,
        },
      });
    }
  }
  res.status(status).json({
    error: status >= 500 ? 'Internal server error' : (err.message || 'Request failed'),
  });
});

process.on('SIGTERM', async () => {
  const ph = getPostHog();
  if (ph) await ph.shutdown();
  process.exit(0);
});

// Catch unhandled promise rejections so a single bad Stripe/API call can't
// take down the whole process. Log it and keep running.
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled promise rejection', {
    errorMessage: reason?.message || String(reason),
    errorName: reason?.name,
    stack: reason?.stack?.split('\n').slice(0, 8).join('\n'),
  });
});

initDatabase();
clearStaleTestSubscriptions().catch(() => {}); // best-effort cleanup on startup
app.listen(PORT, '0.0.0.0', () => {
  logger.info('server started', { port: PORT, env: process.env.NODE_ENV || 'development' });
});
