import { Router } from 'express';
import { withCostContext } from '../services/aiCosts.js';
import jwt from 'jsonwebtoken';
import { v4 as uuid } from 'uuid';
import { getDb } from '../database.js';
import { authenticateToken } from '../middleware/auth.js';
import { analyzePresentationStream, generateCompactPlan, suggestTitle, streamNewSlides } from '../services/claudeAgent.js';
import { editSlideImage } from '../services/imageGeneration.js';
import { buildLayeredSlide, slideFiles, loadStoredFile } from '../services/layeredSlide.js';
import { applyLayoutEdit, applyEditOps } from '../services/layoutEdit.js';
import { renderLayoutPreview } from '../services/layoutPreview.js';
import { layoutFiles } from '../services/slideLayout.js';
import { designDeckSystem, editSlideLayout, prewarmLayoutCache } from '../services/layoutAgent.js';
import { buildPptx } from '../services/pptxExport.js';
import * as imageStore from '../services/imageStore.js';
import {
  deductCredits, refundCredits, deductCreditsForEdit, computeAffordableSlides,
  updateLedgerMetadata, getOrCreateSubscription, CREDIT_COSTS, checkTokenBudget,
  suggestPlanForCost, novaInsufficientCredits, previewEditCost, isAdmin,
} from '../services/stripeService.js';
import { validateAttachments } from '../middleware/attachments.js';
import { ingestImages, uploadsFromDocument, splitStored, isDocument, decodeDataUrl, FileRejected, FILE_LIMITS } from '../services/fileIngest.js';
import {
  analyzeSourceMaterial, composeBrief, sourceBriefText, redesignDeckOf, redesignPlanContext,
  attachRedesignSources, slideDatasetsText, applyIntent, rebaseSource,
} from '../services/sourceAnalysis.js';
import { createAsset, loadAssets, deckAssets, attachAssets, assetMaterial, deleteDeckAssets } from '../services/assets.js';
import { findWebImage, WEB_IMAGES_ENABLED, MAX_WEB_IMAGES_PER_DECK } from '../services/webImages.js';
import { assertPublicUrl } from '../services/urlGuard.js';
import { validate, isString, isOptionalString, isEnum, isArray, isIntBetween } from '../middleware/validate.js';
import { createPresentationLimiter, addSlidesLimiter, analyzeLimiter } from '../middleware/rateLimits.js';
import { logger, requestContext } from '../services/logger.js';
import { tracer } from '../services/tracer.js';
import { sendPresentationReady } from '../services/emailService.js';

// Max number of prior versions kept per slide for the version history panel
const MAX_SLIDE_VERSIONS = 10;

// Builds the persisted image fields for a slide from a freshly generated image.
// Real raster images are written to the on-disk image store and referenced by
// an authed URL; svg placeholders / nulls pass through inline so the
// isPlaceholderImage() checks (and mock mode) keep working. Images no longer
// live as multi-MB base64 inside the presentations row (GAPS #7).
function storeSlideImage(presentationId, slideIndex, imageData) {
  const file = imageStore.saveDataUrl(imageData);
  if (!file) return { image_data: imageData ?? null, image_file: null };
  return { image_data: slideImageUrl(presentationId, slideIndex, file), image_file: file };
}

// ─── Layered slides: shared deck context ────────────────────────────────────
// Every layered-slide build needs the same context: outline header, the deck's
// design system (shared style block / fonts / palette — the consistency
// anchor across slides), the original brief (exact copy + art direction) and
// the user's uploaded images (references). Decks created before layered
// slides have no design system yet; one is generated on first use and saved
// into slide_plan.design so every later slide matches.
const FALLBACK_DECK_DESIGN = {
  style_block: '',
  fonts: { display: 'Inter', body: 'Inter' },
  palette: { background: '#000000', text: '#FFFFFF', accent: '#FF2E74' },
};

async function ensureDeckDesign({ db, presentationId, header, slides, brief, uploads, userId, pending = null }) {
  if (header?.design) return header.design;
  let design;
  try {
    // `pending` = a design call already started (runFullFlow kicks it off the
    // moment the outline header streams in, overlapping the rest of the plan).
    design = (pending && await pending.catch(() => null)) || await designDeckSystem({ header, slides, brief, uploads, userId });
  } catch (err) {
    logger.error('deck design failed — using fallback design system', { presentationId, errorMessage: err.message });
    design = FALLBACK_DECK_DESIGN;
  }
  // Persist into slide_plan so later slides (retry/add/unlock) reuse it.
  const row = db.prepare('SELECT slide_plan FROM presentations WHERE id = ?').get(presentationId);
  let plan = {};
  try { plan = JSON.parse(row?.slide_plan || '{}'); } catch {}
  db.prepare('UPDATE presentations SET slide_plan = ? WHERE id = ?').run(JSON.stringify({ ...plan, design }), presentationId);
  return design;
}

async function loadDeckContext(db, pres, userId) {
  let plan = {};
  try { plan = JSON.parse(pres.slide_plan || '{}'); } catch {}
  let slides = [];
  try { slides = JSON.parse(pres.slides_data || '[]'); } catch {}
  const firstUserMsg = db
    .prepare(`SELECT content, attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
    .get(pres.id);
  let uploads = [];
  try { uploads = JSON.parse(firstUserMsg?.attachments || '[]').filter(a => a?.data); } catch {}
  const header = {
    presentation_title: plan.presentation_title || pres.title,
    theme: plan.theme,
    register: plan.register,
    color_palette: plan.color_palette || {},
    design: plan.design,
  };
  // The analyzed source pack (files attached to the brief) is folded into the
  // brief, so retries / unlocks / added slides see the same facts and data.
  const brief = composeBrief(firstUserMsg?.content || header.presentation_title || '', plan.source);
  const deckDesign = await ensureDeckDesign({ db, presentationId: pres.id, header, slides, brief, uploads, userId });
  return {
    header, deckDesign, brief, uploads,
    aspectRatio: pres.aspect_ratio || '16:9',
    siblingTitles: [...slides].sort((a, b) => a.index - b.index).map(s => s.title).filter(Boolean),
  };
}

// The outline fields a locked slide keeps server-side so it can be built later.
function outlineOf(slide) {
  return {
    slide_index: slide.index, type: slide.type, title: slide.title,
    subtitle: slide.subtitle ?? null, key_points: slide.key_points || [], speaker_note: slide.speaker_note || '',
    // The outline's visual direction for the slide (developed by the layout call).
    ...(slide.visual ? { visual: slide.visual } : {}),
    // From the user's files (redesign / data): needed when the slide is built later.
    ...(slide.source_slide ? { source_slide: slide.source_slide } : {}),
    ...(slide.source_doc ? { source_doc: slide.source_doc } : {}),
    ...(slide.source_content ? { source_content: slide.source_content } : {}),
    ...(slide.source_data ? { source_data: slide.source_data } : {}),
    ...(Array.isArray(slide.uploads) ? { uploads: slide.uploads } : {}),
  };
}

// ─── Files attached to briefs / add-slides / edits ─────────────────────────
// Documents are uploaded once to the asset library (routes/assets.js) and
// referenced by id; images still travel inline (they're small and become the
// deck's upload:N references). This assembles everything a request brings:
//   uploads   = the user's images, then pictures extracted from the files
//               (appended AFTER, so the user's upload:N indices never shift)
//   documents = file descriptions (digest, deck structure, tables)
//   pdfs      = PDF bytes, read from disk only when Claude must read them
// Throws FileRejected (user-facing) for a bad file.
async function gatherBriefFiles({ userId, attachments = [], assetIds = [], presentationId = null, withPdfs = true }) {
  const images = attachments.filter(a => !isDocument(a));
  const userImages = await ingestImages(images);
  // Old clients may still send documents inline: they become assets too.
  const ids = Array.isArray(assetIds) ? assetIds.map(String) : [];
  for (const d of attachments.filter(isDocument)) {
    const asset = await createAsset({ userId, name: d.name, buf: decodeDataUrl(d.data), category: d.category === 'inspiration' ? 'inspiration' : 'auto' });
    ids.push(asset.id);
  }
  if (ids.length > FILE_LIMITS.maxDocuments) throw new FileRejected(`Too many files (max ${FILE_LIMITS.maxDocuments} per brief).`);
  const rows = loadAssets(userId, ids, { presentationId });
  if (rows.length !== new Set(ids).size) throw new FileRejected('One of your files is no longer available. Please attach it again.');
  const documents = []; const pdfs = []; const extracted = [];
  for (const row of rows) {
    const m = assetMaterial(row);
    documents.push(m.doc);
    if (withPdfs && m.pdf) pdfs.push(m.pdf);
    extracted.push(...uploadsFromDocument(m.doc, m.images, { assetId: row.id, room: FILE_LIMITS.maxExtractedImages - extracted.length }));
  }
  return { userImages, uploads: [...userImages, ...extracted], documents, pdfs, assetIds: rows.map(r => r.id) };
}

const fileErrorResponse = (res, err) => {
  if (err instanceof FileRejected) return res.status(400).json({ error: err.message });
  logger.error('attachment processing failed', { errorMessage: err.message });
  return res.status(400).json({ error: 'We couldn\'t read one of your files. Try re-saving it or uploading a different format.' });
};

// Appends images to the deck's stored uploads (the brief message's
// attachments), so every later call resolves upload:N to the same picture.
// Returns the new images' upload indices (null for any past the cap).
// Synchronous read-modify-write: safe in this single-process app.
function appendDeckUploads(db, presentationId, images) {
  if (!images.length) return [];
  const row = db.prepare(`SELECT id, attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`).get(presentationId);
  if (!row) return images.map(() => null);
  let stored = [];
  try { stored = JSON.parse(row.attachments || '[]'); } catch { /* bad json */ }
  let count = splitStored(stored).uploads.length;
  const indices = images.map(img => {
    if (count >= FILE_LIMITS.maxDeckUploads) return null;
    stored.push(img);
    return count++;
  });
  db.prepare('UPDATE messages SET attachments = ? WHERE id = ?').run(JSON.stringify(stored), row.id);
  return indices;
}

/**
 * Library files picked for an add-slides request or an edit: their pictures
 * join the deck's uploads (once), and Claude reads the files again with THIS
 * request in mind (PDFs in full; cached for repeat reads). Returns
 * { text, uploadIndices }.
 */
async function readLibraryFiles({ db, presentationId, userId, assetIds, request }) {
  const rows = loadAssets(userId, assetIds, { presentationId });
  if (!rows.length) return { text: '', uploadIndices: [] };
  const row = db.prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`).get(presentationId);
  let stored = [];
  try { stored = JSON.parse(row?.attachments || '[]'); } catch { /* bad json */ }
  const deckUploads = splitStored(stored).uploads;
  const uploadIndices = []; const documents = []; const pdfs = []; const fresh = [];
  for (const r of rows) {
    const m = assetMaterial(r);
    documents.push({ ...m.doc, purpose: m.doc.purpose === 'inspiration' ? 'inspiration' : 'content' });
    if (m.pdf) pdfs.push(m.pdf);
    const have = deckUploads.map((u, i) => (u.source_asset === r.id ? i : -1)).filter(i => i >= 0);
    if (have.length) uploadIndices.push(...have);
    else fresh.push(...uploadsFromDocument(m.doc, m.images, { assetId: r.id, room: 6 }));
  }
  uploadIndices.push(...appendDeckUploads(db, presentationId, fresh).filter(i => i !== null));
  const allUploads = splitStored(JSON.parse(db.prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`).get(presentationId)?.attachments || '[]')).uploads;
  const source = await analyzeSourceMaterial({ brief: request, documents, pdfs, uploads: allUploads, userId });
  return { text: sourceBriefText(source), uploadIndices: [...new Set(uploadIndices)].slice(0, 8) };
}

function slideImageUrl(presentationId, slideIndex, file) {
  return `/api/presentations/${presentationId}/slides/${slideIndex}/image?f=${file}`;
}

function versionImageUrl(presentationId, slideIndex, versionId) {
  return `/api/presentations/${presentationId}/slides/${slideIndex}/versions/${versionId}/image`;
}

// Moves the slide's outgoing image FILE into version history (most recent
// first), pruned to MAX_SLIDE_VERSIONS. The version reuses the same physical
// file the slide had, so nothing is re-encoded or duplicated. Layered slides
// also store their outgoing LAYOUT, so a restore brings back every editable
// layer; its layer files are shared with the slide / other versions, so pruning
// only deletes files nothing else references (`keepFiles` = the slide's
// current files). Returns the metadata stubs for slides_data
// ({id, instruction, created_at} — never image bytes).
function pushSlideVersion(db, presentationId, slideIndex, outgoingImageFile, instruction, outgoingLayout = null, keepFiles = []) {
  if (imageStore.isStoredFilename(outgoingImageFile)) {
    // image_data '' (not omitted / NULL) — legacy tables declared it NOT NULL.
    db.prepare(
      "INSERT INTO slide_versions (id, presentation_id, slide_index, image_file, image_data, instruction, layout) VALUES (?, ?, ?, ?, '', ?, ?)"
    ).run(uuid(), presentationId, slideIndex, outgoingImageFile, instruction, outgoingLayout ? JSON.stringify(outgoingLayout) : null);
    // Prune everything past the newest MAX_SLIDE_VERSIONS.
    const pruned = db.prepare(
      `SELECT id, image_file, layout FROM slide_versions
        WHERE presentation_id = ? AND slide_index = ?
        ORDER BY created_at DESC, rowid DESC LIMIT -1 OFFSET ?`
    ).all(presentationId, slideIndex, MAX_SLIDE_VERSIONS);
    for (const row of pruned) db.prepare('DELETE FROM slide_versions WHERE id = ?').run(row.id);
    if (pruned.length) {
      const stillUsed = new Set([...keepFiles, ...versionFiles(db, presentationId, slideIndex)]);
      for (const row of pruned) {
        for (const f of [row.image_file, ...layoutFilesOf(row.layout)]) if (f && !stillUsed.has(f)) imageStore.remove(f);
      }
    }
  }
  return listSlideVersionMeta(db, presentationId, slideIndex);
}

function layoutFilesOf(json) {
  if (!json) return [];
  try { return layoutFiles(JSON.parse(json)); } catch { return []; }
}

// Every file the version history of a slide (or a whole deck when slideIndex
// is null) still references.
function versionFiles(db, presentationId, slideIndex = null) {
  const rows = slideIndex === null
    ? db.prepare('SELECT image_file, layout FROM slide_versions WHERE presentation_id = ?').all(presentationId)
    : db.prepare('SELECT image_file, layout FROM slide_versions WHERE presentation_id = ? AND slide_index = ?').all(presentationId, slideIndex);
  const out = new Set();
  for (const r of rows) for (const f of [r.image_file, ...layoutFilesOf(r.layout)]) if (f) out.add(f);
  return out;
}

function listSlideVersionMeta(db, presentationId, slideIndex) {
  return db.prepare(
    'SELECT id, instruction, created_at FROM slide_versions WHERE presentation_id = ? AND slide_index = ? ORDER BY created_at DESC, rowid DESC'
  ).all(presentationId, slideIndex);
}

const VALID_ASPECT_RATIOS = ['16:9', '9:16', '1:1', '4:3'];

const router = Router();

// Attributes every AI call made while handling this request — including the
// detached background job it starts — to the user, deck and operation
// (services/aiCosts.js → ai_costs table).
function costScope(operation) {
  return (req, res, next) => withCostContext({ userId: req.user?.id, presentationId: req.params.id, operation }, next);
}

// In-memory SSE client registry: presentationId → Set<res>
const sseRegistry = new Map();

// User-level SSE registry for dashboard real-time updates: userId → Set<res>
const userSseRegistry = new Map();

function broadcast(presentationId, event) {
  const clients = sseRegistry.get(presentationId);
  if (!clients || clients.size === 0) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch { /* client disconnected */ }
  });
}

// Broadcast a dashboard-level update to all of a user's open dashboard tabs.
// Reads the latest presentation row from DB and sends it as a 'presentation_updated' event.
function broadcastDashboardUpdate(db, userId, presentationId) {
  const clients = userSseRegistry.get(String(userId));
  if (!clients || clients.size === 0) return;
  const row = db.prepare(
    'SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at FROM presentations WHERE id = ? AND user_id = ?'
  ).get(presentationId, userId);
  if (!row) return;
  const payload = `data: ${JSON.stringify({ type: 'presentation_updated', presentation: row })}\n\n`;
  clients.forEach(res => {
    try { res.write(payload); } catch {}
  });
}

// ─── Fetch URL content for use as brief context ───────────────────────────────
router.post('/fetch-url', authenticateToken, async (req, res) => {
  const { url } = req.body;
  if (!url || typeof url !== 'string' || url.length > 2000) {
    return res.status(400).json({ error: 'Valid URL required' });
  }

  try {
    // SSRF guard: hostname must resolve to a public address, http(s) only,
    // standard ports only. Redirects are followed manually so every hop is
    // re-validated — otherwise a public URL could 302 to an internal one.
    let currentUrl = url;
    let response;
    for (let hop = 0; hop < 4; hop++) {
      await assertPublicUrl(currentUrl);
      response = await fetch(currentUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (compatible; HyperBeing/1.0; +https://hyperbeing.co)' },
        signal: AbortSignal.timeout(12000),
        redirect: 'manual',
      });
      if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
        currentUrl = new URL(response.headers.get('location'), currentUrl).href;
        continue;
      }
      break;
    }

    if (response.status >= 300 && response.status < 400) {
      return res.status(400).json({ error: 'Too many redirects' });
    }
    if (!response.ok) {
      return res.status(400).json({ error: `Site returned ${response.status}` });
    }

    const html = await response.text();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<head[\s\S]*?<\/head>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/\s{2,}/g, ' ')
      .trim()
      .slice(0, 8000);

    const domain = new URL(url).hostname;
    logger.info('url fetched', { domain, chars: text.length });
    res.json({ url, domain, content: text });
  } catch (err) {
    logger.warn('url fetch failed', { url, errorMessage: err.message });
    res.status(400).json({ error: 'Could not read that URL. The site may block automated requests.' });
  }
});

// ─── List presentations ────────────────────────────────────────────────────
router.get('/', authenticateToken, (req, res) => {
  // has_thumbnail instead of the base64 image itself — a power user's list was
  // tens of MB per load. The image is served by GET /:id/thumbnail below.
  const rows = getDb()
    .prepare(
      `SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at
       FROM presentations WHERE user_id = ? ORDER BY updated_at DESC`
    )
    .all(req.user.id);

  // Prevent the browser from caching user-specific data across sessions.
  // Without this, a browser that cached user X's response would serve it
  // to user Y (different Authorization token, same URL, no Vary header).
  res.setHeader('Cache-Control', 'no-store');

  res.json({ presentations: rows });
});

// ─── Dashboard SSE: real-time presentation list updates ───────────────────
router.get('/dashboard-events', authenticateToken, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const userId = String(req.user.id);
  if (!userSseRegistry.has(userId)) userSseRegistry.set(userId, new Set());
  userSseRegistry.get(userId).add(res);

  // Send current list immediately on connect so the dashboard always has fresh data
  const rows = getDb()
    .prepare('SELECT id, title, status, (thumbnail IS NOT NULL) AS has_thumbnail, adding_slides, created_at, updated_at FROM presentations WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user.id);
  res.write(`data: ${JSON.stringify({ type: 'snapshot', presentations: rows })}\n\n`);

  const heartbeat = setInterval(() => {
    try { res.write(': heartbeat\n\n'); } catch {}
  }, 25000);

  req.on('close', () => {
    clearInterval(heartbeat);
    userSseRegistry.get(userId)?.delete(res);
    if (userSseRegistry.get(userId)?.size === 0) userSseRegistry.delete(userId);
  });
});

// ─── Thumbnail image (referenced by dashboard cards via <img src>) ─────────
// <img> tags can't send an Authorization header, so — like the SSE routes —
// this accepts the JWT as a ?token= query param. Access tokens live 15 min,
// which bounds how long a leaked URL stays useful.
router.get('/:id/thumbnail', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }

  const db = getDb();
  const pres = isAdmin(userId)
    ? db.prepare('SELECT thumbnail FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT thumbnail FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!pres?.thumbnail) return res.status(404).end();

  // thumbnail column holds the filename of the first slide's stored image.
  // (Legacy rows may still hold a base64 data URL until the migration runs.)
  const filePath = imageStore.pathFor(pres.thumbnail);
  if (filePath) {
    res.setHeader('Content-Type', imageStore.mimeFor(pres.thumbnail));
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.sendFile(filePath);
  }
  const match = /^data:([^;]+);base64,(.*)$/.exec(pres.thumbnail);
  if (!match) return res.status(404).end();
  res.setHeader('Content-Type', match[1]);
  res.setHeader('Cache-Control', 'private, max-age=300');
  res.send(Buffer.from(match[2], 'base64'));
});

// ─── Slide image (authed, ?token= like the thumbnail — <img> can't send headers) ─
// ─── A layered slide's layer image (authed) ───────────────────────────────────
// Backgrounds, elements, icons and logos of layered slides. JWT via ?token=
// like the other image routes (<img> can't send headers). A file is served
// only if this presentation's slides_data actually references it.
router.get('/:id/assets/:file', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try { ({ userId } = jwt.verify(token, process.env.JWT_SECRET)); } catch { return res.status(401).end(); }
  const { file } = req.params;
  if (!imageStore.isStoredFilename(file)) return res.status(404).end();
  const db = getDb();
  const pres = isAdmin(userId)
    ? db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!pres?.slides_data || !pres.slides_data.includes(`"${file}"`)) return res.status(404).end();
  const filePath = imageStore.pathFor(file);
  if (!filePath) return res.status(404).end();
  res.setHeader('Content-Type', imageStore.mimeFor(file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// ─── Export as PowerPoint (.pptx) ──────────────────────────────────────────
// Layered slides become native, editable PowerPoint objects (text boxes,
// pictures per element, shapes, real charts); legacy flat slides become a
// full-slide picture. Free-plan exports carry the same "Made with
// HyperBeing" watermark as PDF/PNG exports. Exporting is free (CREDIT_COSTS.EXPORT).
router.get('/:id/export/pptx', authenticateToken, async (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  const plan = isAdmin(req.user.id) ? 'admin' : getOrCreateSubscription(req.user.id)?.plan;
  try {
    const { buffer, slides, ms } = await buildPptx(pres, { watermark: plan === 'free' });
    if (!slides) return res.status(400).json({ error: 'There are no finished slides to export yet.' });
    logger.info('pptx exported', { presentationId: pres.id, slides, ms, bytes: buffer.length });
    const name = (pres.title || 'Presentation').replace(/[^\w\s.-]+/g, '').trim().slice(0, 80) || 'Presentation';
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${name}.pptx"`);
    res.send(buffer);
  } catch (err) {
    logger.error('pptx export failed', { presentationId: pres.id, errorMessage: err.message });
    res.status(500).json({ error: 'We couldn\'t build the PowerPoint file. Please try again.' });
  }
});

router.get('/:id/slides/:index/image', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try { ({ userId } = jwt.verify(token, process.env.JWT_SECRET)); } catch { return res.status(401).end(); }

  const db = getDb();
  const pres = isAdmin(userId)
    ? db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!pres?.slides_data) return res.status(404).end();

  const targetIndex = parseInt(req.params.index, 10);
  let slides = [];
  try { slides = JSON.parse(pres.slides_data); } catch {}
  const slide = slides.find(s => s.index === targetIndex);
  // image_file is authoritative — the ?f= in the URL is only a cache-buster.
  const filePath = slide?.image_file ? imageStore.pathFor(slide.image_file) : null;
  if (!filePath) {
    // Legacy inline data URL (pre-migration) — serve it directly.
    const m = /^data:([^;]+);base64,(.*)$/.exec(slide?.image_data || '');
    if (m) { res.setHeader('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
    return res.status(404).end();
  }
  res.setHeader('Content-Type', imageStore.mimeFor(slide.image_file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// ─── A saved version's image (authed) ─────────────────────────────────────────
router.get('/:id/slides/:index/versions/:versionId/image', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();
  let userId;
  try { ({ userId } = jwt.verify(token, process.env.JWT_SECRET)); } catch { return res.status(401).end(); }

  const db = getDb();
  const owned = isAdmin(userId)
    ? db.prepare('SELECT id FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!owned) return res.status(404).end();

  const v = db.prepare('SELECT image_file, image_data FROM slide_versions WHERE id = ? AND presentation_id = ? AND slide_index = ?')
    .get(req.params.versionId, req.params.id, parseInt(req.params.index, 10));
  const filePath = v?.image_file ? imageStore.pathFor(v.image_file) : null;
  if (!filePath) {
    const m = /^data:([^;]+);base64,(.*)$/.exec(v?.image_data || '');
    if (m) { res.setHeader('Content-Type', m[1]); return res.send(Buffer.from(m[2], 'base64')); }
    return res.status(404).end();
  }
  res.setHeader('Content-Type', imageStore.mimeFor(v.image_file));
  res.setHeader('Cache-Control', 'private, max-age=31536000, immutable');
  res.sendFile(filePath);
});

// ─── Analyze brief and return contextual questions ─────────────────────────
router.post('/analyze', authenticateToken, costScope('analyze'), analyzeLimiter, async (req, res) => {
  const { message, attachments = [], asset_ids: assetIds = [] } = req.body;
  if (!message?.trim() && attachments.length === 0 && !assetIds.length) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  if (typeof message !== 'undefined' && typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }
  if (message && message.length > 50_000) {
    return res.status(400).json({ error: 'Message too long (max 50,000 characters)' });
  }
  if (!Array.isArray(assetIds)) return res.status(400).json({ error: 'asset_ids must be an array' });
  const attachmentsErr = validateAttachments(attachments, FILE_LIMITS.maxImages + FILE_LIMITS.maxDocuments, 'attachments', { allowDocuments: true });
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }
  let files;
  try { files = await gatherBriefFiles({ userId: req.user.id, attachments, assetIds, presentationId: null }); } catch (err) {
    return fileErrorResponse(res, err);
  }

  const webSearch = req.body.webSearch === true;

  // Stream over SSE so the client can show live progress (reading files, web searches).
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  const send = (ev) => res.write(`data: ${JSON.stringify(ev)}\n\n`);

  try {
    // 1. Claude reads the files FIRST (the only time they're read for this
    //    brief: the pack is saved and the create call reuses it), so the
    //    follow-up questions are asked about what the files actually say.
    let source = null; let sourceId = null;
    if (files.documents.length) {
      send({ type: 'reading_files', files: files.documents.map(d => d.name) });
      source = await analyzeSourceMaterial({ brief: message || '', documents: files.documents, pdfs: files.pdfs, uploads: files.uploads, userId: req.user.id });
      sourceId = uuid();
      getDb().prepare('INSERT INTO source_analyses (id, user_id, asset_ids, user_image_count, source) VALUES (?, ?, ?, ?, ?)')
        .run(sourceId, req.user.id, JSON.stringify([...files.assetIds].sort()), files.userImages.length, JSON.stringify(source));
      send({ type: 'files_read', redesign_file: source?.redesign_file || '' });
    }
    // 2. Questions, informed by the analysis (never asking what the files answer).
    const filesNote = source
      ? `\n\nTHE USER ATTACHED FILES, ALREADY ANALYZED (ask sharper questions from them; never ask for anything they already answer)${source.redesign_file ? `. The user wants "${source.redesign_file}" redesigned: ask about the redesign (audience, tone, what to emphasise), not about its content` : ''}:\n${sourceBriefText(source)}`
      : '';
    const analysis = await analyzePresentationStream(`${message || ''}${filesNote}`, files.userImages, req.user.id, { webSearch, onEvent: send });
    send({ type: 'done', analysis, source_id: sourceId });
    res.end();
  } catch (err) {
    logger.error('analysis failed', { errorMessage: err.message });
    send({ type: 'error', error: 'Brief analysis failed. Please try again — if the problem persists, try shortening your description.' });
    res.end();
  }
});

// ─── Create presentation + kick off async full flow ───────────────────────
router.post('/', authenticateToken, costScope('deck_create'), createPresentationLimiter, async (req, res) => {
  // `style` (classic / minimalistic) is gone: one design system, where Claude
  // picks each deck's look from the brief. Old clients may still send it; it
  // is ignored.
  const { message, attachments = [], aspectRatio = '16:9', asset_ids: assetIds = [], source_id: sourceId = null } = req.body;
  if (!message?.trim() && attachments.length === 0 && !(Array.isArray(assetIds) && assetIds.length)) {
    return res.status(400).json({ error: 'Message or attachment required' });
  }
  if (!Array.isArray(assetIds)) return res.status(400).json({ error: 'asset_ids must be an array' });
  if (typeof message !== 'undefined' && typeof message !== 'string') {
    return res.status(400).json({ error: 'Message must be a string' });
  }
  if (message && message.length > 50_000) {
    return res.status(400).json({ error: 'Message too long (max 50,000 characters)' });
  }
  const attachmentsErr = validateAttachments(attachments, FILE_LIMITS.maxImages + FILE_LIMITS.maxDocuments, 'attachments', { allowDocuments: true });
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
  if (!VALID_ASPECT_RATIOS.includes(aspectRatio)) {
    return res.status(400).json({ error: `Invalid aspect ratio. Must be one of: ${VALID_ASPECT_RATIOS.join(', ')}` });
  }
  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  // Files were validated + extracted when uploaded (asset library); images
  // are validated here. A bad file is a plain 400 with a reason, before
  // anything is created. PDFs are not loaded here: the analysis done during
  // the question step is reused, and only re-run if it's missing.
  let files;
  try { files = await gatherBriefFiles({ userId: req.user.id, attachments, assetIds, presentationId: null, withPdfs: false }); } catch (err) {
    return fileErrorResponse(res, err);
  }
  // The source pack from /analyze, if it covers exactly these files.
  let source = null;
  if (sourceId && files.assetIds.length) {
    const row = getDb().prepare('SELECT * FROM source_analyses WHERE id = ? AND user_id = ?').get(String(sourceId), req.user.id);
    if (row && row.asset_ids === JSON.stringify([...files.assetIds].sort())) {
      try { source = rebaseSource(JSON.parse(row.source), files.userImages.length - row.user_image_count); } catch { source = null; }
    }
  }
  const webSearch = req.body.webSearch === true;

  // Credits are deducted in runFullFlow() once Claude returns the final
  // slide count — at PER_SLIDE credits per slide, with any unaffordable
  // slides returned as locked placeholders rather than blocking creation.

  const db = getDb();
  const id = uuid();
  const msgId = uuid();

  db.prepare(
    `INSERT INTO presentations (id, user_id, title, status, aspect_ratio, style)
     VALUES (?, ?, 'Untitled Presentation', 'processing', ?, ?)`
  ).run(id, req.user.id, aspectRatio, 'auto'); // style column kept (append-only schema); always 'auto' now

  db.prepare(
    `INSERT INTO messages (id, presentation_id, role, content, attachments)
     VALUES (?, ?, 'user', ?, ?)`
  ).run(msgId, id, message || '', JSON.stringify([
    ...files.uploads,
    // Stubs only: the file content lives in the asset library.
    ...files.documents.map(d => ({ type: 'document', asset_id: d.asset_id, name: d.name, kind: d.kind })),
  ]));
  attachAssets(files.assetIds, id);

  // Respond immediately — Claude planning + image generation run async
  res.status(201).json({
    presentation: db.prepare('SELECT * FROM presentations WHERE id = ?').get(id),
  });

  // Notify dashboard subscribers that a new presentation appeared
  broadcastDashboardUpdate(db, req.user.id, id);

  const userId = req.user.id;
  const _traceId = requestContext.getStore()?.requestId;
  withCostContext({ presentationId: id }, () => runFullFlow(id, message || '', userId, _traceId, { source, webSearch })).catch(err => {
    logger.error('slide flow failed', { errorMessage: err.message, stack: err.stack?.split('\n').slice(0,4).join('\n') });
    broadcast(id, { type: 'error', message: err.message });
    const errDb = getDb();
    errDb.prepare(`UPDATE presentations SET status = 'error', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(id);
    broadcastDashboardUpdate(errDb, userId, id);
  });
});

async function runFullFlow(presentationId, message, userId = null, traceId = null, { source: preSource = null, webSearch = false } = {}) {
  const db = getDb();
  const _t = Date.now();
  tracer.recordStep(traceId, 'full_flow', 'started', 0);

  broadcast(presentationId, { type: 'plan_generating' });

  const presRow = db.prepare('SELECT aspect_ratio FROM presentations WHERE id = ?').get(presentationId);
  const aspectRatio = presRow?.aspect_ratio || '16:9';
  // Prefer the persisted style (source of truth) but fall back to the argument.

  const firstUserMsg = db
    .prepare(`SELECT attachments FROM messages WHERE presentation_id = ? AND role = 'user' ORDER BY created_at ASC LIMIT 1`)
    .get(presentationId);
  let userAttachments = [];
  try { userAttachments = JSON.parse(firstUserMsg?.attachments || '[]'); } catch {}
  // allImages = every image upload, in stored order (UPLOAD N indices): the
  // user's own images first, then pictures extracted from their files.
  const { uploads: allImages } = splitStored(userAttachments);
  const userImages = allImages.filter(a => !a.source_doc);
  const materials = deckAssets(presentationId).map(assetMaterial);

  // ── Phase 0: the user's files (PDF / PPTX / XLSX / DOCX / CSV / text) ──────
  // Normally Claude already read them while the user answered the questions
  // (/analyze) and that source pack is reused. Only if it's missing (an old
  // client, an expired analysis) are they read here, once.
  let source = preSource;
  if (!source && materials.length) {
    broadcast(presentationId, { type: 'source_analyzing', files: materials.map(m => m.doc.name) });
    source = await analyzeSourceMaterial({ brief: message, documents: materials.map(m => m.doc), pdfs: materials.map(m => m.pdf).filter(Boolean), uploads: allImages, userId });
  }
  // No toggle: Claude decided from the brief whether a deck is to be
  // redesigned (redesign_file) or only used as material — or both.
  const documents = applyIntent(materials.map(m => m.doc), source);
  if (source || webSearch) {
    db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`).run(JSON.stringify({ ...(source ? { source } : {}), web_search: webSearch }), presentationId);
  }
  const brief = composeBrief(message, source);
  // A redesigned PPTX keeps its structure (one slide per visible slide) and
  // content; every slide is rebuilt at the quality-library bar.
  const redesignDoc = redesignDeckOf(documents);
  const redesign = redesignDoc ? redesignPlanContext(redesignDoc) : null;

  const slidePromises = [];
  const completedSlides = new Map();

  function persistProgress() {
    // Merge with current DB state so user-edited slides (_edited: true) are never overwritten
    const current = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presentationId);
    let dbSlides = [];
    try { dbSlides = JSON.parse(current?.slides_data || '[]'); } catch {}
    const dbByIndex = new Map(dbSlides.map(s => [s.index, s]));
    // Apply in-memory completed slides, but skip slots marked _edited in DB
    for (const [idx, slide] of completedSlides) {
      if (dbByIndex.get(idx)?._edited) continue; // preserve user edit
      dbByIndex.set(idx, slide);
    }
    const sorted = [...dbByIndex.values()].sort((a, b) => a.index - b.index);
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(sorted), presentationId);
  }

  // ── Phase 1: streaming outline — each slide row appears as it arrives ─────────
  let headerBroadcast = false;
  const slides = [];
  let pendingDeckDesign = null;

  const { header } = await generateCompactPlan(message, userImages, userId, {
    onHeader(h) {
      // As soon as we know the total count, switch the frontend to plan_reveal
      broadcast(presentationId, { type: 'plan_started', total_slides: h.total_slides || 0 });
      headerBroadcast = true;
      // Start the deck design system now, in parallel with the rest of the
      // outline streaming — it only needs the header + brief, and it is on the
      // critical path of every slide.
      pendingDeckDesign = designDeckSystem({ header: h, slides: [], brief, uploads: allImages, userId });
      pendingDeckDesign.catch(() => {}); // awaited (and failure-handled) in ensureDeckDesign
      // Warm the slide-layout prompt cache so the parallel slide layouts read
      // it instead of each writing it. It starts right AFTER deck design: both
      // share the ~24k-token quality library (libraryTools()), so deck design
      // writes it once and the warm-up reads it and only writes the layout
      // rules + reference images. Started together, both wrote the library.
      // (This .then is attached before ensureDeckDesign awaits the design, so
      // the warm-up is registered before any slide layout looks for it.)
      if ((h.total_slides || 0) > 1) {
        const warm = () => prewarmLayoutCache({ aspectRatio, userId });
        pendingDeckDesign.then(warm, warm);
      }

      // Persist header message and update status to generating
      db.prepare(`INSERT INTO messages (id, presentation_id, role, content, metadata) VALUES (?, ?, 'assistant', ?, ?)`)
        .run(uuid(), presentationId, h.message || '', JSON.stringify({ state: 'ready', message: h.message }));
      db.prepare(`UPDATE presentations SET title = ?, status = 'generating', updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
        .run(h.presentation_title || 'Untitled Presentation', presentationId);
      broadcastDashboardUpdate(db, userId, presentationId);
    },
    onSlide(slide) {
      slides.push(slide);
      // Broadcast each row immediately as it streams — frontend stagger timer handles animation
      broadcast(presentationId, {
        type: 'plan_slide_streamed',
        slide: { index: slide.index, type: slide.type, title: slide.title, key_points: (slide.key_points || []).slice(0, 2) },
      });
    },
  }, {
    sourceText: sourceBriefText(source),
    redesign: redesign && { ...redesign, slides: redesignDoc.deck.slides.filter(s => !s.hidden) },
    webImages: webSearch && WEB_IMAGES_ENABLED,
  });

  // Give each planned slide what its layout call needs from the files: the
  // original slide (redesign) and the exact data the plan assigned to it.
  if (source || redesignDoc) {
    const enriched = attachRedesignSources(slides, redesignDoc, allImages);
    for (let i = 0; i < slides.length; i++) {
      const data = slideDatasetsText(enriched[i], source);
      slides[i] = data ? { ...enriched[i], source_data: data } : enriched[i];
    }
  }

  // ── Real photos found online (web search on) ──────────────────────────────
  // Runs while the deck design call (started at the header) is in flight.
  // Each photo becomes a slide-scoped upload; its credit goes into the slide's
  // speaker notes. Not found / web search off → the layout describes the
  // subject and the image model generates it.
  if (webSearch && WEB_IMAGES_ENABLED) {
    const wanted = [];
    for (const sl of slides) {
      const w = Array.isArray(sl.web_images) ? sl.web_images[0] : null;
      if (w?.query && wanted.length < MAX_WEB_IMAGES_PER_DECK) wanted.push({ sl, w });
    }
    const found = await Promise.all(wanted.map(({ w }) => findWebImage({ query: w.query, subject: w.subject, userId })));
    const hits = wanted.map((x, i) => ({ ...x, img: found[i] })).filter(x => x.img);
    const indices = appendDeckUploads(db, presentationId, hits.map(({ img }) => ({
      type: 'image', category: 'web', name: img.subject, subject: img.subject, data: img.data, mimeType: img.mimeType,
      credit: img.credit, license: img.license, source_url: img.source_url,
    })));
    hits.forEach(({ sl, img }, i) => {
      const idx = indices[i];
      if (idx === null) return;
      allImages[idx] = { type: 'image', category: 'web', name: img.subject, subject: img.subject, data: img.data, mimeType: img.mimeType, credit: img.credit };
      const pos = slides.indexOf(sl);
      slides[pos] = {
        ...sl,
        uploads: [...(Array.isArray(sl.uploads) ? sl.uploads : []), idx],
        speaker_note: `${sl.speaker_note || ''}${sl.speaker_note ? '\n\n' : ''}Photo credit: ${img.credit}`.trim(),
      };
    });
    if (wanted.length) logger.info('web images', { presentationId, wanted: wanted.length, found: hits.length });
  }

  if (!headerBroadcast) {
    broadcast(presentationId, { type: 'plan_started', total_slides: slides.length });
  }

  // Persist full plan to DB now that all slides are collected
  db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`)
    .run(JSON.stringify({ ...header, ...(source ? { source } : {}), slides }), presentationId);

  // plan_ready used for catch-up replay on reconnect
  broadcast(presentationId, {
    type: 'plan_ready',
    total_slides: slides.length,
    slide_plans: slides.map(s => ({ index: s.index, type: s.type, title: s.title, key_points: (s.key_points || []).slice(0, 2) })),
  });
  broadcast(presentationId, { type: 'started', total_slides: slides.length });

  // ── Credit deduction: PER_SLIDE × affordable slide count, deducted now
  // that Claude has returned the final slide count, but BEFORE any NB2 call.
  const { affordable, locked, plan: userPlan } = computeAffordableSlides(userId, slides.length);
  const sortedByIndex = [...slides].sort((a, b) => a.index - b.index);
  const affordableIndexSet = new Set(sortedByIndex.slice(0, affordable).map(s => s.index));
  const lockedIndexSet = new Set(sortedByIndex.slice(affordable).map(s => s.index));

  const creditsNeeded = locked * CREDIT_COSTS.PER_SLIDE;
  const suggestedPlan = locked > 0 ? suggestPlanForCost(userPlan, creditsNeeded) : null;

  const { ledgerId } = deductCredits(userId, affordable * CREDIT_COSTS.PER_SLIDE, 'create_presentation', 'Generate presentation', {
    presentationId, slidesGenerated: affordable, slidesLocked: locked,
    metadata: { total_slides: slides.length },
  });

  if (locked > 0) {
    broadcast(presentationId, {
      type: 'partial_generation',
      slides_generated: affordable,
      slides_locked: locked,
      credits_needed: creditsNeeded,
      suggested_plan: suggestedPlan,
      upgrade_url: '/pricing',
    });
  }

  const lockedSlidesStore = [];

  // ── Phase 2: deck design system ─────────────────────────────────────────────
  // One short Claude call defines the shared style block, fonts and palette
  // that every layer of every slide is generated against — the consistency
  // anchor that makes separately generated layers look like one designer's.
  const deckDesign = await ensureDeckDesign({
    db, presentationId, header, slides, brief, uploads: allImages, userId, pending: pendingDeckDesign,
  });
  const siblingTitles = [...slides].sort((a, b) => a.index - b.index).map(s => s.title);

  // ── Phase 3: build every affordable slide as layers, all in parallel ────────
  // Per slide: Claude designs the layout → native text appears immediately
  // (slide_layout) → image layers stream in (slide_layer_ready) → visual
  // self-review → slide_ready. Locked slides keep only their outline
  // server-side; their layout is designed when they're unlocked.
  for (const slide of sortedByIndex) {
    if (lockedIndexSet.has(slide.index)) {
      lockedSlidesStore.push(outlineOf(slide));
      const lockedSlide = {
        index: slide.index,
        type: slide.type,
        title: slide.title,
        key_points: (slide.key_points || []).slice(0, 2),
        status: 'locked',
        locked_reason: 'insufficient_credits',
        credits_needed: CREDIT_COSTS.PER_SLIDE,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
        image_data: null,
      };
      completedSlides.set(slide.index, lockedSlide);
      persistProgress();
      // Persist locked_slides immediately so /unlock-slides works as soon as
      // the frontend shows the unlock button.
      db.prepare('UPDATE presentations SET locked_slides = ? WHERE id = ?')
        .run(JSON.stringify(lockedSlidesStore), presentationId);
      broadcast(presentationId, { type: 'slide_locked', slide: lockedSlide });
      continue;
    }

    broadcast(presentationId, { type: 'slide_generating', index: slide.index });

    const promise = buildLayeredSlide({
      presentationId, slide, header, deckDesign, brief, uploads: allImages, userId,
      aspectRatio, siblingTitles,
      onLayout: (layout) => broadcast(presentationId, { type: 'slide_layout', index: slide.index, layout }),
      onLayer: (layer) => broadcast(presentationId, { type: 'slide_layer_ready', index: slide.index, layer }),
    }).then(result => {
      // null = a critical layer (background/hero) or the layout failed —
      // surface a regenerate option and refund, exactly like a failed image.
      if (!result) {
        const errSlide = { ...slide, image_data: null, status: 'error' };
        completedSlides.set(slide.index, errSlide);
        persistProgress();
        refundCredits(userId, CREDIT_COSTS.PER_SLIDE, 'generation_refund', 'Slide generation failed — refunded', presentationId, { slide_index: slide.index });
        broadcast(presentationId, { type: 'slide_error', index: slide.index, message: 'Slide generation failed' });
        return;
      }
      const done = { ...slide, ...result, status: 'complete' };
      completedSlides.set(slide.index, done);
      persistProgress();
      if (slide.index === 0) {
        db.prepare(`UPDATE presentations SET thumbnail = ? WHERE id = ?`).run(done.image_file, presentationId);
        broadcastDashboardUpdate(db, userId, presentationId);
      }
      broadcast(presentationId, { type: 'slide_ready', slide: done });
    }).catch(err => {
      logger.error('layered slide failed', { slideIndex: slide.index, errorMessage: err.message });
      const errSlide = { ...slide, image_data: null, status: 'error' };
      completedSlides.set(slide.index, errSlide);
      persistProgress();
      refundCredits(userId, CREDIT_COSTS.PER_SLIDE, 'generation_refund', 'Slide generation failed — refunded', presentationId, { slide_index: slide.index });
      broadcast(presentationId, { type: 'slide_error', index: slide.index, message: err.message });
    });

    slidePromises.push(promise);
  }

  // Wait for every slide to finish
  await Promise.all(slidePromises);

  // Persist locked-slide prompts server-side (never sent to the frontend) so
  // they can be unlocked later without re-running Claude.
  db.prepare(`UPDATE presentations SET locked_slides = ? WHERE id = ?`)
    .run(JSON.stringify(lockedSlidesStore), presentationId);
  if (ledgerId) {
    updateLedgerMetadata(ledgerId, { locked_slides: lockedSlidesStore });
  }

  // Build final slides: merge DB state (preserving _edited slides) with completedSlides
  const finalRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presentationId);
  let finalDbSlides = [];
  try { finalDbSlides = JSON.parse(finalRow?.slides_data || '[]'); } catch {}
  const finalByIndex = new Map(finalDbSlides.map(s => [s.index, s]));
  for (const [idx, slide] of completedSlides) {
    if (finalByIndex.get(idx)?._edited) continue; // preserve user edit
    finalByIndex.set(idx, slide);
  }
  // Ensure all plan slides are represented (fill any gaps as error)
  for (const slide of slides) {
    if (!finalByIndex.has(slide.index)) {
      finalByIndex.set(slide.index, { ...slide, image_data: null, status: 'error' });
    }
  }
  const allSlides = [...finalByIndex.values()].sort((a, b) => a.index - b.index);

  // Persist final slide_plan with full outline data
  db.prepare(`UPDATE presentations SET slide_plan = ? WHERE id = ?`)
    .run(JSON.stringify({ ...header, ...(source ? { source } : {}), design: deckDesign, slides: allSlides.map(({ image_data, layout, gen_stats, ...rest }) => rest) }), presentationId);

  db.prepare(`UPDATE presentations SET status = 'completed', slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(allSlides), presentationId);
  broadcastDashboardUpdate(db, userId, presentationId);

  if (userId) {
    const _presUser = db.prepare('SELECT name, email FROM users WHERE id = ?').get(userId);
    const _presTitle = db.prepare('SELECT title FROM presentations WHERE id = ?').get(presentationId)?.title;
    if (_presUser?.email) sendPresentationReady(_presUser.name, _presUser.email, presentationId, _presTitle);
  }

  tracer.recordStep(traceId, 'full_flow', 'completed', Date.now() - _t);
  broadcast(presentationId, { type: 'complete', total_slides: allSlides.length });
}

// ─── Get single presentation with messages ────────────────────────────────
router.get('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = isAdmin(req.user.id)
    ? db.prepare('SELECT * FROM presentations WHERE id = ?').get(req.params.id)
    : db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

  const messages = db
    .prepare('SELECT * FROM messages WHERE presentation_id = ? ORDER BY created_at ASC')
    .all(req.params.id);

  let slide_plan = null, slides_data = null;
  try { slide_plan = pres.slide_plan ? JSON.parse(pres.slide_plan) : null; } catch {}
  try { slides_data = pres.slides_data ? JSON.parse(pres.slides_data) : null; } catch {}

  res.json({
    presentation: { ...pres, slide_plan, slides_data },
    messages: messages.map(m => {
      let attachments = [], metadata = {};
      try { attachments = JSON.parse(m.attachments || '[]'); } catch {}
      try { metadata = JSON.parse(m.metadata || '{}'); } catch {}
      return { ...m, attachments, metadata };
    }),
  });
});

// ─── SSE: real-time events (auth via ?token= query param, headers not possible with EventSource)
router.get('/:id/events', (req, res) => {
  const token = req.query.token || req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).end();

  let userId;
  try {
    ({ userId } = jwt.verify(token, process.env.JWT_SECRET));
  } catch {
    return res.status(401).end();
  }

  const user = getDb()
    .prepare('SELECT id FROM users WHERE id = ?')
    .get(userId);
  if (!user) return res.status(401).end();

  const { id } = req.params;

  const ownedPres = getDb()
    .prepare('SELECT id FROM presentations WHERE id = ? AND user_id = ?')
    .get(id, userId);
  const accessiblePres = ownedPres || (isAdmin(userId) && getDb().prepare('SELECT id FROM presentations WHERE id = ?').get(id));
  if (!accessiblePres) return res.status(404).end();

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  res.write(`data: ${JSON.stringify({ type: 'connected' })}\n\n`);

  if (!sseRegistry.has(id)) sseRegistry.set(id, new Set());
  sseRegistry.get(id).add(res);

  // Catch-up: replay current state for clients that connect after events were broadcast
  const db2 = getDb();
  const presState = db2.prepare('SELECT status, slide_plan, slides_data FROM presentations WHERE id = ?').get(id);
  if (presState) {
    if (presState.status === 'processing' || presState.status === 'generating') {
      if (presState.slide_plan) {
        const plan = JSON.parse(presState.slide_plan);
        const totalSlides = plan.total_slides || plan.slides?.length || 0;
        const slidePlans = (plan.slides || []).map(s => ({
          index: s.index, type: s.type, title: s.title, key_points: (s.key_points || []).slice(0, 2),
        }));
        res.write(`data: ${JSON.stringify({ type: 'plan_ready', total_slides: totalSlides, slide_plans: slidePlans })}\n\n`);
      }
      if (presState.slides_data) {
        const doneSlides = JSON.parse(presState.slides_data);
        for (const s of doneSlides) {
          res.write(`data: ${JSON.stringify({ type: 'slide_ready', slide: s })}\n\n`);
        }
      }
    } else if (presState.status === 'completed' && presState.slides_data) {
      const doneSlides = JSON.parse(presState.slides_data);
      for (const s of doneSlides) {
        res.write(`data: ${JSON.stringify({ type: 'slide_ready', slide: s })}\n\n`);
      }
      // Only emit `complete` when every slide is actually finished. An
      // add-slides run leaves freshly-added placeholders in 'generating' while
      // the presentation row is already 'completed'. Emitting `complete` here
      // (e.g. on an EventSource auto-reconnect during the slow add-slides
      // window) makes the client flip those still-generating placeholders to
      // 'error' (see the `complete` handler in PresentationPage) — showing a
      // false failure + regenerate button while the backend is still
      // generating them. Hold the `complete` until they're truly done.
      const stillGenerating = doneSlides.some(s => s.status === 'generating');
      if (!stillGenerating) {
        res.write(`data: ${JSON.stringify({ type: 'complete', total_slides: doneSlides.length })}\n\n`);
      }
    }
  }

  req.on('close', () => {
    sseRegistry.get(id)?.delete(res);
    if (sseRegistry.get(id)?.size === 0) sseRegistry.delete(id);
  });
});

// ─── Regenerate a single slide (user-described edit → direct to Gemini) ──────
router.post('/:id/slides/:index/regenerate', authenticateToken, costScope('slide_edit'), async (req, res) => {
  const { instruction, attachments: reqBodyAttachments = [], asset_ids: editAssetIds = [] } = req.body;
  if (!instruction?.trim()) return res.status(400).json({ error: 'Please describe what you\'d like to change about this slide.' });
  if (!Array.isArray(editAssetIds) || editAssetIds.length > 20) return res.status(400).json({ error: 'asset_ids must be a list of up to 20 files' });
  const attachmentsErr = validateAttachments(reqBodyAttachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });

  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet. Generate your presentation first.' });

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit. Upgrade your plan to continue.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const targetIndex = parseInt(req.params.index, 10);

  // Read slide data at request time just to validate and build the prompt
  const slidesAtRequest = JSON.parse(pres.slides_data);
  const slideForPrompt = slidesAtRequest.find(s => s.index === targetIndex);
  if (!slideForPrompt) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });
  // Layered slides are edited layer-by-layer (layout edits + single-element
  // regeneration). A flat image edit here would flatten the slide and throw
  // away every editable layer, so refuse it — before any credits are charged.
  if (slideForPrompt.layout && slideForPrompt.status === 'generating') {
    return res.status(409).json({ error: 'This slide is still being updated. Try again in a moment.' });
  }

  // pic1 = current rendered slide; pic2, pic3… = anything the user uploaded in the edit bar
  const hasCurrentImage = slideForPrompt.image_data && !slideForPrompt.image_data.startsWith('data:image/svg');
  const userUploads = reqBodyAttachments.filter(a => a.data);
  // Only user-uploaded references count toward the reference-image surcharge —
  // the auto-included current-slide image does not.
  const hasReferenceImage = userUploads.length > 0;

  let editResult;
  try {
    editResult = deductCreditsForEdit(req.user.id, req.params.id, hasReferenceImage, `Edit slide ${targetIndex}`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      const creditsNeeded = previewEditCost(sub, hasReferenceImage);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded,
        actionType: 'slide_edit',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

  res.json({ message: 'Editing…', index: targetIndex });

  if (slideForPrompt.layout) {
    withCostContext({ operation: 'ai_edit', slideIndex: targetIndex }, () => runLayeredEdit({ db, pres, req, targetIndex, instruction: instruction.trim(), attachments: userUploads, assetIds: editAssetIds, editResult }));
    return;
  }

  const regenAspectRatio = pres.aspect_ratio || '16:9';

  // The user's instruction is the whole prompt — the current slide image (attached
  // below as a reference) carries the context, so the original generation prompt
  // is not resent.
  const editPrompt = instruction.trim();

  let attachedImages = [];
  if (hasCurrentImage) {
    const mimeType = slideForPrompt.image_data.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    attachedImages.push({ data: slideForPrompt.image_data, mimeType });
  }
  attachedImages.push(...userUploads);
  attachedImages = attachedImages.slice(0, 5);

  (async () => {
    try {
      const imageData = await editSlideImage(
        editPrompt,
        attachedImages,
        regenAspectRatio,
        slideForPrompt.index
      );

      // Re-read slides_data fresh to avoid overwriting concurrent changes
      const freshPres = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
      const freshSlides = JSON.parse(freshPres?.slides_data || '[]');
      const freshArrayPos = freshSlides.findIndex(s => s.index === targetIndex);
      const baseSlide = freshArrayPos >= 0 ? freshSlides[freshArrayPos] : slideForPrompt;

      // editSlideImage returns null (or an SVG placeholder in mock mode)
      // rather than throwing on persistent NB2 failure.
      const editFailed = !imageData || imageData.startsWith('data:image/svg');
      if (editFailed) {
        // Leave the slide's existing image untouched, refund, and surface the
        // failure so the UI shows a retry affordance over the last good image.
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
        broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: 'Image generation failed' });
        return;
      }

      // Success: store the new image on disk; the outgoing image FILE moves into
      // version history (reused, not re-encoded).
      const updatedSlide = {
        ...baseSlide,
        ...storeSlideImage(req.params.id, targetIndex, imageData),
        status: 'complete',
        _edited: true,
        versions: pushSlideVersion(db, req.params.id, targetIndex, baseSlide.image_file, instruction.trim()),
      };

      if (freshArrayPos >= 0) {
        freshSlides[freshArrayPos] = updatedSlide;
      } else {
        freshSlides.push(updatedSlide);
        freshSlides.sort((a, b) => a.index - b.index);
      }

      // Always keep the thumbnail in sync with whichever slide is first in the current order
      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [JSON.stringify(freshSlides), req.params.id];
      if (freshSlides[0]?.index === targetIndex) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, updatedSlide.image_file);
      }
      db.prepare(thumbSql).run(...thumbArgs);

      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide edit failed', { errorMessage: err.message });
      refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', req.params.id, { slide_index: targetIndex });
      broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: err.message });
    }
  })();
});

// ─── AI edit of a layered slide ────────────────────────────────────────────
// Claude turns the instruction into layer operations (layoutAgent.
// editSlideLayout → layoutEdit.applyEditOps); the edited layout is rebuilt in
// `prebuilt` mode, so only the image layers Claude regenerated or added are
// generated — every other layer, file and position is kept. The outgoing
// layout + preview move into version history (one click to undo).
// On any failure the slide is left exactly as it was and the edit is refunded.
async function runLayeredEdit({ db, pres, req, targetIndex, instruction, attachments, assetIds = [], editResult }) {
  const presId = req.params.id;
  const userId = req.user.id;
  const setStatus = (status) => {
    const row = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presId);
    const cur = JSON.parse(row?.slides_data || '[]');
    const pos = cur.findIndex(s => s.index === targetIndex);
    if (pos === -1) return null;
    cur[pos] = { ...cur[pos], status };
    db.prepare('UPDATE presentations SET slides_data = ? WHERE id = ?').run(JSON.stringify(cur), presId);
    return cur[pos];
  };
  const fail = (message, userMessage) => {
    logger.warn('layered edit failed', { presentationId: presId, slideIndex: targetIndex, errorMessage: message });
    refundCredits(userId, editResult.cost, 'slide_edit_refund', 'Slide edit failed — refunded', presId, { slide_index: targetIndex });
    const restored = setStatus('complete');
    // The previous slide is untouched: the client shows it again + the message.
    broadcast(presId, { type: 'slide_edit_failed', index: targetIndex, message: userMessage, slide: restored });
  };

  // Mark generating first (a concurrent editor save or second edit then
  // refuses instead of racing this one).
  const before = setStatus('generating');
  if (!before) return fail('slide vanished', 'This slide no longer exists.');
  broadcast(presId, { type: 'slide_generating', index: targetIndex });

  try {
    // Edit images and the pictures of library files picked for this edit
    // join the deck's uploads (scoped), so the edited layout's upload:N refs
    // still resolve in later edits/retries. Picked files are read again by
    // Claude with this instruction in mind.
    const editImgs = await ingestImages(attachments.map(a => ({ type: 'image', name: a.name || 'reference', data: a.data })));
    const editIdx = appendDeckUploads(db, presId, editImgs.map(img => ({ ...img, category: 'edit reference', scoped: true }))).filter(i => i !== null);
    const library = assetIds.length
      ? await readLibraryFiles({ db, presentationId: presId, userId, assetIds, request: instruction })
      : { text: '', uploadIndices: [] };
    const ctx = await loadDeckContext(db, pres, userId);
    const uploads = ctx.uploads;
    const scope = { uploads: [...editIdx, ...library.uploadIndices], source_slide: before.source_slide, source_doc: before.source_doc };
    const preview = await renderLayoutPreview(before.layout, loadStoredFile, { width: 1280 });
    const plan = await editSlideLayout({
      layout: before.layout, previewPng: preview, instruction: library.text ? `${instruction}\n\n${library.text}` : instruction,
      deckDesign: ctx.deckDesign, uploads, userId, slideIndex: targetIndex, scope,
    });
    const { layout: edited, regenerated, applied } = applyEditOps(before.layout, plan.ops, { uploadCount: uploads.length });
    if (!applied.length) return fail('no ops', plan.summary || 'Nova couldn\'t find anything to change for that instruction. Try describing it differently.');

    const result = await buildLayeredSlide({
      presentationId: presId,
      slide: { index: before.index, type: before.type, title: before.title, subtitle: before.subtitle, key_points: before.key_points, speaker_note: before.speaker_note },
      ...ctx,
      uploads,
      userId,
      layoutOverride: edited,
      prebuilt: true,
      onLayout: (layout) => broadcast(presId, { type: 'slide_layout', index: targetIndex, layout }),
      onLayer: (layer) => broadcast(presId, { type: 'slide_layer_ready', index: targetIndex, layer }),
    });
    if (!result) return fail('rebuild failed', 'The new image for this edit couldn\'t be generated. Your slide is unchanged and the credits were refunded.');

    // Re-read fresh: if someone else changed the slide meanwhile, drop ours.
    const freshRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(presId);
    const fresh = JSON.parse(freshRow?.slides_data || '[]');
    const pos = fresh.findIndex(s => s.index === targetIndex);
    if (pos === -1 || fresh[pos].status !== 'generating') {
      const keep = new Set([...slideFiles(before), ...versionFiles(db, presId, targetIndex)]);
      for (const f of slideFiles(result)) if (!keep.has(f)) imageStore.remove(f);
      refundCredits(userId, editResult.cost, 'slide_edit_refund', 'Slide changed before the edit finished — refunded', presId, { slide_index: targetIndex });
      return;
    }
    const updatedSlide = {
      ...fresh[pos],
      ...result,
      status: 'complete',
      _edited: true,
      versions: pushSlideVersion(db, presId, targetIndex, fresh[pos].image_file, instruction, fresh[pos].layout, slideFiles(result)),
    };
    fresh[pos] = updatedSlide;
    if (pos === 0) {
      db.prepare('UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fresh), updatedSlide.image_file, presId);
    } else {
      db.prepare('UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fresh), presId);
    }
    logger.info('layered edit applied', { presentationId: presId, slideIndex: targetIndex, applied, regenerated });
    broadcast(presId, { type: 'slide_updated', slide: updatedSlide, source: 'ai_edit', summary: plan.summary || '' });
  } catch (err) {
    fail(err.message, 'This edit couldn\'t be applied. Your slide is unchanged and the credits were refunded.');
  }
}

// ─── Save direct edits to a layered slide (the web editor) ─────────────────
// Body: { layout, checkpoint?: boolean, client_id?: string }. The editor
// autosaves its whole edited layout; applyLayoutEdit takes only whitelisted,
// re-validated changes onto the stored layout (no new file references). The
// flattened preview (thumbnail / PDF / legacy viewers) is re-rendered.
// `checkpoint` (first save of an editing session) moves the outgoing state
// into version history so the whole session can be undone from History.
// Free: direct edits don't call any model.
router.patch('/:id/slides/:index/layout', authenticateToken, async (req, res) => {
  const { layout: edited, checkpoint = false, client_id: clientId = null } = req.body || {};
  if (!edited || typeof edited !== 'object' || !Array.isArray(edited.layers)) {
    return res.status(400).json({ error: 'Nothing to save: the slide layout is missing.' });
  }
  const db = getDb();
  const pres = db.prepare('SELECT id, slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data || '[]');
  const slide = slides.find(s => s.index === targetIndex);
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed.' });
  if (!slide.layout) return res.status(409).json({ error: 'This slide is a single image, so it can\'t be edited layer by layer. Describe your change instead.' });
  if (slide.status !== 'complete') return res.status(409).json({ error: 'This slide is still being generated. Try again once it\'s finished.' });

  let nextLayout;
  try {
    nextLayout = applyLayoutEdit(slide.layout, edited);
  } catch (err) {
    return res.status(400).json({ error: 'That edit couldn\'t be saved. Please refresh and try again.' });
  }

  let previewFile;
  try {
    const png = await renderLayoutPreview(nextLayout, loadStoredFile, { width: 1920 });
    previewFile = imageStore.saveDataUrl(`data:image/png;base64,${png.toString('base64')}`);
    if (!previewFile) throw new Error('image store write failed');
  } catch (err) {
    logger.error('layout edit preview failed', { presentationId: req.params.id, slideIndex: targetIndex, errorMessage: err.message });
    return res.status(500).json({ error: 'Your edit couldn\'t be saved right now. Please try again.' });
  }

  // Re-read fresh after the async render: another actor (an AI edit, a retry)
  // may have replaced this slide meanwhile — then our edit is stale.
  const freshRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
  const fresh = JSON.parse(freshRow?.slides_data || '[]');
  const pos = fresh.findIndex(s => s.index === targetIndex);
  if (pos === -1 || fresh[pos].status !== 'complete' || !fresh[pos].layout) {
    imageStore.remove(previewFile);
    return res.status(409).json({ error: 'This slide changed while you were editing. Please reload it.' });
  }
  const outgoing = fresh[pos];
  let versions = outgoing.versions;
  if (checkpoint) {
    versions = pushSlideVersion(db, req.params.id, targetIndex, outgoing.image_file, 'Manual edits', outgoing.layout,
      [previewFile, ...layoutFiles(nextLayout)]);
  } else {
    // Autosaves replace the previous preview — unless history still uses it.
    const keep = versionFiles(db, req.params.id, targetIndex);
    if (outgoing.image_file && !keep.has(outgoing.image_file)) imageStore.remove(outgoing.image_file);
  }
  const updatedSlide = {
    ...outgoing,
    layout: nextLayout,
    image_file: previewFile,
    image_data: slideImageUrl(req.params.id, targetIndex, previewFile),
    _edited: true,
    versions,
  };
  fresh[pos] = updatedSlide;
  if (pos === 0) {
    db.prepare('UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fresh), previewFile, req.params.id);
  } else {
    db.prepare('UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(fresh), req.params.id);
  }
  // Other tabs get the update; the editing tab recognises its own client_id.
  broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide, source: 'layout_edit', client_id: typeof clientId === 'string' ? clientId.slice(0, 64) : null });
  res.json({ slide: updatedSlide });
});

// ─── List saved versions for a slide ──────────────────────────────────────────
router.get('/:id/slides/:index/versions', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet.' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const slide = slides.find(s => s.index === targetIndex);
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  // Version images are served from disk via an authed URL — the list carries
  // metadata + a URL, never base64.
  const versions = db.prepare(
    'SELECT id, instruction, created_at FROM slide_versions WHERE presentation_id = ? AND slide_index = ? ORDER BY created_at DESC, rowid DESC'
  ).all(req.params.id, targetIndex).map(v => ({ ...v, image_data: versionImageUrl(req.params.id, targetIndex, v.id) }));
  res.json({ versions });
});

// ─── Restore a previous version of a slide ────────────────────────────────────
router.post('/:id/slides/:index/versions/:versionId/restore', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet.' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const arrayPos = slides.findIndex(s => s.index === targetIndex);
  const slide = slides[arrayPos];
  if (!slide) return res.status(404).json({ error: 'Slide not found. It may have been removed or the index is out of range.' });

  const restoredVersion = db.prepare(
    'SELECT * FROM slide_versions WHERE id = ? AND presentation_id = ? AND slide_index = ?'
  ).get(req.params.versionId, req.params.id, targetIndex);
  if (!restoredVersion) return res.status(404).json({ error: 'Version not found.' });

  // The restored version's file becomes the slide's current image (its row
  // leaves history — file is reused, not deleted); the outgoing current file
  // joins history in its place.
  db.prepare('DELETE FROM slide_versions WHERE id = ?').run(restoredVersion.id);
  const restoredFile = restoredVersion.image_file;

  // Layered versions carry their layout: restoring brings every editable layer
  // back. A flat version restored over a layered slide drops the layout (the
  // slide becomes the flat image it was).
  let restoredLayout = null;
  if (restoredVersion.layout) { try { restoredLayout = JSON.parse(restoredVersion.layout); } catch { /* corrupt */ } }
  const updatedSlide = {
    ...slide,
    image_file: restoredFile || null,
    image_data: restoredFile
      ? slideImageUrl(req.params.id, targetIndex, restoredFile)
      : restoredVersion.image_data, // legacy pre-migration base64
    status: 'complete',
    _edited: true,
    versions: pushSlideVersion(db, req.params.id, targetIndex, slide.image_file, 'Reverted to an earlier version',
      slide.layout || null, [restoredFile, ...layoutFiles(restoredLayout)].filter(Boolean)),
  };
  if (restoredLayout) updatedSlide.layout = restoredLayout; else delete updatedSlide.layout;

  slides[arrayPos] = updatedSlide;

  let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
  const thumbArgs = [JSON.stringify(slides), req.params.id];
  if (slides[0]?.index === targetIndex) {
    thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
    thumbArgs.splice(1, 0, updatedSlide.image_file);
  }
  db.prepare(thumbSql).run(...thumbArgs);

  broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
  res.json({ slide: updatedSlide });
});

// ─── Retry a failed slide (re-run original prompt, no changes) ───────────────
router.post('/:id/slides/:index/retry', authenticateToken, costScope('retry'), async (req, res) => {
  const db = getDb();
  const pres = db
    .prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);

  if (!pres) return res.status(404).json({ error: 'Presentation not found.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides found.' });

  try { checkTokenBudget(req.user.id); } catch (err) {
    if (err.message === 'TOKEN_LIMIT_EXCEEDED') return res.status(402).json({ error: 'You\'ve reached your monthly token limit.', code: 'TOKEN_LIMIT_EXCEEDED' });
    throw err;
  }

  const slides = JSON.parse(pres.slides_data);
  const targetIndex = parseInt(req.params.index, 10);
  const arrayPos = slides.findIndex(s => s.index === targetIndex);
  const slide = slides[arrayPos];
  if (!slide) return res.status(404).json({ error: 'Slide not found.' });

  // Guard against double-generation. A slide still in 'generating' is being
  // produced right now by an in-flight add-slides run (or an earlier retry
  // that hasn't finished). Kicking off a competing generation here would race
  // with it, and the slower of the two writes silently overwrites the good
  // result — the exact "original slide shows, then gets overwritten by the
  // regenerate" bug. The original generation will still deliver its result via
  // SSE, so we no-op (without charging credits) and let it finish.
  if (slide.status === 'generating') {
    logger.info('retry ignored — slide still generating in background', { presentationId: req.params.id, slideIndex: targetIndex });
    return res.json({ message: 'Slide is still generating', index: targetIndex, alreadyGenerating: true });
  }

  let editResult;
  try {
    editResult = deductCreditsForEdit(req.user.id, req.params.id, false, `Retry slide ${targetIndex}`);
  } catch (err) {
    if (err.message === 'INSUFFICIENT_CREDITS') {
      const sub = getOrCreateSubscription(req.user.id);
      const creditsNeeded = previewEditCost(sub, false);
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: sub.credits_remaining,
        creditsNeeded,
        actionType: 'slide_edit',
        currentPlan: sub.plan,
      }));
    }
    throw err;
  }

  // Mark the slide generating BEFORE responding, so a second click (or an
  // add-slides catch-up) sees it and no-ops via the guard above instead of
  // racing a second build.
  {
    const row = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
    const cur = JSON.parse(row?.slides_data || '[]');
    const pos = cur.findIndex(s => s.index === targetIndex);
    if (pos !== -1) {
      cur[pos] = { ...cur[pos], status: 'generating' };
      db.prepare('UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(cur), req.params.id);
    }
  }
  res.json({ message: 'Retrying…', index: targetIndex });
  broadcast(req.params.id, { type: 'slide_generating', index: targetIndex });

  (async () => {
    try {
      const ctx = await loadDeckContext(db, pres, req.user.id);
    if (slide_indexes.length > 1) prewarmLayoutCache({ aspectRatio: ctx.aspectRatio, userId: req.user.id });
      const result = await buildLayeredSlide({
        presentationId: req.params.id,
        slide: { index: slide.index, type: slide.type, title: slide.title, subtitle: slide.subtitle, key_points: slide.key_points, speaker_note: slide.speaker_note, visual: slide.visual },
        ...ctx,
        userId: req.user.id,
        onLayout: (layout) => broadcast(req.params.id, { type: 'slide_layout', index: targetIndex, layout }),
        onLayer: (layer) => broadcast(req.params.id, { type: 'slide_layer_ready', index: targetIndex, layer }),
      });

      // Re-read fresh right before writing — other slides may have changed
      // concurrently, and this slide may have been deleted or rebuilt by
      // another actor while we were generating (status no longer
      // 'generating' ⇒ someone else won: discard our result and refund).
      const freshRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      const freshSlides = JSON.parse(freshRow?.slides_data || '[]');
      const freshPos = freshSlides.findIndex(s => s.index === targetIndex);
      if (freshPos === -1 || freshSlides[freshPos].status !== 'generating') {
        logger.info('retry: discarding stale result — slide changed meanwhile', { presentationId: req.params.id, slideIndex: targetIndex });
        if (result) for (const f of slideFiles(result)) imageStore.remove(f);
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide changed before retry finished — refunded', req.params.id, { slide_index: targetIndex });
        return;
      }

      if (!result) {
        freshSlides[freshPos] = { ...freshSlides[freshPos], status: 'error' };
        db.prepare('UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(JSON.stringify(freshSlides), req.params.id);
        refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide retry failed — refunded', req.params.id, { slide_index: targetIndex });
        broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: 'Slide generation failed' });
        return;
      }

      const oldFiles = slideFiles(freshSlides[freshPos]);
      // Version history still holds the old flattened image file — keep it.
      const keepForVersions = versionFiles(db, req.params.id, targetIndex);
      const updatedSlide = { ...freshSlides[freshPos], ...result, status: 'complete', _edited: false };
      delete updatedSlide.nano_banana_prompt;
      freshSlides[freshPos] = updatedSlide;

      let thumbSql = `UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
      const thumbArgs = [JSON.stringify(freshSlides), req.params.id];
      if (freshPos === 0) {
        thumbSql = `UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`;
        thumbArgs.splice(1, 0, updatedSlide.image_file);
      }
      db.prepare(thumbSql).run(...thumbArgs);
      // Retry replaces the slide outright — drop the old files.
      for (const f of oldFiles) if (!keepForVersions.has(f)) imageStore.remove(f);
      broadcast(req.params.id, { type: 'slide_updated', slide: updatedSlide });
    } catch (err) {
      logger.error('slide retry failed', { errorMessage: err.message });
      refundCredits(req.user.id, editResult.cost, 'slide_edit_refund', 'Slide retry failed — refunded', req.params.id, { slide_index: targetIndex });
      const row = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
      const cur = JSON.parse(row?.slides_data || '[]');
      const pos = cur.findIndex(s => s.index === targetIndex);
      if (pos !== -1 && cur[pos].status === 'generating') {
        cur[pos] = { ...cur[pos], status: 'error' };
        db.prepare('UPDATE presentations SET slides_data = ? WHERE id = ?').run(JSON.stringify(cur), req.params.id);
      }
      broadcast(req.params.id, { type: 'slide_error', index: targetIndex, message: err.message });
    }
  })();
});

// ─── Reorder slides ───────────────────────────────────────────────────────
router.post('/:id/reorder', authenticateToken, (req, res) => {
  const { order } = req.body; // array of slide indexes in new order
  if (!Array.isArray(order)) return res.status(400).json({ error: 'Invalid request: expected an array of slide indices.' });

  const db = getDb();
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres || !pres.slides_data) return res.status(404).json({ error: 'Presentation not found or no slides to reorder.' });

  const slides = JSON.parse(pres.slides_data);
  const byIndex = new Map(slides.map(s => [s.index, s]));
  const orderedIndices = new Set(order);
  const reordered = order.map(idx => byIndex.get(idx)).filter(Boolean);

  // The client's `order` array reflects the slide list it had when the drag
  // started. If new slides were added/generated since (e.g. add-slides is
  // still running in the background), this fresh read of slides_data will
  // contain indices the client doesn't know about yet. Append those at the
  // end instead of dropping them, so an in-progress reorder can never delete
  // a slide that's currently being generated.
  for (const slide of slides) {
    if (!orderedIndices.has(slide.index)) reordered.push(slide);
  }

  // Sync thumbnail to whichever slide is now first (thumbnail column holds a
  // stored image filename).
  const newFirstFile = reordered[0]?.image_file || null;
  if (newFirstFile) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(reordered), newFirstFile, req.params.id);
  } else {
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(reordered), req.params.id);
  }

  res.json({ message: 'Reordered' });
});

// ─── Update title ─────────────────────────────────────────────────────────
router.patch('/:id/title', authenticateToken,
  validate({ title: isString(1, 500) }),
  (req, res) => {
    const { title } = req.body;
    const result = getDb()
      .prepare(`UPDATE presentations SET title = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
      .run(title, req.params.id, req.user.id);
    if (result.changes === 0) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to rename it.' });
    res.json({ title });
  },
);

// ─── Suggest title via AI ─────────────────────────────────────────────────
router.post('/:id/suggest-title', authenticateToken, costScope('suggest_title'), async (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : null;
  const slidesData = pres.slides_data ? JSON.parse(pres.slides_data) : null;

  const context = {
    presentation_title: slidePlan?.presentation_title || pres.title,
    slides: (slidesData || []).map(s => ({ title: s.title, type: s.type, key_points: s.key_points?.slice(0, 2) })),
  };

  try {
    const title = await suggestTitle(context, req.user.id);
    res.json({ title });
  } catch (err) {
    res.status(500).json({ error: 'Could not generate a title suggestion right now. You can rename it manually.' });
  }
});

// ─── Add more slides ──────────────────────────────────────────────────────
router.post('/:id/add-slides', authenticateToken, costScope('add_slides'), addSlidesLimiter, (req, res) => {
  const { description, count = 1, attachments: reqAttachments = [], asset_ids: addAssetIds = [] } = req.body; // `style` ignored (one design system)
  if (!description?.trim() || typeof description !== 'string') {
    return res.status(400).json({ error: 'Please describe the slides you\'d like to add.' });
  }
  if (description.length > 10_000) {
    return res.status(400).json({ error: 'Description too long (max 10,000 characters)' });
  }
  const attachmentsErr = validateAttachments(reqAttachments);
  if (attachmentsErr) return res.status(400).json({ error: attachmentsErr });
  if (!Array.isArray(addAssetIds) || addAssetIds.length > 20) return res.status(400).json({ error: 'asset_ids must be a list of up to 20 files' });
  if (count !== 'auto' && (isNaN(parseInt(count)) || parseInt(count) < 1 || parseInt(count) > 10)) {
    return res.status(400).json({ error: 'Count must be 1–10 or "auto"' });
  }
  const isAuto = count === 'auto';
  const slideCount = isAuto ? null : Math.min(Math.max(parseInt(count) || 1, 1), 10);

  const db = getDb();
  const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });
  if (!pres.slides_data) return res.status(400).json({ error: 'No slides have been generated yet. Generate your presentation before adding more slides.' });

  const slides = JSON.parse(pres.slides_data);
  // Use the highest existing slide index + 1, not slides.length — if a slide
  // was ever deleted (DELETE /:id/slides/:index removes it without
  // reindexing the rest), slides.length can be less than max(index) + 1.
  // Using slides.length here would assign a new slide the same `index` as an
  // existing one, producing a duplicate-index entry in slides_data. Any later
  // `current.findIndex(s => s.index === ...)` lookup then matches the OLD
  // (already-complete) slide first, discards the new slide's result as
  // "stale", and leaves the new placeholder stuck on 'generating' forever —
  // while the old slide's data gets silently overwritten by that placeholder.
  const startIndex = slides.length ? Math.max(...slides.map(s => s.index)) + 1 : 0;
  const aspectRatio = pres.aspect_ratio || '16:9';
  // New slides default to the deck's existing style so added slides match the
  // look of the original deck; an explicit request body can still override it.
  const slidePlan = pres.slide_plan ? JSON.parse(pres.slide_plan) : {};

  // For fixed counts we know the cost up front — check affordability and
  // deduct credits before doing any work, returning a cute-Nova 402 if
  // nothing is affordable at all.
  let affordable = null;
  let locked = 0;
  let suggestedPlan = null;
  let ledgerId = null;
  if (!isAuto) {
    const computed = computeAffordableSlides(req.user.id, slideCount);
    if (computed.affordable === 0) {
      const creditsNeeded = slideCount * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
      return res.status(402).json(novaInsufficientCredits({
        creditsRemaining: computed.creditsRemaining,
        creditsNeeded,
        actionType: 'add_slides',
        currentPlan: computed.plan,
      }));
    }
    affordable = computed.affordable;
    locked = computed.locked;
    const creditsNeeded = locked * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
    suggestedPlan = locked > 0 ? suggestPlanForCost(computed.plan, creditsNeeded) : null;
    ({ ledgerId } = deductCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'add_slides', 'Add slides', {
      presentationId: req.params.id, slidesGenerated: affordable, slidesLocked: locked,
      metadata: { requested_slides: slideCount },
    }));
    if (locked > 0) {
      broadcast(req.params.id, {
        type: 'partial_generation',
        slides_generated: affordable,
        slides_locked: locked,
        credits_needed: creditsNeeded,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
      });
    }
  }

  // Create placeholder slides immediately (for auto, use 3 as optimistic placeholder count)
  const placeholderCount = slideCount ?? 3;
  const placeholders = Array.from({ length: placeholderCount }, (_, i) => ({
    index: startIndex + i,
    type: 'content',
    title: `New Slide ${startIndex + i + 1}`,
    status: 'generating',
    image_data: null,
  }));
  const newSlides = [...slides, ...placeholders];
  // Flag the row as adding-slides so the dashboard shows "Generating…" — the
  // presentation status stays 'completed' throughout the run, so without this
  // the dashboard card would say "Complete" while new slides are still cooking.
  db.prepare(`UPDATE presentations SET slides_data = ?, adding_slides = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    .run(JSON.stringify(newSlides), req.params.id);
  broadcast(req.params.id, { type: 'slides_adding', placeholders });
  broadcastDashboardUpdate(db, req.user.id, req.params.id);

  res.json({ message: 'Adding slides…', startIndex, count: slideCount, auto: isAuto });

  // Run async
  (async () => {
    try {
      // Images attached to this request join the deck's uploads (scoped to
      // the new slides) so upload:N means the same picture in every later
      // retry / edit. Files picked from the deck library are read again by
      // Claude with THIS request in mind (their pictures join too).
      let extraIdx = [];
      try {
        const extra = await ingestImages((reqAttachments || []).filter(a => a.data));
        extraIdx = appendDeckUploads(db, req.params.id, extra.map(img => ({ ...img, scoped: true, category: 'add reference' }))).filter(i => i !== null);
      } catch (err) { logger.warn('add-slides image rejected', { errorMessage: err.message }); }
      const library = addAssetIds.length
        ? await readLibraryFiles({ db, presentationId: req.params.id, userId: req.user.id, assetIds: addAssetIds, request: description })
        : { text: '', uploadIndices: [] };
      const addScopedUploads = [...extraIdx, ...library.uploadIndices];
      const plannerDescription = library.text ? `${description}\n\n${library.text}` : description;

      // Give the planner the established visual language of the deck: the
      // design system plus a one-line visual summary of every existing slide
      // (legacy flat slides still carry their full image prompt).
      const allSlideVisuals = slides.map(s => ({
        index: s.index,
        type: s.type,
        title: s.title,
        nano_banana_prompt: s.nano_banana_prompt
          || (s.layout ? `${s.layout.composition} layout; background: ${s.layout.background?.prompt || s.layout.background?.color || ''}; elements: ${(s.layout.layers || []).filter(l => l.kind === 'image').map(l => l.name || l.id).join(', ')}` : null),
      }));

      const presentationContext = {
        presentation_title: slidePlan.presentation_title || pres.title,
        theme: slidePlan.theme,
        color_palette: slidePlan.color_palette,
        existing_slides: slides.map(s => ({ index: s.index, type: s.type, title: s.title, key_points: s.key_points })),
        recent_slide_visuals: allSlideVisuals,
        design_system: slidePlan.design || null,
      };

      const newSlideDefs = [];
      await streamNewSlides(plannerDescription, slideCount, startIndex, presentationContext, (slideDef) => {
        newSlideDefs.push(addScopedUploads.length ? { ...slideDef, uploads: addScopedUploads } : slideDef);
      }, req.user.id);
      newSlideDefs.sort((a, b) => a.index - b.index);

      // New slides are built as layers against the deck's existing design
      // system (generated now for decks that predate layered slides), so they
      // match the rest of the deck.
      const promptedSlideDefs = newSlideDefs;
      const deckCtx = await loadDeckContext(db, pres, req.user.id);
      if (promptedSlideDefs.length > 1) prewarmLayoutCache({ aspectRatio: deckCtx.aspectRatio, userId: req.user.id });
      // Same order as the stored uploads (indices stay global).
      const addUploads = deckCtx.uploads;
      const addSiblings = [...deckCtx.siblingTitles, ...newSlideDefs.map(d => d.title)];

      // For 'auto' mode the slide count is only known now — check affordability
      // and deduct credits before generating any images.
      if (isAuto) {
        const computed = computeAffordableSlides(req.user.id, promptedSlideDefs.length);
        affordable = computed.affordable;
        locked = computed.locked;
        const creditsNeeded = locked * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE;
        suggestedPlan = locked > 0 ? suggestPlanForCost(computed.plan, creditsNeeded) : null;
        ({ ledgerId } = deductCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'add_slides', 'Add slides', {
          presentationId: req.params.id, slidesGenerated: affordable, slidesLocked: locked,
          metadata: { requested_slides: promptedSlideDefs.length },
        }));
        if (locked > 0) {
          broadcast(req.params.id, {
            type: 'partial_generation',
            slides_generated: affordable,
            slides_locked: locked,
            credits_needed: creditsNeeded,
            suggested_plan: suggestedPlan,
            upgrade_url: '/pricing',
          });
        }
      }

      const sortedDefs = [...promptedSlideDefs].sort((a, b) => a.index - b.index);
      const affordableDefs = sortedDefs.slice(0, affordable);
      const lockedDefs = sortedDefs.slice(affordable);

      // Remove excess optimistic placeholders, and replace placeholders for
      // locked slides with locked placeholders (prompts stored server-side only).
      const presRow0 = db.prepare('SELECT slides_data, locked_slides FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (!presRow0?.slides_data) return;
      const current0 = JSON.parse(presRow0.slides_data);
      let existingLocked = [];
      try { existingLocked = JSON.parse(presRow0.locked_slides || '[]'); } catch {}

      const newLockedEntries = lockedDefs.map(outlineOf);
      const lockedPlaceholders = lockedDefs.map(d => ({
        index: d.index,
        type: d.type,
        title: d.title,
        key_points: (d.key_points || []).slice(0, 2),
        status: 'locked',
        locked_reason: 'insufficient_credits',
        credits_needed: CREDIT_COSTS.SLIDES_ADD_PER_SLIDE,
        suggested_plan: suggestedPlan,
        upgrade_url: '/pricing',
        image_data: null,
      }));

      const keepIndices = new Set(promptedSlideDefs.map(d => d.index));
      // Only trim THIS request's optimistic placeholders (index >= startIndex).
      // Other slides can legitimately be 'generating' right now (a retry in
      // flight marks its slide 'generating') — removing those would silently
      // delete a user's slide.
      const trimmed = current0.filter(s => s.index < startIndex || s.status !== 'generating' || keepIndices.has(s.index));
      for (const lp of lockedPlaceholders) {
        const idx = trimmed.findIndex(s => s.index === lp.index);
        if (idx !== -1) trimmed[idx] = lp; else trimmed.push(lp);
      }
      trimmed.sort((a, b) => a.index - b.index);

      db.prepare(`UPDATE presentations SET slides_data = ?, locked_slides = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
        .run(JSON.stringify(trimmed), JSON.stringify([...existingLocked, ...newLockedEntries]), req.params.id, req.user.id);
      broadcast(req.params.id, { type: 'slides_trimmed', keep_indices: promptedSlideDefs.map(d => d.index) });
      for (const lp of lockedPlaceholders) {
        broadcast(req.params.id, { type: 'slide_locked', slide: lp });
      }
      if (ledgerId && newLockedEntries.length > 0) {
        updateLedgerMetadata(ledgerId, { locked_slides: newLockedEntries });
      }

      // Build affordable slides as layers, in parallel
      const imagePromises = affordableDefs.map((slideDef) =>
        (async () => {
          try {
            const buildArgs = {
              presentationId: req.params.id,
              slide: slideDef,
              header: deckCtx.header, deckDesign: deckCtx.deckDesign,
              // The add-slides request is the most specific direction for these slides.
              brief: `${deckCtx.brief}\n\nADD-SLIDES REQUEST: ${description}${library.text ? `\n\n${library.text}` : ''}`,
              uploads: addUploads, userId: req.user.id,
              aspectRatio, siblingTitles: addSiblings,
              onLayout: (layout) => broadcast(req.params.id, { type: 'slide_layout', index: slideDef.index, layout }),
              onLayer: (layer) => broadcast(req.params.id, { type: 'slide_layer_ready', index: slideDef.index, layer }),
            };
            let result = await buildLayeredSlide(buildArgs);
            // Most failures are transient (rate limits, a flaky generation) —
            // resubmit once before surfacing an error the user has to act on.
            if (!result) {
              logger.warn('add-slides layered build failed — auto-retrying once', { presentationId: req.params.id, slideIndex: slideDef.index });
              result = await buildLayeredSlide(buildArgs);
            }

            const failed = !result;
            const done = failed
              ? { ...slideDef, image_data: null, image_file: null, status: 'error' }
              : { ...slideDef, ...result, status: 'complete' };
            // Persist: replace placeholder with done slide
            const currentRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!currentRow?.slides_data) { if (result) for (const f of slideFiles(result)) imageStore.remove(f); return; }
            const current = JSON.parse(currentRow.slides_data);
            const idx = current.findIndex(s => s.index === done.index);

            // If the user already retried/edited/deleted this slide while this
            // build was still in flight, don't clobber their result.
            if (idx === -1 || current[idx].status !== 'generating') {
              logger.info('add-slides: discarding stale result — slide already updated', { presentationId: req.params.id, slideIndex: done.index, currentStatus: current[idx]?.status });
              if (result) for (const f of slideFiles(result)) imageStore.remove(f);
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide updated before generation finished — refunded', req.params.id, { slide_index: slideDef.index });
              return;
            }

            current[idx] = done;
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            if (failed) {
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide generation failed — refunded', req.params.id, { slide_index: slideDef.index });
              logger.error('add-slides layered build failed after auto-retry', { presentationId: req.params.id, slideIndex: slideDef.index });
              broadcast(req.params.id, { type: 'slide_error', index: done.index, message: 'Slide generation failed' });
            } else {
              broadcast(req.params.id, { type: 'slide_ready', slide: done });
            }
          } catch (err) {
            const errSlide = { ...slideDef, image_data: null, status: 'error' };
            const errRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
            if (!errRow?.slides_data) return;
            const current = JSON.parse(errRow.slides_data);
            const idx = current.findIndex(s => s.index === errSlide.index);

            if (idx !== -1 && current[idx].status !== 'generating') {
              logger.info('add-slides: discarding stale error — slide already updated', { presentationId: req.params.id, slideIndex: errSlide.index, currentStatus: current[idx].status });
              refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide updated before generation finished — refunded', req.params.id, { slide_index: slideDef.index });
              return;
            }

            if (idx !== -1) current[idx] = errSlide;
            db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
              .run(JSON.stringify(current), req.params.id);
            refundCredits(req.user.id, CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Slide generation failed — refunded', req.params.id, { slide_index: slideDef.index });
            broadcast(req.params.id, { type: 'slide_error', index: errSlide.index, message: err.message });
          }
        })()
      );

      await Promise.all(imagePromises);
      broadcast(req.params.id, { type: 'slides_added', count: affordableDefs.length, locked: lockedDefs.length });
    } catch (err) {
      logger.error('add slides failed', { errorMessage: err.message });
      // Don't leave placeholders from this request stuck in 'generating'
      // forever — mark them as errored so they're visible and retryable,
      // and refund any credits already deducted since no images were made.
      const errRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
      if (errRow?.slides_data) {
        const current = JSON.parse(errRow.slides_data);
        let changed = false;
        for (const s of current) {
          if (s.index >= startIndex && s.status === 'generating') {
            s.status = 'error';
            changed = true;
            broadcast(req.params.id, { type: 'slide_error', index: s.index, message: err.message });
          }
        }
        if (changed) {
          db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
            .run(JSON.stringify(current), req.params.id);
        }
      }
      if (affordable) {
        refundCredits(req.user.id, affordable * CREDIT_COSTS.SLIDES_ADD_PER_SLIDE, 'generation_refund', 'Add slides failed — refunded', req.params.id, {});
      }
      broadcast(req.params.id, { type: 'error', message: err.message });
    } finally {
      // Clear the dashboard "Generating…" flag whether the run succeeded or
      // failed, and refresh the dashboard so the card flips back to "Complete".
      try {
        db.prepare(`UPDATE presentations SET adding_slides = 0 WHERE id = ?`).run(req.params.id);
        broadcastDashboardUpdate(db, req.user.id, req.params.id);
      } catch (e) {
        logger.error('add-slides: failed to clear adding_slides flag', { presentationId: req.params.id, errorMessage: e.message });
      }
    }
  })();
});

// ─── Unlock previously-locked slides (generate images from stored prompts) ──
router.post('/:id/unlock-slides', authenticateToken, costScope('unlock'),
  validate({ slide_indexes: isArray(50, (v) => Number.isInteger(v) ? null : 'Must be an integer') }),
  async (req, res) => {
    const { slide_indexes } = req.body;
    if (slide_indexes.length === 0) {
      return res.status(400).json({ error: 'slide_indexes must be a non-empty array of integers.' });
    }

    const db = getDb();
    const pres = db.prepare('SELECT * FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have access to it.' });

    let lockedSlides = [];
    try { lockedSlides = JSON.parse(pres.locked_slides || '[]'); } catch {}

    const requestedSet = new Set(slide_indexes);
    const toUnlock = lockedSlides.filter(s => requestedSet.has(s.slide_index));
    if (toUnlock.length === 0) {
      return res.status(404).json({ error: 'No matching locked slides found.' });
    }

    const cost = toUnlock.length * CREDIT_COSTS.PER_SLIDE;

    let ledgerId;
    try {
      ({ ledgerId } = deductCredits(req.user.id, cost, 'unlock_slides', `Unlock ${toUnlock.length} slide(s)`, {
        presentationId: req.params.id, slidesGenerated: toUnlock.length,
        metadata: { slide_indexes: toUnlock.map(s => s.slide_index) },
      }));
    } catch (err) {
      if (err.message === 'INSUFFICIENT_CREDITS') {
        const sub = getOrCreateSubscription(req.user.id);
        return res.status(402).json(novaInsufficientCredits({
          creditsRemaining: sub.credits_remaining,
          creditsNeeded: cost,
          actionType: 'unlock_slides',
          currentPlan: sub.plan,
        }));
      }
      throw err;
    }

    // Build every unlocked slide as layers, in parallel. (Legacy locked
    // entries from flat decks carry a `prompt` instead of an outline — the
    // title + original brief are enough for the layout agent.)
    const ctx = await loadDeckContext(db, pres, req.user.id);
    const generated = [];
    await Promise.all(toUnlock.map(async (lockedSlide) => {
      const outline = {
        index: lockedSlide.slide_index, type: lockedSlide.type, title: lockedSlide.title,
        subtitle: lockedSlide.subtitle ?? null, key_points: lockedSlide.key_points || [], speaker_note: lockedSlide.speaker_note || '',
        visual: lockedSlide.visual,
      };
      try {
        broadcast(req.params.id, { type: 'slide_generating', index: outline.index });
        const result = await buildLayeredSlide({
          presentationId: req.params.id, slide: outline, ...ctx, userId: req.user.id,
          onLayout: (layout) => broadcast(req.params.id, { type: 'slide_layout', index: outline.index, layout }),
          onLayer: (layer) => broadcast(req.params.id, { type: 'slide_layer_ready', index: outline.index, layer }),
        });
        const done = result
          ? { ...outline, ...result, status: 'complete' }
          : { ...outline, image_data: null, image_file: null, status: 'error' };
        generated.push(done);
        if (!result) {
          refundCredits(req.user.id, CREDIT_COSTS.PER_SLIDE, 'unlock_slides_refund', 'Slide unlock failed — refunded', req.params.id, { slide_index: outline.index });
          broadcast(req.params.id, { type: 'slide_error', index: done.index, message: 'Slide generation failed' });
        } else {
          broadcast(req.params.id, { type: 'slide_ready', slide: done });
        }
      } catch (err) {
        logger.error('slide unlock failed', { slideIndex: outline.index, errorMessage: err.message });
        refundCredits(req.user.id, CREDIT_COSTS.PER_SLIDE, 'unlock_slides_refund', 'Slide unlock failed — refunded', req.params.id, { slide_index: outline.index });
        broadcast(req.params.id, { type: 'slide_error', index: outline.index, message: err.message });
      }
    }));
    generated.sort((a, b) => a.index - b.index);

    // Merge generated slides into slides_data
    const currentRow = db.prepare('SELECT slides_data FROM presentations WHERE id = ?').get(req.params.id);
    const currentSlides = JSON.parse(currentRow?.slides_data || '[]');
    for (const done of generated) {
      const idx = currentSlides.findIndex(s => s.index === done.index);
      if (idx !== -1) currentSlides[idx] = { ...currentSlides[idx], ...done };
      else currentSlides.push(done);
    }
    currentSlides.sort((a, b) => a.index - b.index);

    // Remove unlocked slides from locked_slides
    const remainingLocked = lockedSlides.filter(s => !requestedSet.has(s.slide_index));

    db.prepare(`UPDATE presentations SET slides_data = ?, locked_slides = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(currentSlides), JSON.stringify(remainingLocked), req.params.id);

    if (ledgerId) {
      updateLedgerMetadata(ledgerId, { unlocked_slides: generated.map(s => s.index) });
    }

    broadcastDashboardUpdate(db, req.user.id, req.params.id);
    broadcast(req.params.id, { type: 'slides_unlocked', slide_indexes: generated.map(s => s.index) });

    res.json({ message: 'Slides unlocked', slides: generated });
  },
);

// ─── Delete a single slide ────────────────────────────────────────────────
router.delete('/:id/slides/:index', authenticateToken, (req, res) => {
  const db = getDb();
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!pres || !pres.slides_data) return res.status(404).json({ error: 'Presentation not found' });

  const targetIndex = parseInt(req.params.index, 10);
  const slides = JSON.parse(pres.slides_data);
  const filtered = slides.filter(s => s.index !== targetIndex);

  if (filtered.length === slides.length) return res.status(404).json({ error: 'Slide not found' });

  // Slide indices are never reused, so its version history can go too — delete
  // the rows and the underlying image files (the slide's own + its versions').
  const removed = slides.find(s => s.index === targetIndex);
  const verFiles = versionFiles(db, req.params.id, targetIndex);
  db.prepare('DELETE FROM slide_versions WHERE presentation_id = ? AND slide_index = ?').run(req.params.id, targetIndex);
  for (const f of new Set([...slideFiles(removed), ...verFiles])) imageStore.remove(f);

  const newFirst = filtered[0];
  const newFirstFile = newFirst?.image_file || null;

  if (filtered.length === 0) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = NULL, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  } else if (newFirstFile) {
    db.prepare(`UPDATE presentations SET slides_data = ?, thumbnail = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), newFirstFile, req.params.id);
  } else {
    db.prepare(`UPDATE presentations SET slides_data = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
      .run(JSON.stringify(filtered), req.params.id);
  }

  res.json({ message: 'Slide deleted', slides: filtered });
});

// ─── Delete presentation ──────────────────────────────────────────────────
router.delete('/:id', authenticateToken, (req, res) => {
  const db = getDb();
  // Gather every stored image file before the rows cascade away, so nothing is
  // orphaned on the volume.
  const pres = db.prepare('SELECT slides_data FROM presentations WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
  if (!pres) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to delete it.' });
  let slides = [];
  try { slides = JSON.parse(pres.slides_data || '[]'); } catch {}
  const verFiles = versionFiles(db, req.params.id);

  const result = db.prepare('DELETE FROM presentations WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
  if (result.changes) deleteDeckAssets(req.params.id); // the deck's file library goes with it
  if (result.changes === 0) return res.status(404).json({ error: 'Presentation not found or you don\'t have permission to delete it.' });

  for (const f of new Set([...slides.flatMap(s => slideFiles(s)), ...verFiles])) imageStore.remove(f);
  res.json({ message: 'Deleted' });
});

export default router;
