// Shared attachment validation — used by presentations.js and design.js.
// Attachments are { type?: 'image'|'file', name: string, data: base64 data URL }.

export function validateAttachment(a) {
  if (typeof a !== 'object' || a === null) return 'Must be an object';
  if (a.type !== undefined && !['image', 'file'].includes(a.type)) return 'Invalid type';
  if (typeof a.name !== 'string' || a.name.length > 255) return 'Invalid name';
  if (typeof a.data !== 'string') return 'Missing data';
  // Base64 data URIs can be large — cap at ~7MB per attachment
  if (a.data.length > 10_000_000) return 'One of your images is too large (max ~7MB). Please use a smaller image.';
  return null;
}

// Validates an attachments array: must be an array, within the count limit,
// and every item must pass validateAttachment()
export function validateAttachments(attachments, maxCount = 10, itemNoun = 'attachments') {
  if (!Array.isArray(attachments)) return 'Attachments must be an array';
  if (attachments.length > maxCount) return `Too many ${itemNoun} (max ${maxCount})`;
  for (const a of attachments) {
    const err = validateAttachment(a);
    if (err) return err;
  }
  return null;
}
