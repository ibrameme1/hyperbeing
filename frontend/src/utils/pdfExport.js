import jsPDF from 'jspdf';
import { track } from './track';

export function exportImages(slides, title = 'Presentation') {
  track('pdf_exported', { format: 'images', slide_count: slides.length, title });
  const safeName = title.replace(/[^a-z0-9]/gi, '_');
  slides.forEach((slide, i) => {
    if (!slide.image_data) return;
    const link = document.createElement('a');
    link.href = slide.image_data;
    link.download = `${safeName}_slide_${i + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

export async function exportToPDF(slides, title = 'Presentation') {
  track('pdf_exported', { format: 'pdf', slide_count: slides.length, title });
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [1280, 720],
  });

  let added = 0;
  for (const slide of slides) {
    if (!slide.image_data) continue;
    if (slide.image_data.startsWith('data:image/svg')) continue;

    if (added > 0) pdf.addPage([1280, 720], 'landscape');
    const format = slide.image_data.includes('data:image/png') ? 'PNG' : 'JPEG';
    pdf.addImage(slide.image_data, format, 0, 0, 1280, 720);
    added++;
  }

  if (added === 0) return;
  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}
