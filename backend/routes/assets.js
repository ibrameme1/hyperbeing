import { Router } from 'express';
import fs from 'fs';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { validateAttachment } from '../middleware/attachments.js';
import { assetUploadLimiter } from '../middleware/rateLimits.js';
import { FileRejected, decodeDataUrl, isDocument } from '../services/fileIngest.js';
import { createAsset, describe, deckAssets, deleteAsset, assetPath } from '../services/assets.js';
import { logger } from '../services/logger.js';

// ─── Asset library routes ───────────────────────────────────────────────────
// Files are uploaded here ONCE, as soon as the user drops them (so a bad file
// is refused immediately, with a reason). Briefs, add-slides requests and
// edits then refer to them by id — the bytes never travel again.

const router = Router();

// Upload one file. Body: { name, data (base64 data URL), category?: 'auto'|'inspiration', presentationId? }
// presentationId puts it straight into that deck's library (add slides / edit).
router.post('/', authenticateToken, assetUploadLimiter, async (req, res) => {
  const { name, data, category = 'auto', presentationId = null } = req.body || {};
  const shapeErr = validateAttachment({ type: 'document', name, data }, { allowDocuments: true });
  if (shapeErr) return res.status(400).json({ error: shapeErr });
  if (!isDocument({ type: 'document', name })) return res.status(400).json({ error: 'Images are attached directly; this library holds documents and data files.' });
  const db = getDb();
  if (presentationId) {
    const pres = db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(String(presentationId), req.user.id);
    if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
    if (deckAssets(pres.id).length >= 20) return res.status(400).json({ error: 'This deck\'s file library is full (20 files). Remove one first.' });
  }
  try {
    const asset = await createAsset({
      userId: req.user.id, name, buf: decodeDataUrl(data),
      category: category === 'inspiration' ? 'inspiration' : 'auto',
      presentationId: presentationId ? String(presentationId) : null,
    });
    res.status(201).json({ asset });
  } catch (err) {
    if (err instanceof FileRejected) return res.status(400).json({ error: err.message });
    logger.error('asset upload failed', { errorMessage: err.message });
    res.status(400).json({ error: 'We couldn\'t read that file. Try re-saving it or uploading a different format.' });
  }
});

// A deck's library: its files + the images attached to its brief.
router.get('/', authenticateToken, (req, res) => {
  const presentationId = String(req.query.presentationId || '');
  const db = getDb();
  const pres = db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(presentationId, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  const first = db.prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`).get(pres.id);
  let stored = [];
  try { stored = JSON.parse(first?.attachments || '[]'); } catch { /* bad json */ }
  // The user's own images (not pictures extracted from files or found online).
  const images = stored.filter(a => a?.data && a.type !== 'document' && !a.source_doc && a.category !== 'web')
    .map(a => ({ name: a.name, category: a.category || null, data: a.data }));
  const web = stored.filter(a => a?.category === 'web').map(a => ({ name: a.subject || a.name, credit: a.credit, license: a.license, source_url: a.source_url }));
  res.json({ assets: deckAssets(pres.id).map(describe), images, web_images: web });
});

// Download the original file (owner only). Always an attachment with a
// neutral type, so a crafted file can never render as a page on our origin.
router.get('/:id/file', authenticateToken, (req, res) => {
  const row = getDb().prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  const p = row && assetPath(row.file);
  if (!p || !fs.existsSync(p)) return res.status(404).json({ error: 'File not found.' });
  const safeName = row.name.replace(/[^\w.\- ()]/g, '_').slice(0, 120);
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename="${safeName}"`);
  res.sendFile(p);
});

router.delete('/:id', authenticateToken, (req, res) => {
  const row = getDb().prepare('SELECT * FROM assets WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!row) return res.status(404).json({ error: 'File not found.' });
  deleteAsset(row);
  res.json({ ok: true });
});

export default router;
