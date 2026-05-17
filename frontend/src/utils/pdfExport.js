import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

export function exportImages(slides, title = 'Presentation') {
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
  const pdf = new jsPDF({
    orientation: 'landscape',
    unit: 'pt',
    format: [1280, 720],
  });

  for (let i = 0; i < slides.length; i++) {
    const slide = slides[i];
    if (!slide.image_data) continue;

    const container = document.createElement('div');
    container.style.cssText = `
      position: fixed;
      left: -9999px;
      top: 0;
      width: 1280px;
      height: 720px;
      overflow: hidden;
    `;

    const slideEl = buildSlideElement(slide);
    container.appendChild(slideEl);
    document.body.appendChild(container);

    try {
      const canvas = await html2canvas(container, {
        width: 1280,
        height: 720,
        scale: 1,
        useCORS: true,
        backgroundColor: null,
        logging: false,
      });

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      if (i > 0) pdf.addPage([1280, 720], 'landscape');
      pdf.addImage(imgData, 'JPEG', 0, 0, 1280, 720);
    } finally {
      document.body.removeChild(container);
    }
  }

  pdf.save(`${title.replace(/[^a-z0-9]/gi, '_')}.pdf`);
}

function buildSlideElement(slide) {
  const div = document.createElement('div');
  div.style.cssText = `
    width: 1280px;
    height: 720px;
    position: relative;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif;
  `;

  // Background
  const bg = document.createElement('div');
  bg.style.cssText = `
    position: absolute;
    inset: 0;
    background-image: url(${slide.image_data});
    background-size: cover;
    background-position: center;
  `;
  div.appendChild(bg);

  // Overlay
  const overlay = document.createElement('div');
  overlay.style.cssText = `
    position: absolute;
    inset: 0;
    background: linear-gradient(to bottom, rgba(0,0,0,0.05) 0%, rgba(0,0,0,0.25) 50%, rgba(0,0,0,0.65) 100%);
  `;
  div.appendChild(overlay);

  // Content
  const content = document.createElement('div');
  content.style.cssText = `
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    padding: 64px;
  `;

  if (slide.type === 'cover') {
    content.style.justifyContent = 'flex-end';
    content.innerHTML = `
      <h1 style="color:white;font-size:72px;font-weight:700;line-height:1.1;margin:0 0 16px">${slide.title || ''}</h1>
      ${slide.subtitle ? `<p style="color:rgba(255,255,255,0.8);font-size:32px;margin:0">${slide.subtitle}</p>` : ''}
    `;
  } else if (slide.type === 'quote') {
    content.style.justifyContent = 'center';
    content.innerHTML = `
      <p style="color:white;font-size:52px;font-weight:600;line-height:1.3;margin:0 0 24px;font-style:italic">"${slide.title}"</p>
      ${slide.subtitle ? `<p style="color:rgba(255,255,255,0.7);font-size:24px;margin:0">— ${slide.subtitle}</p>` : ''}
    `;
  } else {
    content.style.justifyContent = 'flex-start';
    const points = slide.key_points || [];
    content.innerHTML = `
      <h2 style="color:white;font-size:48px;font-weight:700;margin:0 0 32px;line-height:1.2">${slide.title || ''}</h2>
      ${points.map(p => `
        <div style="display:flex;align-items:flex-start;gap:16px;margin-bottom:16px">
          <div style="width:8px;height:8px;background:#007AFF;border-radius:50%;margin-top:14px;flex-shrink:0"></div>
          <p style="color:rgba(255,255,255,0.92);font-size:28px;margin:0;line-height:1.5">${p}</p>
        </div>
      `).join('')}
    `;
  }

  div.appendChild(content);
  return div;
}
