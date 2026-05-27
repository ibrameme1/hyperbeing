import rateLimit from 'express-rate-limit';

// Standardized 429 response body — includes retryAfter in minutes so clients can back off
function rateLimitHandler(req, res, _next, options) {
  res.status(429).json({
    error: 'Too many requests. Please try again later.',
    retryAfter: Math.ceil(options.windowMs / 60_000), // convert ms → minutes
  });
}

/**
 * OWASP A07 — Authentication failures:
 * Strict per-IP limit on auth endpoints prevents brute-force and credential stuffing.
 * 10 attempts per 15 minutes per IP address.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,  // emit RateLimit-* headers (RFC draft-7)
  legacyHeaders: false,   // suppress deprecated X-RateLimit-* headers
  handler: rateLimitHandler,
});

/**
 * Global API safety net — IP-based blanket protection applied to all /api/* routes.
 * Prevents automated scraping and protects unauthenticated endpoints.
 * 300 requests per 15 minutes per IP.
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  handler: rateLimitHandler,
});

/**
 * Heavy operation limiter for AI/image generation endpoints.
 * Keyed by authenticated user ID so VPN/IP rotation cannot bypass per-account quota.
 * Falls back to IP for unauthenticated paths (should not happen in practice).
 * 20 generation requests per hour per user.
 */
export const heavyLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // req.user is always set here because heavyLimiter is applied after authenticateToken
  keyGenerator: (req) => req.user?.id ?? req.ip,
  handler: rateLimitHandler,
});
