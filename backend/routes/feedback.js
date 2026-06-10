import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { ADMIN_EMAILS } from '../services/stripeService.js';
import { sendFeedbackNotification } from '../services/emailService.js';

const router = Router();

// ─── POST /api/feedback ─────────────────────────────────────────────────────
router.post('/', authenticateToken, async (req, res) => {
  const { message, page } = req.body || {};
  if (!message || typeof message !== 'string' || !message.trim()) {
    return res.status(400).json({ error: 'Feedback message is required.' });
  }
  if (message.length > 2000) {
    return res.status(400).json({ error: 'Feedback message is too long.' });
  }

  const db = getDb();
  const user = db.prepare('SELECT name, email FROM users WHERE id = ?').get(req.user.id);

  const id = uuid();
  db.prepare(
    'INSERT INTO feedback (id, user_id, page, message) VALUES (?, ?, ?, ?)'
  ).run(id, req.user.id, page || null, message.trim());

  sendFeedbackNotification(
    [...ADMIN_EMAILS],
    user?.name || 'A user',
    user?.email || 'unknown',
    message.trim(),
    page
  ).catch(() => {});

  res.json({ ok: true });
});

export default router;
