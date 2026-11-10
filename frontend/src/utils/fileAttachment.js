// Client-side gate for files attached to a brief. The server re-validates
// everything (magic bytes, ZIP/macro safety, page limits) in
// backend/services/fileIngest.js — these checks only exist to fail fast with a
// friendly message before a large upload. Keep the limits in sync.
import { fileToImageAttachment } from './imageAttachment';

const MB = 1024 * 1024;

export const DOCUMENT_TYPES = {
  pdf: { label: 'PDF', max: 15 * MB },
  pptx: { label: 'PowerPoint', max: 25 * MB },
  xlsx: { label: 'Excel', max: 25 * MB },
  docx: { label: 'Word', max: 25 * MB },
  csv: { label: 'CSV', max: 2 * MB },
  tsv: { label: 'TSV', max: 2 * MB },
  txt: { label: 'Text', max: 2 * MB },
  md: { label: 'Markdown', max: 2 * MB },
  json: { label: 'JSON', max: 2 * MB },
};
export const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];
export const MAX_DOCUMENTS = 5;
export const MAX_IMAGES = 10;
export const MAX_TOTAL_DOCUMENT_BYTES = 30 * MB;

const REFUSED = {
  ppt: 'Save it as .pptx first', xls: 'Save it as .xlsx first', doc: 'Save it as .docx first',
  pptm: 'Macro-enabled files aren\'t accepted, save it as .pptx', xlsm: 'Macro-enabled files aren\'t accepted, save it as .xlsx', docm: 'Macro-enabled files aren\'t accepted, save it as .docx',
  key: 'Export it as .pptx or PDF', numbers: 'Export it as .xlsx or CSV', pages: 'Export it as .docx or PDF',
  heic: 'Export it as JPG or PNG', heif: 'Export it as JPG or PNG', svg: 'Export it as PNG', zip: 'Upload the files inside it individually',
};

// react-dropzone `accept` maps.
export const ACCEPT_IMAGES = { 'image/png': ['.png'], 'image/jpeg': ['.jpg', '.jpeg'], 'image/webp': ['.webp'], 'image/gif': ['.gif'] };
export const ACCEPT_DOCUMENTS = {
  'application/pdf': ['.pdf'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'text/csv': ['.csv'], 'text/tab-separated-values': ['.tsv'], 'text/plain': ['.txt'], 'text/markdown': ['.md'], 'application/json': ['.json'],
};
// Inspiration: pictures plus PDFs / decks of a look the user likes.
export const ACCEPT_INSPIRATION = { ...ACCEPT_IMAGES, 'application/pdf': ['.pdf'], 'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'] };

export function extOf(name) {
  const m = /\.([a-z0-9]{1,10})$/i.exec(name || '');
  return m ? m[1].toLowerCase() : '';
}
export const isImageFile = (file) => IMAGE_EXTENSIONS.includes(extOf(file.name));
export const isDocumentFile = (file) => !!DOCUMENT_TYPES[extOf(file.name)];

export function formatBytes(n) {
  if (!n) return '';
  return n >= MB ? `${(n / MB).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Returns an error sentence for a file that can't be attached, or null. */
export function checkFile(file, { allowDocuments = true, allowImages = true, docKinds = null } = {}) {
  const ext = extOf(file.name);
  if (REFUSED[ext]) return `"${file.name}": ${REFUSED[ext]}.`;
  if (IMAGE_EXTENSIONS.includes(ext)) {
    if (!allowImages) return `"${file.name}": drop images in Branding or Moodboard.`;
    return null; // big images are downscaled client-side
  }
  const type = DOCUMENT_TYPES[ext];
  if (!type || !allowDocuments || (docKinds && !docKinds.includes(ext))) {
    return `"${file.name}": this file type isn't supported here.`;
  }
  if (file.size === 0) return `"${file.name}" is empty.`;
  if (file.size > type.max) return `"${file.name}" is too large (max ${formatBytes(type.max)} for ${type.label} files).`;
  return null;
}

function readAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

const id = () => Math.random().toString(36).slice(2);

/** Reads a file into the attachment shape the API expects. */
export async function fileToAttachment(file, { purpose = 'content' } = {}) {
  if (isImageFile(file)) {
    const { data, mimeType } = await fileToImageAttachment(file);
    return { id: id(), name: file.name, type: 'image', mimeType, data, size: file.size };
  }
  const data = await readAsDataURL(file);
  return { id: id(), name: file.name, type: 'document', mimeType: file.type || 'application/octet-stream', data, size: file.size, kind: extOf(file.name), purpose };
}
