import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import passport from 'passport';
import { Strategy as GoogleStrategy } from 'passport-google-oauth20';
import { Strategy as FacebookStrategy } from 'passport-facebook';
import axios from 'axios';
import { getDb } from '../database.js';
import { validate, isString, isEmail } from '../middleware/validate.js';
import { authLimiter, loginLimiter } from '../middleware/rateLimits.js';

const router = Router();

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function frontendUrl() {
  return process.env.FRONTEND_URL || 'http://localhost:5173';
}

function redirectWithToken(res, token, isNew = false) {
  res.redirect(`${frontendUrl()}/auth/callback?token=${token}&new=${isNew}`);
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
    redirectWithToken(res, signToken(user.id), isNew);
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
    redirectWithToken(res, signToken(user.id), isNew);
  },
);

// ── TikTok OAuth ──────────────────────────────────────────────────────────────
router.get('/tiktok', (req, res) => {
  if (!process.env.TIKTOK_CLIENT_KEY) {
    return res.redirect(`${frontendUrl()}/login?error=tiktok_not_configured`);
  }
  const params = new URLSearchParams({
    client_key: process.env.TIKTOK_CLIENT_KEY,
    scope: 'user.info.basic',
    response_type: 'code',
    redirect_uri: `${process.env.API_URL || 'http://localhost:3001'}/api/auth/tiktok/callback`,
    state: uuid(),
  });
  res.redirect(`https://www.tiktok.com/v2/auth/authorize/?${params}`);
});

router.get('/tiktok/callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.redirect(`${frontendUrl()}/login?error=oauth`);

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
    redirectWithToken(res, signToken(user.id), isNew);
  } catch (err) {
    console.error('TikTok OAuth error:', err.message);
    res.redirect(`${frontendUrl()}/login?error=oauth`);
  }
});

// ── Email / password ──────────────────────────────────────────────────────────
router.post('/register',
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
    if (existing) return res.status(409).json({ error: 'Email already in use' });

    const password_hash = await bcrypt.hash(password, 12);
    const id = uuid();
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
    ).run(id, name, email.toLowerCase(), password_hash);

    const user = { id, name, email: email.toLowerCase() };
    res.status(201).json({ token: signToken(id), user });
  },
);

router.post('/login',
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
      // bcrypt ran (timing-safe), but no account exists for this email
      return res.status(401).json({ error: 'No account found with that email.', code: 'USER_NOT_FOUND' });
    }
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const { password_hash: _, ...safeUser } = user;
    res.json({ token: signToken(user.id), user: safeUser });
  },
);

router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const user = getDb()
      .prepare('SELECT id, name, email, avatar FROM users WHERE id = ?')
      .get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
