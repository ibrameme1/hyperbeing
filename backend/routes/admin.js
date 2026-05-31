import { Router } from 'express';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../services/stripeService.js';
import { metrics } from '../services/metrics.js';

const router = Router();

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.id)) return res.status(403).json({ error: 'Admin only' });
  next();
}

// ─── GET /api/admin/logs ──────────────────────────────────────────────────────
router.get('/logs', authenticateToken, requireAdmin, (req, res) => {
  const {
    level,
    search,
    limit  = 200,
    offset = 0,
  } = req.query;

  const params = [];
  let where = 'WHERE 1=1';

  if (level && ['debug', 'info', 'warn', 'error'].includes(level)) {
    where += ' AND level = ?';
    params.push(level);
  }
  if (search?.trim()) {
    where += ' AND (message LIKE ? OR context LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const safeLimit  = Math.min(parseInt(limit)  || 200, 500);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);

  const db = getDb();
  const total = db.prepare(`SELECT COUNT(*) as n FROM app_logs ${where}`).get(...params).n;
  const rows  = db.prepare(
    `SELECT id, level, message, context, created_at
     FROM app_logs ${where}
     ORDER BY id DESC LIMIT ? OFFSET ?`
  ).all(...params, safeLimit, safeOffset);

  res.json({
    total,
    logs: rows.map(r => {
      let ctx = {};
      try { ctx = JSON.parse(r.context || '{}'); } catch {}
      return { id: r.id, level: r.level, message: r.message, context: ctx, ts: r.created_at };
    }),
  });
});

// ─── GET /api/admin/metrics ───────────────────────────────────────────────────
router.get('/metrics', authenticateToken, requireAdmin, (_req, res) => {
  res.json(metrics.snapshot());
});

// ─── GET /api/admin/log-summary ──────────────────────────────────────────────
// Fast aggregates used for the dashboard sparklines.
router.get('/log-summary', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();

  const bySeverity = db.prepare(`
    SELECT level, COUNT(*) as count
    FROM app_logs
    GROUP BY level
  `).all();

  const recentErrors = db.prepare(`
    SELECT id, message, context, created_at
    FROM app_logs
    WHERE level = 'error'
    ORDER BY id DESC LIMIT 10
  `).all().map(r => {
    let ctx = {};
    try { ctx = JSON.parse(r.context || '{}'); } catch {}
    return { id: r.id, message: r.message, context: ctx, ts: r.created_at };
  });

  const byHour = db.prepare(`
    SELECT
      strftime('%Y-%m-%dT%H:00:00', created_at) as hour,
      level,
      COUNT(*) as count
    FROM app_logs
    WHERE created_at >= datetime('now', '-24 hours')
    GROUP BY hour, level
    ORDER BY hour ASC
  `).all();

  res.json({ bySeverity, recentErrors, byHour });
});

export default router;
