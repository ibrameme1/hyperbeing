import validator from 'validator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Return only keys present in allowList — strips unexpected fields before they reach the DB or AI
// OWASP A03: prevents mass-assignment and injection of extraneous data into downstream services
function pick(obj, allowList) {
  if (typeof obj !== 'object' || obj === null) return {};
  return Object.fromEntries(
    allowList.filter(k => k in obj).map(k => [k, obj[k]])
  );
}

function fail(res, message, status = 400) {
  return res.status(status).json({ error: message });
}

// Per-attachment size cap: 10 MB binary ≈ 13.5 MB base64 string
const MAX_ATTACHMENT_BYTES = 14_000_000;
const MAX_ATTACHMENTS = 10;
const MAX_MESSAGE_LEN = 4000;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/jpg', 'image/png',
  'image/gif', 'image/webp', 'image/svg+xml',
]);

function validateAttachment(a) {
  if (typeof a !== 'object' || a === null) return 'Each attachment must be an object';
  if (typeof a.data !== 'string' || a.data.length === 0) return 'Attachment must have a non-empty data field';
  if (a.data.length > MAX_ATTACHMENT_BYTES) return 'Attachment exceeds the 10 MB size limit';
  if (a.mimeType !== undefined) {
    if (typeof a.mimeType !== 'string') return 'Attachment mimeType must be a string';
    if (!ALLOWED_MIME_TYPES.has(a.mimeType)) {
      return `Attachment mimeType must be one of: ${[...ALLOWED_MIME_TYPES].join(', ')}`;
    }
  }
  if (a.category !== undefined && !['moodboard', 'branding', 'other'].includes(a.category)) {
    return 'Attachment category must be one of: moodboard, branding, other';
  }
  return null;
}

function validateAttachmentList(attachments, res) {
  if (!Array.isArray(attachments)) return fail(res, 'attachments must be an array');
  if (attachments.length > MAX_ATTACHMENTS) return fail(res, `Maximum ${MAX_ATTACHMENTS} attachments allowed`);
  for (const a of attachments) {
    const err = validateAttachment(a);
    if (err) return fail(res, err);
  }
  return null;
}

// ─── Auth validators ──────────────────────────────────────────────────────────

export function validateRegister(req, res, next) {
  req.body = pick(req.body, ['name', 'email', 'password']);
  const { name, email, password } = req.body;

  if (typeof name !== 'string' || !name.trim()) return fail(res, 'Name is required');
  if (name.trim().length > 100) return fail(res, 'Name must be 100 characters or fewer');

  if (typeof email !== 'string' || !email.trim()) return fail(res, 'Email is required');
  if (!validator.isEmail(email)) return fail(res, 'A valid email address is required');
  if (email.length > 254) return fail(res, 'Email must be 254 characters or fewer');

  if (typeof password !== 'string') return fail(res, 'Password is required');
  if (password.length < 8) return fail(res, 'Password must be at least 8 characters');
  if (password.length > 128) return fail(res, 'Password must be 128 characters or fewer');

  next();
}

export function validateLogin(req, res, next) {
  req.body = pick(req.body, ['email', 'password']);
  const { email, password } = req.body;

  if (typeof email !== 'string' || !email.trim()) return fail(res, 'Email and password are required');
  if (typeof password !== 'string' || !password) return fail(res, 'Email and password are required');
  // Silently reject oversized inputs rather than leaking whether the email exists
  if (email.length > 254 || password.length > 128) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  next();
}

// ─── Presentation validators ──────────────────────────────────────────────────

const VALID_ASPECT_RATIOS = new Set(['16:9', '4:3', '1:1', '9:16']);

export function validateCreatePresentation(req, res, next) {
  req.body = pick(req.body, ['message', 'attachments', 'aspectRatio']);
  const { message, attachments = [], aspectRatio = '16:9' } = req.body;

  if (message !== undefined && typeof message !== 'string') return fail(res, 'message must be a string');
  if (typeof message === 'string' && message.length > MAX_MESSAGE_LEN) {
    return fail(res, `message must be ${MAX_MESSAGE_LEN} characters or fewer`);
  }

  const attErr = validateAttachmentList(attachments, res);
  if (attErr) return attErr;

  if (!VALID_ASPECT_RATIOS.has(aspectRatio)) {
    return fail(res, `aspectRatio must be one of: ${[...VALID_ASPECT_RATIOS].join(', ')}`);
  }

  next();
}

export function validateAnalyzePresentation(req, res, next) {
  req.body = pick(req.body, ['message', 'attachments']);
  const { message, attachments = [] } = req.body;

  if (message !== undefined && typeof message !== 'string') return fail(res, 'message must be a string');
  if (typeof message === 'string' && message.length > MAX_MESSAGE_LEN) {
    return fail(res, `message must be ${MAX_MESSAGE_LEN} characters or fewer`);
  }

  const attErr = validateAttachmentList(attachments, res);
  if (attErr) return attErr;

  next();
}

export function validateAddMessage(req, res, next) {
  req.body = pick(req.body, ['message', 'attachments']);
  const { message, attachments = [] } = req.body;

  if (message !== undefined && typeof message !== 'string') return fail(res, 'message must be a string');
  if (typeof message === 'string' && message.length > MAX_MESSAGE_LEN) {
    return fail(res, `message must be ${MAX_MESSAGE_LEN} characters or fewer`);
  }

  const attErr = validateAttachmentList(attachments, res);
  if (attErr) return attErr;

  next();
}

export function validateRegenerateSlide(req, res, next) {
  req.body = pick(req.body, ['instruction', 'attachments']);
  const { instruction, attachments = [] } = req.body;

  if (typeof instruction !== 'string' || !instruction.trim()) return fail(res, 'Instruction is required');
  if (instruction.length > 1000) return fail(res, 'Instruction must be 1000 characters or fewer');

  const attErr = validateAttachmentList(attachments, res);
  if (attErr) return attErr;

  next();
}

export function validateReorderSlides(req, res, next) {
  req.body = pick(req.body, ['order']);
  const { order } = req.body;

  if (!Array.isArray(order)) return fail(res, 'order must be an array');
  if (order.length > 100) return fail(res, 'order array exceeds maximum allowed length');
  if (!order.every(n => Number.isInteger(n) && n >= 0)) {
    return fail(res, 'order must contain non-negative integers');
  }

  next();
}

// ─── Prompt chat validators ───────────────────────────────────────────────────

export function validatePromptChat(req, res, next) {
  req.body = pick(req.body, ['message', 'images']);
  const { message, images = [] } = req.body;

  if (message !== undefined && typeof message !== 'string') return fail(res, 'message must be a string');
  if (typeof message === 'string' && message.length > MAX_MESSAGE_LEN) {
    return fail(res, `message must be ${MAX_MESSAGE_LEN} characters or fewer`);
  }

  if (!Array.isArray(images)) return fail(res, 'images must be an array');
  if (images.length > MAX_ATTACHMENTS) return fail(res, `Maximum ${MAX_ATTACHMENTS} images allowed`);
  for (const img of images) {
    if (typeof img !== 'object' || img === null) return fail(res, 'Each image must be an object');
    if (typeof img.data !== 'string' || img.data.length === 0) {
      return fail(res, 'Each image must have a non-empty data field');
    }
    if (img.data.length > MAX_ATTACHMENT_BYTES) return fail(res, 'Image exceeds the 10 MB size limit');
  }

  next();
}

// ─── Path parameter validators ────────────────────────────────────────────────

/**
 * Express router.param handler that validates UUID path parameters.
 * Returns 404 (not 400) to avoid revealing the expected format to attackers.
 * Usage: router.param('id', requireUUIDParam)
 */
export function requireUUIDParam(req, res, next, value) {
  if (!validator.isUUID(value)) {
    return res.status(404).json({ error: 'Not found' });
  }
  next();
}
