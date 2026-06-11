import jsPDF from 'jspdf';
import { track } from './track';

// Stamps a subtle "Made with HyperBeing" mark in the bottom-right corner of
// a generated slide image — applied to exports for free-plan users.
function addWatermark(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) { resolve(dataUrl); return; }
      ctx.drawImage(img, 0, 0);

      const fontSize = Math.max(12, Math.round(canvas.height * 0.024));
      const padding = Math.round(canvas.height * 0.03);
      const text = 'Made with HyperBeing';

      ctx.font = `600 ${fontSize}px Inter, Arial, sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'bottom';
      ctx.shadowColor = 'rgba(0,0,0,0.35)';
      ctx.shadowBlur = fontSize * 0.5;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillText(text, canvas.width - padding, canvas.height - padding);

      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

// Returns each slide's image_data, watermarked when on the free plan.
// Placeholder SVGs are left untouched.
async function getExportImage(slide, currentPlan) {
  const data = slide.image_data;
  if (!data || data.startsWith('data:image/svg')) return data;
  if (currentPlan !== 'free') return data;
  return addWatermark(data);
}

export async function exportImages(slides, title = 'Presentation', currentPlan = 'free') {
  track('pdf_exported', { format: 'images', slide_count: slides.length, title });
  const safeName = title.replace(/[^a-z0-9]/gi, '_');
  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!slide.image_data) continue;
    const imageData = await getExportImage(slide, currentPlan);
    const link = document.createElement('a');
    link.href = imageData;
    link.download = `${safeName}_slide_${i + 1}.png`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export async function exportToPDF(slides, title = 'Presentation', currentPlan = 'free') {
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

    const imageData = await getExportImage(slide, currentPlan);
    if (added > 0) pdf.addPage([1280, 720], 'landscape');
    const format = imageData.includes('data:image/png') ? 'PNG' : 'JPEG';
    pdf.addImage(imageData, format, 0, 0, 1280, 720);
    added++;
  }

  if (added === 0) return;
  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}
