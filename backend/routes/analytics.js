import { Router } from 'express';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { isAdmin } from '../services/stripeService.js';

const router = Router();

function maskEmail(email) {
  if (!email) return null;
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 2);
  return `${visible}${'*'.repeat(Math.max(local.length - 2, 3))}@${domain}`;
}

// ── Admin-only guard — every analytics route requires a valid JWT + admin flag ─
function requireAdmin(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    const { userId } = jwt.verify(token, process.env.JWT_SECRET);
    if (!isAdmin(userId)) return res.status(403).json({ error: 'Admin access required' });
    req.userId = userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Apply admin guard to every route in this router
router.use(requireAdmin);

// ── SSE clients registry ──────────────────────────────────────────────────────
const liveClients = new Set();

export function broadcastAnalyticsEvent(event) {
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of liveClients) {
    try { res.write(payload); } catch { liveClients.delete(res); }
  }
}

function optionalUserId(req) {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return null;
    return jwt.verify(token, process.env.JWT_SECRET).userId ?? null;
  } catch { return null; }
}

// ── POST /api/analytics/track ─────────────────────────────────────────────────
router.post('/track', (req, res) => {
  const { event_type, page, metadata, session_id } = req.body;
  if (!event_type) return res.status(400).json({ error: 'event_type required' });

  const userId = optionalUserId(req);
  const db = getDb();

  const result = db.prepare(`
    INSERT INTO analytics_events (event_type, user_id, session_id, page, metadata)
    VALUES (?, ?, ?, ?, ?)
  `).run(event_type, userId, session_id ?? null, page ?? null, JSON.stringify(metadata ?? {}));

  const event = {
    id: result.lastInsertRowid,
    event_type,
    user_id: userId,
    page: page ?? null,
    metadata: metadata ?? {},
    created_at: new Date().toISOString(),
  };

  broadcastAnalyticsEvent(event);
  res.json({ ok: true });
});

// ── GET /api/analytics/live ───────────────────────────────────────────────────
router.get('/live', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  try {
    const db = getDb();
    const recent = db.prepare(`
      SELECT ae.*, u.name as user_name
      FROM analytics_events ae
      LEFT JOIN users u ON ae.user_id = u.id
      ORDER BY ae.created_at DESC LIMIT 10
    `).all().reverse();

    for (const ev of recent) {
      res.write(`data: ${JSON.stringify({ ...ev, metadata: JSON.parse(ev.metadata || '{}') })}\n\n`);
    }
  } catch { /* no events yet */ }

  liveClients.add(res);

  const hb = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch { clearInterval(hb); }
  }, 25000);

  req.on('close', () => { liveClients.delete(res); clearInterval(hb); });
});

// ── GET /api/analytics/overview ───────────────────────────────────────────────
router.get('/overview', (req, res) => {
  const db = getDb();

  const totalUsers = db.prepare('SELECT COUNT(*) as n FROM users').get().n;
  const totalPresentations = db.prepare('SELECT COUNT(*) as n FROM presentations').get().n;
  const totalMessages = db.prepare('SELECT COUNT(*) as n FROM messages').get().n;
  const totalCreditsUsed = db.prepare(
    "SELECT COALESCE(SUM(ABS(amount)),0) as n FROM credit_transactions WHERE amount < 0"
  ).get().n;
  const totalEvents = db.prepare('SELECT COUNT(*) as n FROM analytics_events').get().n;
  const activePresentations = db.prepare(
    "SELECT COUNT(*) as n FROM presentations WHERE status IN ('generating','chat')"
  ).get().n;

  const usersToday = db.prepare(
    "SELECT COUNT(*) as n FROM users WHERE DATE(created_at) = DATE('now')"
  ).get().n;
  const usersYesterday = db.prepare(
    "SELECT COUNT(*) as n FROM users WHERE DATE(created_at) = DATE('now','-1 day')"
  ).get().n;
  const presToday = db.prepare(
    "SELECT COUNT(*) as n FROM presentations WHERE DATE(created_at) = DATE('now')"
  ).get().n;
  const presYesterday = db.prepare(
    "SELECT COUNT(*) as n FROM presentations WHERE DATE(created_at) = DATE('now','-1 day')"
  ).get().n;

  res.json({
    totalUsers, totalPresentations, totalMessages, totalCreditsUsed, totalEvents, activePresentations,
    today: { users: usersToday, presentations: presToday },
    yesterday: { users: usersYesterday, presentations: presYesterday },
  });
});

// ── GET /api/analytics/timeseries ─────────────────────────────────────────────
router.get('/timeseries', (req, res) => {
  const db = getDb();
  const days = Math.min(parseInt(req.query.days) || 30, 90);

  const signups = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM users WHERE created_at >= DATE('now',? || ' days')
    GROUP BY DATE(created_at)
  `).all(`-${days}`);

  const presentations = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM presentations WHERE created_at >= DATE('now',? || ' days')
    GROUP BY DATE(created_at)
  `).all(`-${days}`);

  const credits = db.prepare(`
    SELECT DATE(created_at) as date, SUM(ABS(amount)) as count
    FROM credit_transactions WHERE amount < 0
      AND created_at >= DATE('now',? || ' days')
    GROUP BY DATE(created_at)
  `).all(`-${days}`);

  const messages = db.prepare(`
    SELECT DATE(created_at) as date, COUNT(*) as count
    FROM messages WHERE role='user'
      AND created_at >= DATE('now',? || ' days')
    GROUP BY DATE(created_at)
  `).all(`-${days}`);

  const result = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const date = d.toISOString().split('T')[0];
    result.push({
      date,
      signups:       signups.find(r => r.date === date)?.count       || 0,
      presentations: presentations.find(r => r.date === date)?.count || 0,
      credits:       credits.find(r => r.date === date)?.count       || 0,
      messages:      messages.find(r => r.date === date)?.count      || 0,
    });
  }
  res.json(result);
});

// ── GET /api/analytics/users ──────────────────────────────────────────────────
router.get('/users', (req, res) => {
  const db = getDb();

  const oauthBreakdown = db.prepare(`
    SELECT
      CASE WHEN google_id IS NOT NULL THEN 'Google'
           WHEN meta_id IS NOT NULL THEN 'Facebook'
           WHEN tiktok_id IS NOT NULL THEN 'TikTok'
           ELSE 'Email' END as provider,
      COUNT(*) as count
    FROM users GROUP BY provider
  `).all();

  const topUsers = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           COUNT(DISTINCT p.id) as presentation_count,
           COALESCE(s.plan,'free') as plan,
           COALESCE(s.credits_remaining,0) as credits_remaining
    FROM users u
    LEFT JOIN presentations p ON p.user_id = u.id
    LEFT JOIN subscriptions s ON s.user_id = u.id
    GROUP BY u.id
    ORDER BY presentation_count DESC
    LIMIT 20
  `).all().map(u => ({ ...u, email: maskEmail(u.email) }));

  const recentSignups = db.prepare(`
    SELECT id, name, email, created_at,
           CASE WHEN google_id IS NOT NULL THEN 'Google'
                WHEN meta_id IS NOT NULL THEN 'Facebook'
                WHEN tiktok_id IS NOT NULL THEN 'TikTok'
                ELSE 'Email' END as provider
    FROM users ORDER BY created_at DESC LIMIT 10
  `).all().map(u => ({ ...u, email: maskEmail(u.email) }));

  const planDistribution = db.prepare(`
    SELECT COALESCE(plan,'free') as plan, COUNT(*) as count
    FROM subscriptions GROUP BY plan
  `).all();

  const activeToday = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as n FROM presentations WHERE DATE(updated_at) = DATE('now')"
  ).get().n;

  const activeThisWeek = db.prepare(
    "SELECT COUNT(DISTINCT user_id) as n FROM presentations WHERE updated_at >= DATE('now','-7 days')"
  ).get().n;

  res.json({ oauthBreakdown, topUsers, recentSignups, planDistribution, activeToday, activeThisWeek });
});

// ── GET /api/analytics/presentations ─────────────────────────────────────────
router.get('/presentations', (req, res) => {
  const db = getDb();

  const statusBreakdown = db.prepare(
    'SELECT status, COUNT(*) as count FROM presentations GROUP BY status'
  ).all();

  const byDayOfWeek = db.prepare(`
    SELECT strftime('%w', created_at) as dow, COUNT(*) as count
    FROM presentations GROUP BY dow ORDER BY dow
  `).all();

  const byHourOfDay = db.prepare(`
    SELECT strftime('%H', created_at) as hour, COUNT(*) as count
    FROM presentations GROUP BY hour ORDER BY hour
  `).all();

  const avgSlides = db.prepare(`
    SELECT AVG(slide_count) as avg FROM (
      SELECT json_array_length(slides_data) as slide_count
      FROM presentations WHERE slides_data IS NOT NULL AND slides_data != 'null'
    )
  `).get().avg || 0;

  const recentPresentations = db.prepare(`
    SELECT p.id, p.title, p.status, p.created_at, p.updated_at,
           u.name as user_name,
           json_array_length(p.slides_data) as slide_count
    FROM presentations p JOIN users u ON u.id = p.user_id
    ORDER BY p.created_at DESC LIMIT 15
  `).all();

  const dayNames = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const byDow = dayNames.map((day, i) => ({
    day,
    count: byDayOfWeek.find(r => parseInt(r.dow) === i)?.count || 0,
  }));

  const byHour = Array.from({ length: 24 }, (_, i) => ({
    hour: `${i.toString().padStart(2,'0')}:00`,
    count: byHourOfDay.find(r => parseInt(r.hour) === i)?.count || 0,
  }));

  res.json({ statusBreakdown, byDow, byHour, avgSlides, recentPresentations });
});

// ── GET /api/analytics/credits ────────────────────────────────────────────────
router.get('/credits', (req, res) => {
  const db = getDb();

  const byPlan = db.prepare(`
    SELECT COALESCE(s.plan,'free') as plan, SUM(ABS(ct.amount)) as consumed
    FROM credit_transactions ct
    LEFT JOIN subscriptions s ON s.user_id = ct.user_id
    WHERE ct.amount < 0 GROUP BY plan
  `).all();

  const totalRemaining = db.prepare(
    'SELECT COALESCE(SUM(credits_remaining),0) as n FROM subscriptions'
  ).get().n;

  const recentTransactions = db.prepare(`
    SELECT ct.*, u.name as user_name
    FROM credit_transactions ct JOIN users u ON u.id = ct.user_id
    ORDER BY ct.created_at DESC LIMIT 20
  `).all();

  res.json({ byPlan, totalRemaining, recentTransactions });
});

// ── GET /api/analytics/events ─────────────────────────────────────────────────
router.get('/events', (req, res) => {
  const db = getDb();
  const limit = Math.min(parseInt(req.query.limit) || 50, 200);
  const offset = parseInt(req.query.offset) || 0;

  const events = db.prepare(`
    SELECT ae.*, u.name as user_name
    FROM analytics_events ae
    LEFT JOIN users u ON ae.user_id = u.id
    ORDER BY ae.created_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);

  const byType = db.prepare(`
    SELECT event_type, COUNT(*) as count
    FROM analytics_events GROUP BY event_type ORDER BY count DESC
  `).all();

  const total = db.prepare('SELECT COUNT(*) as n FROM analytics_events').get().n;

  res.json({
    events: events.map(e => ({ ...e, metadata: JSON.parse(e.metadata || '{}') })),
    byType,
    total,
    limit,
    offset,
  });
});

// ── PATCH /api/analytics/users/:userId/credits ────────────────────────────────
router.patch('/users/:userId/credits', (req, res) => {
  const db = getDb();
  const { userId } = req.params;
  const { credits, reason } = req.body;

  const creditsNum = parseInt(credits, 10);
  if (isNaN(creditsNum) || creditsNum < 0) {
    return res.status(400).json({ error: 'credits must be a non-negative integer' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
  if (!user) return res.status(404).json({ error: 'User not found' });

  const sub = db.prepare('SELECT credits_remaining FROM subscriptions WHERE user_id = ?').get(userId);
  if (!sub) return res.status(404).json({ error: 'No subscription found for this user' });

  const prev = sub.credits_remaining;
  const diff = creditsNum - prev;

  db.prepare(`
    UPDATE subscriptions
    SET credits_remaining = ?, credits_total = MAX(credits_total, ?), updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(creditsNum, creditsNum, userId);

  db.prepare(`
    INSERT INTO credit_transactions (id, user_id, amount, balance_after, type, description)
    VALUES (?, ?, ?, ?, 'admin_adjustment', ?)
  `).run(uuid(), userId, diff, creditsNum, reason || `Admin adjusted credits from ${prev} to ${creditsNum}`);

  res.json({ userId, credits_remaining: creditsNum, previous: prev });
});

export default router;
