// Shared attachment SHAPE validation — used by presentations.js and design.js.
// Attachments are { type?: 'image'|'file'|'document', name: string, data: base64 data URL }.
//
// This is the cheap, synchronous first gate. Routes that accept documents
// (the deck-creation brief) then run services/fileIngest.js, which checks
// magic bytes, ZIP safety, macros etc. and extracts the content. Routes that
// only take images (edits, add slides, Design Mode) keep allowDocuments off:
// anything that isn't a raster image data URL is refused there, so a PDF or
// SVG can't slip through to an image-only Claude / image-model call.

const IMAGE_DATA_URL = /^data:image\/(png|jpe?g|gif|webp);base64,/i;

export function validateAttachment(a, { allowDocuments = false } = {}) {
  if (typeof a !== 'object' || a === null) return 'Must be an object';
  if (a.type !== undefined && !['image', 'file', 'document'].includes(a.type)) return 'Invalid type';
  if (typeof a.name !== 'string' || a.name.length > 255) return 'Invalid name';
  if (typeof a.data !== 'string') return 'Missing data';
  if (a.type === 'document') {
    if (!allowDocuments) return 'Only images can be attached here.';
    // Office files can be up to 25MB → ~34M base64 chars.
    if (a.data.length > 35_000_000) return `"${a.name}" is too large (max 25MB).`;
    if (!/^data:[^;,]*(;[^;,]*)*;base64,/.test(a.data.slice(0, 200))) return `"${a.name}" could not be read.`;
    return null;
  }
  // Base64 data URIs can be large — cap at ~7MB per attachment
  if (a.data.length > 10_000_000) return 'One of your images is too large (max ~7MB). Please use a smaller image.';
  if (!IMAGE_DATA_URL.test(a.data.slice(0, 40))) return `"${a.name.slice(0, 60)}" isn't a supported image (PNG, JPG, WEBP or GIF).`;
  return null;
}

// Validates an attachments array: must be an array, within the count limit,
// and every item must pass validateAttachment()
export function validateAttachments(attachments, maxCount = 10, itemNoun = 'attachments', { allowDocuments = false } = {}) {
  if (!Array.isArray(attachments)) return 'Attachments must be an array';
  if (attachments.length > maxCount) return `Too many ${itemNoun} (max ${maxCount})`;
  for (const a of attachments) {
    const err = validateAttachment(a, { allowDocuments });
    if (err) return err;
  }
  return null;
}
