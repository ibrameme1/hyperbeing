import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

function handler(res, options) {
  res.status(429).json({
    error: 'Too many requests',
    retryAfter: Math.ceil(options.windowMs / 1000 / 60),
  });
}

// 10 attempts per 15 min — login & register (brute-force protection)
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

// 10 presentations per hour per IP (AI generation is expensive)
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
