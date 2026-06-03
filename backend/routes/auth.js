import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import passport from 'passport';
import { logger } from '../services/logger.js';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import axios from 'axios';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { sendWelcomeEmail, sendAccountDeleted } from '../services/emailService.js';
import { validate, isString, isEmail, isOptionalString } from '../middleware/validate.js';
import { authLimiter, loginLimiter, authBackoff } from '../middleware/rateLimits.js';

const router = Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '15m' });
}

function signRefreshToken(userId) {
  return jwt.sign({ userId, type: 'refresh' }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function redirectWithToken(res, userId, isNew = false) {
  const token = signToken(userId);
  const refreshToken = signRefreshToken(userId);
  res.redirect(`${frontendUrl()}/auth/callback?token=${token}&refresh=${refreshToken}&new=${isNew}`);
}

// ── Passport: Google ─────────────────────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID) {
  passport.use(new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/google/callback`,
    },
    (_accessToken, _refreshToken, profile, done) => done(null, { provider: 'google', profile }),
  ));
}

// ── Passport: Meta/Instagram ─────────────────────────────────────────────────
if (process.env.META_APP_ID) {
  passport.use(new FacebookStrategy(
    {
      clientID: process.env.META_APP_ID,
      clientSecret: process.env.META_APP_SECRET,
      callbackURL: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/meta/callback`,
      profileFields: ['id', 'displayName', 'email', 'photos'],
    },
    (_accessToken, _refreshToken, profile, done) => done(null, { provider: 'meta', profile }),
  ));
}

passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Whitelist mapping — prevents SQL injection from provider string in column names
const PROVIDER_COL = { google: 'google_id', meta: 'meta_id', tiktok: 'tiktok_id' };

// ── Helper: upsert OAuth user ─────────────────────────────────────────────────
function upsertOAuthUser({ provider, providerId, name, email, avatar }) {
  const col = PROVIDER_COL[provider];
  if (!col) throw new Error(`Unknown OAuth provider: ${provider}`);

  const db = getDb();

  let user = db.prepare(`SELECT id, name, email FROM users WHERE ${col} = ?`).get(providerId);
  if (user) return { user, isNew: false };

  if (email) {
    const existing = db.prepare('SELECT id, name, email FROM users WHERE email = ?').get(email);
    if (existing) {
      db.prepare(`UPDATE users SET ${col} = ?, avatar = ? WHERE id = ?`).run(providerId, avatar, existing.id);
      return { user: existing, isNew: false };
    }
  }

  const id = uuid();
  db.prepare(
    `INSERT INTO users (id, name, email, ${col}, avatar) VALUES (?, ?, ?, ?, ?)`
  ).run(id, name || 'User', email || null, providerId, avatar || null);

  return { user: { id, name: name || 'User', email }, isNew: true };
}

// ── Google OAuth ──────────────────────────────────────────────────────────────
router.get('/google',
  passport.authenticate('google', { scope: ['profile', 'email'], session: true }),
);

router.get('/google/callback',
  passport.authenticate('google', { failureRedirect: `${frontendUrl()}/login?error=oauth`, session: true }),
  (req, res) => {
    const { profile } = req.user;
    const { user, isNew } = upsertOAuthUser({
      provider: 'google',
      providerId: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value,
      avatar: profile.photos?.[0]?.value,
    });
    if (isNew && user.email) sendWelcomeEmail(user.name, user.email);
    redirectWithToken(res, user.id, isNew);
  },
);

// ── Meta / Instagram OAuth ────────────────────────────────────────────────────
router.get('/meta',
  passport.authenticate('facebook', { scope: ['email', 'public_profile'], session: true }),
);

router.get('/meta/callback',
  passport.authenticate('facebook', { failureRedirect: `${frontendUrl()}/login?error=oauth`, session: true }),
  (req, res) => {
    const { profile } = req.user;
    const { user, isNew } = upsertOAuthUser({
      provider: 'meta',
      providerId: profile.id,
      name: profile.displayName,
      email: profile.emails?.[0]?.value,
      avatar: profile.photos?.[0]?.value,
    });
    if (isNew && user.email) sendWelcomeEmail(user.name, user.email);
    redirectWithToken(res, user.id, isNew);
  },
);

// ── TikTok OAuth ──────────────────────────────────────────────────────────────
router.get('/tiktok', (req, res) => {
  if (!process.env.TIKTOK_CLIENT_KEY) {
    return res.redirect(`${frontendUrl()}/login?error=tiktok_not_configured`);
  }
  const state = uuid();
  req.session.tiktokOAuthState = state;
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic',
    response_type: 'code',
    redirect_uri: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/tiktok/callback`,
    state,
  });
  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
});

router.get('/tiktok/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.redirect(`${frontendUrl()}/login?error=oauth`);

  // Validate CSRF state
  const expectedState = req.session.tiktokOAuthState;
  delete req.session.tiktokOAuthState;
  if (!state || !expectedState || state !== expectedState) {
    return res.redirect(`${frontendUrl()}/login?error=oauth`);
  }

  try {
    const tokenRes = await axios.post('https://open.tiktokapis.com/v2/oauth/token/', new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY,
      client_secret: process.env.TIKTOK_CLIENT_SECRET,
      code,
      grant_type: 'authorization_code',
      redirect_uri: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/tiktok/callback`,
    }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

    const { access_token } = tokenRes.data;

    const userRes = await axios.get('https://open.tiktokapis.com/v2/user/info/', {
      headers: { Authorization: `Bearer ${access_token}` },
      params: { fields: 'open_id,display_name,avatar_url' },
    });

    const tiktokUser = userRes.data.data.user;
    const { user, isNew } = upsertOAuthUser({
      provider: 'tiktok',
      providerId: tiktokUser.open_id,
      name: tiktokUser.display_name,
      email: null,
      avatar: tiktokUser.avatar_url,
    });
    if (isNew && user.email) sendWelcomeEmail(user.name, user.email);
    redirectWithToken(res, user.id, isNew);
  } catch (err) {
    logger.error('tiktok oauth failed', { errorMessage: err.message });
    res.redirect(`${frontendUrl()}/login?error=oauth`);
  }
});

// ── Email / password ──────────────────────────────────────────────────────────
router.post('/register',
  authBackoff,
  authLimiter,
  validate({
    name:     isString(2, 100),
    email:    isEmail(),
    password: isString(8, 128),
  }),
  async (req, res) => {
    const { name, email, password } = req.body;
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
    if (existing) {
      req.recordAuthFailure?.();
      return res.status(409).json({ error: 'Email already in use' });
    }

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuid();
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, name, email.toLowerCase(), password_hash);

    req.clearAuthBackoff?.();
    const user = { id, name, email: email.toLowerCase() };
    sendWelcomeEmail(name, email.toLowerCase());
    res.status(201).json({ token: signToken(id), refreshToken: signRefreshToken(id), user });
  },
);

router.post('/login',
  authBackoff,
  loginLimiter,
  validate({
    email:    isEmail(),
    password: isString(1, 128),
  }),
  async (req, res) => {
    const { email, password } = req.body;
    const db = getDb();
    const user = db
      .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
      .get(email.toLowerCase());

    // Use constant-time comparison even when user not found (timing attack prevention)
    const dummyHash = '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);

    if (!user || !user.password_hash) {
      req.recordAuthFailure?.();
      return res.status(401).json({ error: 'No account found with that email.', code: 'USER_NOT_FOUND' });
    }
    if (!valid) {
      req.recordAuthFailure?.();
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.clearAuthBackoff?.();
    const { password_hash: _, ...safeUser } = user;
    res.json({ token: signToken(user.id), refreshToken: signRefreshToken(user.id), user: safeUser });
  },
);

router.post('/onboarding', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const db = getDb();
    db.prepare('UPDATE users SET profile_data = ? WHERE id = ?')
      .run(JSON.stringify(req.body), userId);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.post('/refresh', (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) return res.status(401).json({ error: 'Refresh token required' });
  try {
    const decoded = jwt.verify(refreshToken, process.env.JWT_SECRET);
    if (decoded.type !== 'refresh') return res.status(401).json({ error: 'Invalid token type' });
    const user = getDb().prepare('SELECT id FROM users WHERE id = ?').get(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({
      token: signToken(decoded.userId),
      refreshToken: signRefreshToken(decoded.userId),
    });
  } catch {
    res.status(401).json({ error: 'Invalid or expired refresh token' });
  }
});

router.delete('/account', authenticateToken, (req, res) => {
  const db = getDb();
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
  if (user?.email) sendAccountDeleted(user.name, user.email);
  res.json({ message: 'Account deleted' });
});

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const user = getDb()
      .prepare('SELECT id, name, email, avatar, profile_data FROM users WHERE id = ?')
      .get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user: { ...user, profile_data: user.profile_data ? JSON.parse(user.profile_data) : null } });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

router.get('/profile', authenticateToken, (req, res) => {
  const user = getDb()
    .prepare('SELECT id, name, email, avatar, profile_data FROM users WHERE id = ?')
    .get(req.user.id);
  res.json({ ...user, profile_data: user.profile_data ? JSON.parse(user.profile_data) : null });
});

router.put('/profile', authenticateToken,
  validate({
    name: isString(1, 100),
    bio:      isOptionalString(300),
    company:  isOptionalString(100),
    jobTitle: isOptionalString(100),
    useCase:  isOptionalString(200),
    industry: isOptionalString(100),
  }),
  (req, res) => {
    const { name, ...profileFields } = req.body;
    const profile_data = JSON.stringify(profileFields);
    getDb().prepare('UPDATE users SET name = ?, profile_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(name, profile_data, req.user.id);
    res.json({ message: 'Profile updated' });
  }
);

export default router;
