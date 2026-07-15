import { Router } from 'express';
import crypto from 'crypto';
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
import { sendWelcomeEmail, sendAccountDeleted, sendVerificationCode, sendPasswordResetCode, isEmailConfigured } from '../services/emailService.js';
import { validate, isString, isEmail, isOptionalString } from '../middleware/validate.js';
import { authLimiter, loginLimiter, authBackoff } from '../middleware/rateLimits.js';

const router = Router();

// ── Pending email-verification store ───────────────────────────────────────────
// Registrations are NOT written to the users table until the emailed code is
// confirmed — unverified signups never touch the DB. Single-process, in-memory
// by design (see CLAUDE.md); a server restart just makes the user sign up again.
const pendingRegistrations = new Map(); // email(lowercased) -> { name, passwordHash, code, expiresAt, attempts }

// Existing email/password accounts get a ONE-TIME verification code the first
// time they sign in after this feature shipped (tracked by users.email_verified).
// This holds the in-flight challenge; it's only created after a correct password.
const pendingLoginVerifications = new Map(); // email(lowercased) -> { userId, code, expiresAt, attempts }

// Forgot-password challenges. A code is emailed to a KNOWN account (email/password
// only) and, once confirmed with the correct code, lets the holder set a new
// password without knowing the old one. Only created after we've confirmed an
// account with a password exists — but the HTTP response is identical either way
// so /forgot-password can't be used to enumerate registered emails.
const pendingPasswordResets = new Map(); // email(lowercased) -> { userId, code, expiresAt, attempts }

const CODE_TTL_MS = 10 * 60 * 1000;     // codes expire after 10 minutes
const MAX_CODE_ATTEMPTS = 6;            // wrong-code guesses before the code is burned

function generateCode() {
  // 6-digit numeric code, cryptographically random, zero-padded.
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}

// Evict expired pending entries so the maps can't grow unbounded.
setInterval(() => {
  const now = Date.now();
  for (const map of [pendingRegistrations, pendingLoginVerifications, pendingPasswordResets]) {
    for (const [key, entry] of map) {
      if (entry.expiresAt < now) map.delete(key);
    }
  }
}, 5 * 60 * 1000).unref?.();

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
  // Tokens go in the URL FRAGMENT, not the query string — fragments are never
  // sent to servers, so they stay out of access logs, Referer headers, and
  // any intermediary. AuthCallback.jsx reads window.location.hash.
  res.redirect(`${frontendUrl()}/auth/callback#token=${token}&refresh=${refreshToken}&new=${isNew}`);
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
  // OAuth accounts are trusted via the provider — created already verified so
  // they never hit the one-time login code check.
  db.prepare(
    `INSERT INTO users (id, name, email, ${col}, avatar, email_verified) VALUES (?, ?, ?, ?, ?, 1)`
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
    const normalizedEmail = email.toLowerCase();
    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      req.recordAuthFailure?.();
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Don't create the account yet — hold the details in the pending store and
    // email a one-time code. The user only lands in the DB once they prove the
    // address is reachable via POST /verify-email.
    const passwordHash = await bcrypt.hash(password, 12);
    const code = generateCode();
    pendingRegistrations.set(normalizedEmail, {
      name,
      passwordHash,
      code,
      expiresAt: Date.now() + CODE_TTL_MS,
      attempts: 0,
    });

    req.clearAuthBackoff?.();
    sendVerificationCode(name, normalizedEmail, code);
    logger.info('registration pending email verification', { email: normalizedEmail });

    // When email isn't configured (local/mock mode) the code can't be delivered,
    // so hand it back to the client to keep the signup flow exercisable. Never
    // do this once Resend is wired up — the code stays out of the response.
    const payload = { pendingVerification: true, email: normalizedEmail };
    if (!isEmailConfigured()) payload.devCode = code;
    res.status(202).json(payload);
  },
);

// Confirm the emailed code and actually create the account.
router.post('/verify-email',
  authBackoff,
  authLimiter,
  validate({
    email: isEmail(),
    code:  isString(4, 8),
  }),
  async (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const code = req.body.code.trim();
    const pending = pendingRegistrations.get(normalizedEmail);

    if (!pending || pending.expiresAt < Date.now()) {
      pendingRegistrations.delete(normalizedEmail);
      return res.status(400).json({ error: 'Your verification code has expired. Please sign up again.' });
    }

    if (pending.code !== code) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_CODE_ATTEMPTS) {
        pendingRegistrations.delete(normalizedEmail);
        req.recordAuthFailure?.();
        return res.status(400).json({ error: 'Too many incorrect codes. Please sign up again.' });
      }
      req.recordAuthFailure?.();
      return res.status(400).json({ error: 'That code is incorrect. Please check your email and try again.' });
    }

    const db = getDb();
    // Re-check uniqueness — another signup could have claimed the email in the
    // window between register and verify.
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
    if (existing) {
      pendingRegistrations.delete(normalizedEmail);
      return res.status(409).json({ error: 'Email already in use' });
    }

    const id = uuid();
    // Created verified — the code they just entered IS the email verification,
    // so this account is exempt from the one-time login check.
    db.prepare(
      'INSERT INTO users (id, name, email, password_hash, email_verified) VALUES (?, ?, ?, ?, 1)'
    ).run(id, pending.name, normalizedEmail, pending.passwordHash);
    pendingRegistrations.delete(normalizedEmail);

    req.clearAuthBackoff?.();
    const user = { id, name: pending.name, email: normalizedEmail };
    sendWelcomeEmail(pending.name, normalizedEmail);
    logger.info('email verified, account created', { userId: id });
    res.status(201).json({ token: signToken(id), refreshToken: signRefreshToken(id), user });
  },
);

// Re-send the verification code for an in-flight signup.
router.post('/resend-code',
  authBackoff,
  authLimiter,
  validate({ email: isEmail() }),
  (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const pending = pendingRegistrations.get(normalizedEmail);
    if (!pending) {
      return res.status(400).json({ error: 'No pending signup found for that email. Please sign up again.' });
    }

    const code = generateCode();
    pending.code = code;
    pending.expiresAt = Date.now() + CODE_TTL_MS;
    pending.attempts = 0;
    sendVerificationCode(pending.name, normalizedEmail, code);
    logger.info('verification code resent', { email: normalizedEmail });

    const payload = { ok: true };
    if (!isEmailConfigured()) payload.devCode = code;
    res.json(payload);
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
    const normalizedEmail = email.toLowerCase();
    const db = getDb();
    const user = db
      .prepare('SELECT id, name, email, password_hash, email_verified FROM users WHERE email = ?')
      .get(normalizedEmail);

    // Use constant-time comparison even when user not found (timing attack prevention)
    const dummyHash = '$2a$12$invalidhashpadding000000000000000000000000000000000000000';
    const valid = await bcrypt.compare(password, user?.password_hash || dummyHash);

    // One identical response for "no such account" and "wrong password" — a
    // distinct USER_NOT_FOUND code let attackers enumerate registered emails.
    if (!user || !user.password_hash || !valid) {
      req.recordAuthFailure?.();
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    req.clearAuthBackoff?.();

    // One-time verification gate for legacy accounts that predate email
    // verification. Password was correct, but the address was never confirmed —
    // email a code and withhold the session until POST /verify-login. Verified
    // accounts (all new signups, OAuth, and anyone who's done this once) skip it.
    if (!user.email_verified) {
      const code = generateCode();
      pendingLoginVerifications.set(normalizedEmail, {
        userId: user.id,
        code,
        expiresAt: Date.now() + CODE_TTL_MS,
        attempts: 0,
      });
      sendVerificationCode(user.name, normalizedEmail, code);
      logger.info('login requires one-time verification', { userId: user.id });
      const payload = { requiresVerification: true, email: normalizedEmail };
      if (!isEmailConfigured()) payload.devCode = code;
      return res.json(payload);
    }

    const { password_hash: _, email_verified: __, ...safeUser } = user;
    res.json({ token: signToken(user.id), refreshToken: signRefreshToken(user.id), user: safeUser });
  },
);

// Confirm the one-time login code for a legacy unverified account, then mark it
// verified so this never happens again. The pending entry only exists if the
// password was already accepted at /login, so possessing the code proves the
// address is reachable.
router.post('/verify-login',
  authBackoff,
  authLimiter,
  validate({
    email: isEmail(),
    code:  isString(4, 8),
  }),
  (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const code = req.body.code.trim();
    const pending = pendingLoginVerifications.get(normalizedEmail);

    if (!pending || pending.expiresAt < Date.now()) {
      pendingLoginVerifications.delete(normalizedEmail);
      return res.status(400).json({ error: 'Your verification code has expired. Please sign in again.' });
    }

    if (pending.code !== code) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_CODE_ATTEMPTS) {
        pendingLoginVerifications.delete(normalizedEmail);
        req.recordAuthFailure?.();
        return res.status(400).json({ error: 'Too many incorrect codes. Please sign in again.' });
      }
      req.recordAuthFailure?.();
      return res.status(400).json({ error: 'That code is incorrect. Please check your email and try again.' });
    }

    const db = getDb();
    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(pending.userId);
    pendingLoginVerifications.delete(normalizedEmail);

    const user = db.prepare('SELECT id, name, email, avatar FROM users WHERE id = ?').get(pending.userId);
    req.clearAuthBackoff?.();
    logger.info('one-time login verification complete', { userId: pending.userId });
    res.json({ token: signToken(user.id), refreshToken: signRefreshToken(user.id), user });
  },
);

// Re-send the one-time login code for an in-flight sign-in challenge.
router.post('/resend-login-code',
  authBackoff,
  authLimiter,
  validate({ email: isEmail() }),
  (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const pending = pendingLoginVerifications.get(normalizedEmail);
    if (!pending) {
      return res.status(400).json({ error: 'No pending sign-in found for that email. Please sign in again.' });
    }
    const code = generateCode();
    pending.code = code;
    pending.expiresAt = Date.now() + CODE_TTL_MS;
    pending.attempts = 0;
    const user = getDb().prepare('SELECT name FROM users WHERE id = ?').get(pending.userId);
    sendVerificationCode(user?.name || 'there', normalizedEmail, code);
    logger.info('login verification code resent', { email: normalizedEmail });
    const payload = { ok: true };
    if (!isEmailConfigured()) payload.devCode = code;
    res.json(payload);
  },
);

router.post('/onboarding', authenticateToken,
  // Only the known onboarding answer fields are persisted — validate() strips
  // everything else, so this can no longer be used to stuff arbitrary blobs
  // into users.profile_data.
  validate({
    use_case:       isOptionalString(200),
    presenter_type: isOptionalString(200),
    design_vibe:    isOptionalString(200),
    priority:       isOptionalString(200),
    role:           isOptionalString(200),
    frequency:      isOptionalString(200),
    team_size:      isOptionalString(200),
    referral:       isOptionalString(200),
  }),
  (req, res) => {
    getDb().prepare('UPDATE users SET profile_data = ? WHERE id = ?')
      .run(JSON.stringify(req.body), req.user.id);
    res.json({ ok: true });
  },
);

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
    // NB: users has no updated_at column — writing one here broke every
    // profile save with a 500 (GAPS #3).
    getDb().prepare('UPDATE users SET name = ?, profile_data = ? WHERE id = ?')
      .run(name, profile_data, req.user.id);
    res.json({ message: 'Profile updated' });
  }
);

// ── Change password ────────────────────────────────────────────────────────────
// Step 1 of the UI flow: confirm the current password before revealing the
// "new password" fields. Returns 401 on mismatch so the client can gate.
router.post('/verify-password', authenticateToken,
  validate({ password: isString(1, 128) }),
  async (req, res) => {
    const db = getDb();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user?.password_hash) {
      return res.status(400).json({ error: 'This account has no password set. It was created with a social login.' });
    }
    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });
    res.json({ valid: true });
  },
);

// Step 2: verify the current password again (never trust the client's step 1)
// and set the new one.
router.post('/change-password', authenticateToken,
  validate({
    currentPassword: isString(1, 128),
    newPassword:     isString(8, 128),
  }),
  async (req, res) => {
    const { currentPassword, newPassword } = req.body;
    const db = getDb();
    const user = db.prepare('SELECT password_hash FROM users WHERE id = ?').get(req.user.id);
    if (!user?.password_hash) {
      return res.status(400).json({ error: 'This account has no password set. It was created with a social login.' });
    }
    const valid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    if (currentPassword === newPassword) {
      return res.status(400).json({ error: 'Your new password must be different from your current one.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    // NB: users has no updated_at column — don't write one here (GAPS #3).
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(password_hash, req.user.id);
    logger.info('password changed', { userId: req.user.id });
    res.json({ message: 'Password updated' });
  },
);

// ── Forgot password ─────────────────────────────────────────────────────────
// Step 1: email a reset code to a known email/password account. Works whether or
// not the caller is signed in — the Profile tab uses it for "I forgot my current
// password", and the Login page uses it for the classic forgotten-password flow.
router.post('/forgot-password',
  authBackoff,
  authLimiter,
  validate({ email: isEmail() }),
  (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const db = getDb();
    const user = db
      .prepare('SELECT id, name, password_hash FROM users WHERE email = ?')
      .get(normalizedEmail);

    // Only issue a code for accounts that actually have a password to reset.
    // Social-login-only accounts have no password_hash — nothing to reset.
    // Either way we return the SAME generic response so this endpoint can't be
    // used to discover which emails are registered.
    if (user && user.password_hash) {
      const code = generateCode();
      pendingPasswordResets.set(normalizedEmail, {
        userId: user.id,
        code,
        expiresAt: Date.now() + CODE_TTL_MS,
        attempts: 0,
      });
      sendPasswordResetCode(user.name, normalizedEmail, code);
      logger.info('password reset requested', { userId: user.id });

      // Dev/mock mode (no Resend key): hand the code back so the flow stays
      // exercisable. Never do this once email delivery is configured.
      const payload = { ok: true };
      if (!isEmailConfigured()) payload.devCode = code;
      return res.json(payload);
    }

    // Unknown email or social-only account: pretend we sent something.
    logger.info('password reset requested for unresettable account', { email: normalizedEmail });
    res.json({ ok: true });
  },
);

// Step 2: confirm the emailed code and set the new password. Possessing the code
// proves the address is reachable, so no current password is required.
router.post('/reset-password',
  authBackoff,
  authLimiter,
  validate({
    email:       isEmail(),
    code:        isString(4, 8),
    newPassword: isString(8, 128),
  }),
  async (req, res) => {
    const normalizedEmail = req.body.email.toLowerCase();
    const code = req.body.code.trim();
    const { newPassword } = req.body;
    const pending = pendingPasswordResets.get(normalizedEmail);

    if (!pending || pending.expiresAt < Date.now()) {
      pendingPasswordResets.delete(normalizedEmail);
      return res.status(400).json({ error: 'Your reset code has expired. Please request a new one.' });
    }

    if (pending.code !== code) {
      pending.attempts += 1;
      if (pending.attempts >= MAX_CODE_ATTEMPTS) {
        pendingPasswordResets.delete(normalizedEmail);
        req.recordAuthFailure?.();
        return res.status(400).json({ error: 'Too many incorrect codes. Please request a new reset code.' });
      }
      req.recordAuthFailure?.();
      return res.status(400).json({ error: 'That code is incorrect. Please check your email and try again.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT id, password_hash FROM users WHERE id = ?').get(pending.userId);
    if (!user) {
      pendingPasswordResets.delete(normalizedEmail);
      return res.status(400).json({ error: 'We could not find that account. Please sign up again.' });
    }

    // Reject reusing the existing password, matching /change-password.
    if (user.password_hash && await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({ error: 'Your new password must be different from your current one.' });
    }

    const password_hash = await bcrypt.hash(newPassword, 12);
    // NB: users has no updated_at column — don't write one here (GAPS #3).
    // Setting a verified password also clears any legacy one-time login gate.
    db.prepare('UPDATE users SET password_hash = ?, email_verified = 1 WHERE id = ?').run(password_hash, pending.userId);
    pendingPasswordResets.delete(normalizedEmail);
    req.clearAuthBackoff?.();
    logger.info('password reset via emailed code', { userId: pending.userId });
    res.json({ message: 'Password updated' });
  },
);

export default router;
