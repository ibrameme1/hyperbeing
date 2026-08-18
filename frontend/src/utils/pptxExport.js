import api from '../api/client';
import { track } from './track';

// PowerPoint export. Unlike the PDF and image exports, this one is built on the
// server: each slide render is measured and rebuilt as live PowerPoint objects
// (text boxes, shapes, native charts) by the img2pptx pipeline, which starts in
// the background as soon as a deck finishes generating. By the time anyone opens
// the export menu the file is usually already sitting on disk, so this is a
// download rather than a conversion.
//
// If the editable build hasn't landed yet the server returns a flat
// one-image-per-slide deck instead of making the user wait, and says which it
// was in X-Pptx-Mode — the caller surfaces that so they know they can re-export
// for the editable version in a moment.

export async function fetchPptxStatus(presentationId) {
  try {
    const { data } = await api.get(`/presentations/${presentationId}/export/pptx/status`);
    return data;
  } catch {
    return null;
  }
}

export async function exportToPPTX(presentationId, title = 'Presentation') {
  track('pptx_exported', { presentation_id: presentationId, title });

  const res = await api.get(`/presentations/${presentationId}/export/pptx`, { responseType: 'blob' });

  const mode = res.headers['x-pptx-mode'] || 'editable';
  const editableSlides = parseInt(res.headers['x-pptx-editable-slides'] || '0', 10);
  const totalSlides = parseInt(res.headers['x-pptx-total-slides'] || '0', 10);

  const url = URL.createObjectURL(
    new Blob([res.data], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' })
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `${(title || 'presentation').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '') || 'presentation'}.pptx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  // Revoking immediately can cancel the download in Safari — give it a beat.
  setTimeout(() => URL.revokeObjectURL(url), 10000);

  return { mode, editableSlides, totalSlides };
}
