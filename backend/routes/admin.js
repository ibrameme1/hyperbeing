import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { getDb, DATA_DIR, DB_PATH } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { isAdmin } from '../services/stripeService.js';
import { metrics } from '../services/metrics.js';
import { sendCreditsGranted } from '../services/emailService.js';

const router = Router();

function requireAdmin(req, res, next) {
  if (!isAdmin(req.user.id)) return res.status(403).json({ error: 'Admin only' });
  next();
}

const ALLOWED_TABLES = [
  'users', 'presentations', 'messages', 'subscriptions',
  'credit_transactions', 'prompt_sessions', 'app_logs', 'analytics_events',
];

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

// ─── POST /api/admin/grant-credits ───────────────────────────────────────────
router.post('/grant-credits', authenticateToken, requireAdmin, (req, res) => {
  const { email, credits } = req.body;
  if (!email || !credits || credits < 1) return res.status(400).json({ error: 'email and credits required' });
  const db = getDb();
  const user = db.prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)').get(email);
  if (!user) return res.status(404).json({ error: `No user found with email: ${email}` });
  const current = db.prepare('SELECT credits_remaining, credits_total FROM subscriptions WHERE user_id = ?').get(user.id);
  if (!current) return res.status(404).json({ error: 'No subscription found for this user' });
  const newBalance = current.credits_remaining + credits;
  db.prepare(
    'UPDATE subscriptions SET credits_remaining = ?, credits_total = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?'
  ).run(newBalance, current.credits_total + credits, user.id);
  const grantedUser = db.prepare('SELECT name FROM users WHERE id = ?').get(user.id);
  sendCreditsGranted(grantedUser?.name || 'there', email, credits, newBalance);
  res.json({ email, added: credits, new_balance: newBalance });
});

// ─── GET /api/admin/users/all ─────────────────────────────────────────────────
router.get('/users/all', authenticateToken, requireAdmin, (req, res) => {
  const { search = '', limit = 50, offset = 0 } = req.query;
  const safeLimit  = Math.min(parseInt(limit)  || 50, 200);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);
  const db = getDb();

  const params = [];
  let where = 'WHERE 1=1';
  if (search.trim()) {
    where += ' AND (u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`);
  }

  const total = db.prepare(`SELECT COUNT(*) as n FROM users u ${where}`).get(...params).n;
  const users = db.prepare(`
    SELECT u.id, u.name, u.email, u.created_at,
           COALESCE(s.plan, 'free')             as plan,
           COALESCE(s.credits_remaining, 0)     as credits_remaining,
           COALESCE(s.credits_total, 0)         as credits_total,
           COALESCE(s.status, 'active')         as subscription_status,
           COALESCE(s.tokens_used, 0)           as tokens_used,
           (SELECT COUNT(*) FROM presentations WHERE user_id = u.id) as presentation_count
    FROM users u
    LEFT JOIN subscriptions s ON s.user_id = u.id
    ${where}
    ORDER BY u.created_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, safeOffset);

  res.json({ users, total });
});

// ─── PATCH /api/admin/users/:id ──────────────────────────────────────────────
router.patch('/users/:id', authenticateToken, requireAdmin, (req, res) => {
  const { id } = req.params;
  const { name, email, plan, credits_remaining } = req.body;
  const db = getDb();

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (name  !== undefined) db.prepare('UPDATE users SET name  = ? WHERE id = ?').run(name,  id);
  if (email !== undefined) db.prepare('UPDATE users SET email = ? WHERE id = ?').run(email, id);

  if (plan !== undefined || credits_remaining !== undefined) {
    const sub = db.prepare('SELECT id FROM subscriptions WHERE user_id = ?').get(id);
    if (sub) {
      if (plan !== undefined)
        db.prepare('UPDATE subscriptions SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(plan, id);
      if (credits_remaining !== undefined) {
        const cr = parseInt(credits_remaining, 10);
        if (!isNaN(cr) && cr >= 0)
          db.prepare('UPDATE subscriptions SET credits_remaining = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(cr, id);
      }
    }
  }

  res.json({ ok: true });
});

// ─── GET /api/admin/presentations/all ────────────────────────────────────────
router.get('/presentations/all', authenticateToken, requireAdmin, (req, res) => {
  const { search = '', userId = '', limit = 50, offset = 0 } = req.query;
  const safeLimit  = Math.min(parseInt(limit)  || 50, 200);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);
  const db = getDb();

  const params = [];
  let where = 'WHERE 1=1';
  if (search.trim()) {
    where += ' AND (p.title LIKE ? OR u.name LIKE ? OR u.email LIKE ?)';
    params.push(`%${search.trim()}%`, `%${search.trim()}%`, `%${search.trim()}%`);
  }
  if (userId.trim()) {
    where += ' AND p.user_id = ?';
    params.push(userId.trim());
  }

  const total = db.prepare(`
    SELECT COUNT(*) as n
    FROM presentations p JOIN users u ON u.id = p.user_id
    ${where}
  `).get(...params).n;

  const presentations = db.prepare(`
    SELECT p.id, p.title, p.status, p.aspect_ratio, p.created_at, p.updated_at,
           u.id as user_id, u.name as user_name, u.email as user_email,
           COALESCE(json_array_length(p.slides_data), 0) as slide_count
    FROM presentations p
    JOIN users u ON u.id = p.user_id
    ${where}
    ORDER BY p.updated_at DESC
    LIMIT ? OFFSET ?
  `).all(...params, safeLimit, safeOffset);

  res.json({ presentations, total });
});

// ─── GET /api/admin/presentations/:id/detail ─────────────────────────────────
router.get('/presentations/:id/detail', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const pres = db.prepare(`
    SELECT p.id, p.title, p.status, p.aspect_ratio, p.slide_plan, p.slides_data,
           p.created_at, p.updated_at,
           u.id as user_id, u.name as user_name, u.email as user_email
    FROM presentations p
    JOIN users u ON u.id = p.user_id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!pres) return res.status(404).json({ error: 'Not found' });

  let slides = [];
  let plan = null;
  try { slides = JSON.parse(pres.slides_data || '[]'); } catch {}
  try { plan   = JSON.parse(pres.slide_plan  || 'null'); } catch {}

  // Strip image_data blobs from the slides before sending (too large for admin table)
  const lightSlides = slides.map(({ image_data, ...rest }) => rest);

  res.json({ ...pres, slides_data: lightSlides, slide_plan: plan });
});

// ─── PATCH /api/admin/presentations/:id ──────────────────────────────────────
router.patch('/presentations/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const { title, status } = req.body;
  const pres = db.prepare('SELECT id FROM presentations WHERE id = ?').get(req.params.id);
  if (!pres) return res.status(404).json({ error: 'Not found' });

  if (title !== undefined)
    db.prepare('UPDATE presentations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(title, req.params.id);
  if (status !== undefined && ['chat', 'generating', 'done', 'error'].includes(status))
    db.prepare('UPDATE presentations SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(status, req.params.id);

  res.json({ ok: true });
});

// ─── DELETE /api/admin/presentations/:id ─────────────────────────────────────
router.delete('/presentations/:id', authenticateToken, requireAdmin, (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT id FROM presentations WHERE id = ?').get(req.params.id);
  if (!pres) return res.status(404).json({ error: 'Not found' });
  db.prepare('DELETE FROM presentations WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ─── GET /api/admin/db/tables ────────────────────────────────────────────────
router.get('/db/tables', authenticateToken, requireAdmin, (_req, res) => {
  const db = getDb();
  const tables = ALLOWED_TABLES.map(name => {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all().map(c => ({
      name: c.name, type: c.type, pk: c.pk === 1, notnull: c.notnull === 1,
    }));
    let count = 0;
    try { count = db.prepare(`SELECT COUNT(*) as n FROM ${name}`).get().n; } catch {}
    return { name, columns, count };
  });
  res.json({ tables });
});

// ─── GET /api/admin/db/:table ────────────────────────────────────────────────
router.get('/db/:table', authenticateToken, requireAdmin, (req, res) => {
  const { table } = req.params;
  if (!ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Table not allowed' });

  const { limit = 50, offset = 0, search = '', orderBy = '', orderDir = 'desc' } = req.query;
  const safeLimit  = Math.min(parseInt(limit)  || 50, 500);
  const safeOffset = Math.max(parseInt(offset) || 0, 0);
  const db = getDb();

  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const colNames = columns.map(c => c.name);

  let where = 'WHERE 1=1';
  const params = [];
  if (search.trim()) {
    const textCols = columns
      .filter(c => c.type.toUpperCase().includes('TEXT') || c.type === '')
      .map(c => c.name);
    if (textCols.length > 0) {
      where += ` AND (${textCols.map(c => `${c} LIKE ?`).join(' OR ')})`;
      params.push(...textCols.map(() => `%${search.trim()}%`));
    }
  }

  const safePk   = columns.find(c => c.pk)?.name ?? colNames[0];
  const safeOrder = colNames.includes(orderBy) ? orderBy : safePk;
  const safeDir   = orderDir === 'asc' ? 'ASC' : 'DESC';

  const total = db.prepare(`SELECT COUNT(*) as n FROM ${table} ${where}`).get(...params).n;
  const rows  = db.prepare(
    `SELECT * FROM ${table} ${where} ORDER BY ${safeOrder} ${safeDir} LIMIT ? OFFSET ?`
  ).all(...params, safeLimit, safeOffset);

  res.json({
    rows,
    total,
    columns: columns.map(c => ({ name: c.name, type: c.type, pk: c.pk === 1 })),
  });
});

// ─── PATCH /api/admin/db/:table/:id ──────────────────────────────────────────
router.patch('/db/:table/:id', authenticateToken, requireAdmin, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Table not allowed' });

  const db = getDb();
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const pkCol   = columns.find(c => c.pk)?.name ?? 'id';
  const editableCols = new Set(columns.filter(c => !c.pk).map(c => c.name));

  const updates = Object.entries(req.body).filter(([k]) => editableCols.has(k));
  if (updates.length === 0) return res.status(400).json({ error: 'No valid fields to update' });

  const setClauses = updates.map(([k]) => `${k} = ?`).join(', ');
  db.prepare(`UPDATE ${table} SET ${setClauses} WHERE ${pkCol} = ?`).run(...updates.map(([, v]) => v), id);
  res.json({ ok: true });
});

// ─── DELETE /api/admin/db/:table/:id ─────────────────────────────────────────
router.delete('/db/:table/:id', authenticateToken, requireAdmin, (req, res) => {
  const { table, id } = req.params;
  if (!ALLOWED_TABLES.includes(table)) return res.status(400).json({ error: 'Table not allowed' });

  const db = getDb();
  const columns = db.prepare(`PRAGMA table_info(${table})`).all();
  const pkCol   = columns.find(c => c.pk)?.name ?? 'id';

  db.prepare(`DELETE FROM ${table} WHERE ${pkCol} = ?`).run(id);
  res.json({ ok: true });
});

// ─── GET /api/admin/storage ──────────────────────────────────────────────────
// Reports disk usage for the data volume: raw files on disk, the SQLite
// volume's free/total space, and a per-table breakdown of row counts and
// estimated content size (sum of TEXT/BLOB column lengths).
router.get('/storage', authenticateToken, requireAdmin, (_req, res) => {
  const db = getDb();

  // Files living in the data directory (db file + WAL/SHM siblings + anything else)
  let files = [];
  try {
    files = fs.readdirSync(DATA_DIR).map(name => {
      const full = path.join(DATA_DIR, name);
      const stat = fs.statSync(full);
      return { name, bytes: stat.size, isFile: stat.isFile(), modified_at: stat.mtime };
    });
  } catch {}

  const totalDiskBytes = files.reduce((sum, f) => sum + (f.isFile ? f.bytes : 0), 0);

  // Underlying volume capacity, if statfs is available on this platform
  let volume = null;
  try {
    const s = fs.statfsSync(DATA_DIR);
    volume = {
      totalBytes: s.blocks * s.bsize,
      freeBytes: s.bfree * s.bsize,
      availableBytes: s.bavail * s.bsize,
    };
  } catch {}

  // Per-table row counts + estimated content size (TEXT/BLOB columns only)
  const tables = ALLOWED_TABLES.map(name => {
    const columns = db.prepare(`PRAGMA table_info(${name})`).all();
    const bigCols = columns.filter(c => /TEXT|BLOB|CLOB/i.test(c.type) || c.type === '');

    let count = 0;
    try { count = db.prepare(`SELECT COUNT(*) as n FROM ${name}`).get().n; } catch {}

    let bytes = 0;
    if (bigCols.length > 0) {
      const sumExpr = bigCols.map(c => `COALESCE(LENGTH(${c.name}),0)`).join(' + ');
      try { bytes = db.prepare(`SELECT COALESCE(SUM(${sumExpr}),0) as bytes FROM ${name}`).get().bytes; } catch {}
    }

    return { name, count, bytes };
  });

  res.json({
    dataDir: DATA_DIR,
    dbPath: DB_PATH,
    totalDiskBytes,
    files,
    volume,
    tables,
  });
});

// ─── POST /api/admin/storage/vacuum ──────────────────────────────────────────
// Reclaims disk space left behind by deleted rows by rebuilding the SQLite file.
router.post('/storage/vacuum', authenticateToken, requireAdmin, (_req, res) => {
  const db = getDb();
  try {
    db.exec('VACUUM');
    const sizeBytes = fs.statSync(DB_PATH).size;
    res.json({ ok: true, sizeBytes });
  } catch (err) {
    res.status(500).json({ error: err.message || 'Vacuum failed' });
  }
});

export default router;
