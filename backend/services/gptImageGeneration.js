import { logger, requestContext } from './logger.js';
import { tracer } from './tracer.js';

const MOCK_MODE = !process.env.OPENAI_API_KEY || process.env.OPENAI_API_KEY === 'demo';

// "GPT Image 2.0" — OpenAI's image generation model
const IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-2';

const OPENAI_BASE_URL = 'https://api.openai.com/v1';

// Design mode always requests medium quality, ~1K resolution. gpt-image-2
// accepts arbitrary WIDTHxHEIGHT sizes (divisible by 16, aspect ratio
// between 1:3 and 3:1) but enforces a minimum pixel budget (1024x1024 ≈ 1.05MP)
// — 1024x576 falls below that, so these sizes keep exact aspect ratios
// while staying above the minimum.
const SIZE_FOR_ASPECT_RATIO = {
  '16:9': '1536x864',
  '9:16': '864x1536',
  '1:1': '1024x1024',
};

function dataUrlToBlob(dataUrl) {
  const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
  const mimeType = match ? match[1] : 'image/png';
  const base64 = match ? match[2] : dataUrl;
  const buffer = Buffer.from(base64, 'base64');
  return new Blob([buffer], { type: mimeType });
}

// Generates a single design image with GPT Image 2.0. If `referenceImages`
// are provided, uses the image-edit endpoint so the model can use them as
// visual references. Returns a data URL, or null on failure.
export async function generateDesignImage(prompt, referenceImages = [], aspectRatio = '16:9', index = 0) {
  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  const stepName = `gpt_image_${index}`;
  tracer.recordStep(_tid, stepName, 'started', 0);

  if (MOCK_MODE) {
    const delay = 800 + Math.random() * 1200;
    await new Promise(r => setTimeout(r, delay));
    tracer.recordStep(_tid, stepName, 'completed', Date.now() - _t);
    return generatePlaceholder(prompt, aspectRatio, index);
  }

  const size = SIZE_FOR_ASPECT_RATIO[aspectRatio] || SIZE_FOR_ASPECT_RATIO['16:9'];
  const maxAttempts = 3;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      let response;
      if (referenceImages.length > 0) {
        const form = new FormData();
        form.append('model', IMAGE_MODEL);
        form.append('prompt', prompt);
        form.append('size', size);
        form.append('quality', 'medium');
        form.append('n', '1');
        referenceImages.slice(0, 4).forEach((img, i) => {
          if (img?.data) form.append('image[]', dataUrlToBlob(img.data), `reference_${i}.png`);
        });

        response = await fetch(`${OPENAI_BASE_URL}/images/edits`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
          body: form,
        });
      } else {
        response = await fetch(`${OPENAI_BASE_URL}/images/generations`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: IMAGE_MODEL,
            prompt,
            size,
            quality: 'medium',
            n: 1,
          }),
        });
      }

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        const isTransient = response.status === 429 || response.status >= 500;
        const logCtx = { index, attempt, status: response.status, errBody: errBody.slice(0, 500), isTransient, model: IMAGE_MODEL, size, promptPreview: prompt.slice(0, 200) };
        if (attempt < maxAttempts && isTransient) {
          logger.warn('gpt image gen failed, retrying', logCtx);
          await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
          continue;
        }
        logger.error('gpt image gen failed', logCtx);
        tracer.recordStep(_tid, stepName, 'failed', Date.now() - _t, `HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        return null;
      }

      const json = await response.json();
      const b64 = json?.data?.[0]?.b64_json;
      if (!b64) {
        if (attempt < maxAttempts) {
          logger.warn('gpt image gen returned no image, retrying', { index, attempt });
          continue;
        }
        logger.error('gpt image gen returned no image', { index, attempt, model: IMAGE_MODEL, size, responsePreview: JSON.stringify(json).slice(0, 300) });
        tracer.recordStep(_tid, stepName, 'failed', Date.now() - _t, 'no image data');
        return null;
      }

      tracer.recordStep(_tid, stepName, 'completed', Date.now() - _t);
      return `data:image/png;base64,${b64}`;
    } catch (err) {
      if (attempt < maxAttempts) {
        logger.warn('gpt image gen errored, retrying', { index, attempt, errorMessage: err.message });
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000));
        continue;
      }
      logger.error('gpt image gen errored', { index, attempt, errorMessage: err.message, stack: err.stack?.split('\n').slice(0, 3).join('\n'), model: IMAGE_MODEL, size, promptPreview: prompt.slice(0, 200) });
      tracer.recordStep(_tid, stepName, 'failed', Date.now() - _t, err.message);
      return null;
    }
  }

  return null;
}

const ASPECT_DIMENSIONS = {
  '16:9': [1536, 1024],
  '9:16': [1024, 1536],
  '1:1': [1024, 1024],
};

const GRADIENT_SETS = [
  { stops: [['#0f0c29', 0], ['#302b63', 50], ['#24243e', 100]], accent: '#7b61ff' },
  { stops: [['#1a1a2e', 0], ['#16213e', 50], ['#0f3460', 100]], accent: '#4facfe' },
  { stops: [['#2d1b69', 0], ['#11998e', 100]], accent: '#38ef7d' },
  { stops: [['#2c003e', 0], ['#f64f59', 100]], accent: '#f093fb' },
];

function escapeXml(str) {
  return String(str).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c]));
}

function generatePlaceholder(prompt, aspectRatio = '16:9', index = 0) {
  const [w, h] = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['16:9'];
  const palette = GRADIENT_SETS[index % GRADIENT_SETS.length];
  const gradStops = palette.stops.map(([c, p]) => `<stop offset="${p}%" stop-color="${c}"/>`).join('');
  const label = escapeXml((prompt || '').slice(0, 80));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">${gradStops}</linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    <circle cx="${w * 0.85}" cy="${h * 0.18}" r="${h * 0.45}" fill="${palette.accent}" fill-opacity="0.08"/>
    <circle cx="${w * 0.12}" cy="${h * 0.88}" r="${h * 0.3}" fill="${palette.accent}" fill-opacity="0.06"/>
    <text x="${w / 2}" y="${h / 2}" font-size="${h * 0.035}" font-family="Arial, sans-serif" fill="#ffffff" fill-opacity="0.5" text-anchor="middle">${label}</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
