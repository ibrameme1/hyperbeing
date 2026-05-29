import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function handler(res, options) {
  res.status(429).json({
    error: 'Too many requests',
    retryAfter: Math.ceil(options.windowMs / 1000 / 60),
  });
}

// ── Exponential backoff for auth endpoints ────────────────────────────────────
// Tracks failed attempts per IP. On success, caller must invoke req.clearAuthBackoff().
// Delays: 0, 0, 1s, 2s, 4s, 8s, 16s, 32s, …  (cap: 5 min)
const backoffStore = new Map();
const BACKOFF_TTL_MS = 15 * 60 * 1000; // entries expire after 15 min of inactivity

function getBackoffKey(req) {
  return ipKeyGenerator(req);
}

export function authBackoff(req, res, next) {
  const key = getBackoffKey(req);
  const entry = backoffStore.get(key);
  if (entry && entry.blockedUntil > Date.now()) {
    const retryAfter = Math.ceil((entry.blockedUntil - Date.now()) / 1000);
    res.setHeader('Retry-After', retryAfter);
    return res.status(429).json({
      error: 'Too many failed attempts. Please wait before trying again.',
      retryAfter,
    });
  }
  // Attach helpers so the route can record outcomes
  req.recordAuthFailure = () => {
    const existing = backoffStore.get(key);
    const failures = (existing?.failures ?? 0) + 1;
    // First 2 failures: no delay. Afterwards: 2^(n-2) seconds, capped at 5 min.
    const delayMs = failures > 2 ? Math.min(Math.pow(2, failures - 2) * 1000, 5 * 60 * 1000) : 0;
    backoffStore.set(key, { failures, blockedUntil: Date.now() + delayMs, lastSeen: Date.now() });
  };
  req.clearAuthBackoff = () => backoffStore.delete(key);
  next();
}

// Periodically evict stale entries to prevent unbounded memory growth
setInterval(() => {
  const cutoff = Date.now() - BACKOFF_TTL_MS;
  for (const [k, v] of backoffStore) {
    if (v.lastSeen < cutoff) backoffStore.delete(k);
  }
}, 5 * 60 * 1000);

// ── Hard rate limits ──────────────────────────────────────────────────────────

// 10 attempts per 15 min — login & register (absolute cap)
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => handler(res, options),
  message: 'Too many auth attempts. Try again in 15 minutes.',
  skip: (req) => isAdmin(req),
});

// 5 per 15 min — login specifically (tighter brute-force window)
export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => handler(res, options),
});

// 10 presentations per hour per user/IP (AI generation is expensive)
export const createPresentationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req),
  handler: (req, res, next, options) => handler(res, options),
});

// 20 add-slides per hour per user
export const addSlidesLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req),
  handler: (req, res, next, options) => handler(res, options),
});

// 30 analyze calls per hour (pre-flight AI call)
export const analyzeLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req),
  handler: (req, res, next, options) => handler(res, options),
});

// 10 checkout sessions per hour per IP (prevent Stripe abuse)
export const billingLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res, next, options) => handler(res, options),
});

// 200 requests per 15 min — general authenticated API
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => req.userId || ipKeyGenerator(req),
  handler: (req, res, next, options) => handler(res, options),
});

// Helper — admin users bypass AI generation limits
function isAdmin(req) {
  const adminEmails = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim().toLowerCase());
  return req.user && adminEmails.includes(req.user.email?.toLowerCase());
}
