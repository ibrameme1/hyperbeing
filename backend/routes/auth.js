import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { validateRegister, validateLogin } from '../middleware/validation.js';

const router = Router();

// Pre-computed bcrypt hash used during login when the supplied email does not exist.
// bcrypt.compare will still run (and take the same time) so the response timing does not
// reveal whether the email is registered — OWASP A07: Identification and Authentication Failures.
const DUMMY_HASH = '$2a$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy';

function signToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// ─── Register ─────────────────────────────────────────────────────────────────
// authLimiter: 10 attempts / 15 min per IP — prevents account enumeration and spam
// validateRegister: whitelist fields, check email format, enforce password length
router.post('/register', authLimiter, validateRegister, async (req, res) => {
  const { name, email, password } = req.body;

  const db = getDb();
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
  if (existing) return res.status(409).json({ error: 'Email already in use' });

  const password_hash = await bcrypt.hash(password, 10);
  const id = uuid();

  db.prepare(
    'INSERT INTO users (id, name, email, password_hash) VALUES (?, ?, ?, ?)'
  ).run(id, name.trim(), email.toLowerCase(), password_hash);

  const user = { id, name: name.trim(), email: email.toLowerCase() };
  res.status(201).json({ token: signToken(id), user });
});

// ─── Login ────────────────────────────────────────────────────────────────────
// authLimiter: protects against credential stuffing and brute-force
// validateLogin: whitelist fields, enforce max lengths
router.post('/login', authLimiter, validateLogin, async (req, res) => {
  const { email, password } = req.body;

  const db = getDb();
  const user = db
    .prepare('SELECT id, name, email, password_hash FROM users WHERE email = ?')
    .get(email.toLowerCase());

  // Always call bcrypt.compare — even when the user is not found — so that response
  // timing is identical regardless of whether the email exists in the database.
  const hashToCompare = user?.password_hash ?? DUMMY_HASH;
  const valid = await bcrypt.compare(password, hashToCompare);

  if (!user || !valid) return res.status(401).json({ error: 'Invalid credentials' });

  const { password_hash: _, ...safeUser } = user;
  res.json({ token: signToken(user.id), user: safeUser });
});

// ─── Me ───────────────────────────────────────────────────────────────────────
router.get('/me', (req, res) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    const user = getDb()
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json({ user });
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
});

export default router;
