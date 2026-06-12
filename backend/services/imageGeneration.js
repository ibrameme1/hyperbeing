import { GoogleGenAI } from '@google/genai';
import { logger, requestContext } from './logger.js';
import { tracer } from './tracer.js';

const MOCK_MODE = !process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'demo';

// Nano Banana — Google AI Studio image generation model
const IMAGE_GEN_MULTIMODAL = 'gemini-3.1-flash-image-preview';

let ai;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  return ai;
}

export async function generateSlideImage(nanaBananaPrompt, slideType, theme, colorPalette, slideIndex = 0, attachedImages = [], aspectRatio = '16:9') {
  if (MOCK_MODE) {
    const delay = 700 + Math.random() * 900;
    await new Promise(r => setTimeout(r, delay));
    return generateRichPlaceholder(slideType, theme, slideIndex);
  }

  const _tid = requestContext.getStore()?.requestId;
  const _step = `nanobanana_slide_${slideIndex}`;
  const _t = Date.now();
  tracer.recordStep(_tid, _step, 'started', 0);

  const fullPrompt = buildFullPrompt(nanaBananaPrompt, slideType, theme, colorPalette);

  // All slides use Nano Banana (Gemini Flash Image) — supports both text-only and reference image input
  const parts = [{ text: fullPrompt }];
  for (const img of attachedImages) {
    if (img?.data) {
      parts.push({ inlineData: {
        mimeType: img.mimeType || 'image/png',
        data: img.data.replace(/^data:[^;]+;base64,/, ''),
      }});
    }
  }
  if (attachedImages.length > 0) {
    parts.push({ text: 'Use the reference images above to match the visual style, layout energy, brand colours, and design language. Generate a premium presentation-ready slide image.' });
  }

  logger.debug('nano banana image gen start', { slideIndex, slideType, attachedImages: attachedImages.length });

  const maxAttempts = 4;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await getClient().models.generateContent({
        model: IMAGE_GEN_MULTIMODAL,
        contents: [{ role: 'user', parts }],
        config: { responseModalities: ['IMAGE', 'TEXT'], aspectRatio },
      });
      const imagePart = (response.candidates?.[0]?.content?.parts ?? [])
        .find(p => p.inlineData?.mimeType?.startsWith('image/'));
      if (imagePart) {
        logger.debug('nano banana image gen success', { slideIndex });
        tracer.recordStep(_tid, _step, 'completed', Date.now() - _t);
        return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
      }
      logger.warn('nano banana returned no image', { slideIndex, attempt });
    } catch (err) {
      const msg = err.message || '';
      const isTransient = msg.includes('fetch failed') || msg.includes('503')
        || msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') || msg.includes('Resource has been exhausted');
      logger.warn('nano banana image gen failed', { slideIndex, attempt, maxAttempts, errorMessage: msg, isTransient });
      if (attempt < maxAttempts && isTransient) {
        await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000)); // 2s, 4s, 8s
        continue;
      }
      tracer.recordStep(_tid, _step, 'failed', Date.now() - _t, msg);
    }
    break;
  }

  tracer.recordStep(_tid, _step, 'completed', Date.now() - _t);
  return generateRichPlaceholder(slideType, theme, slideIndex);
}

function buildFullPrompt(basePrompt, slideType, theme, colorPalette) {
  const typeGuidance = {
    cover: 'hero full-bleed atmospheric powerful impactful opening slide',
    section: 'bold graphic section divider, strong typographic energy',
    content: 'clean airy presentation background, not distracting, supports text readability',
    quote: 'atmospheric moody editorial background, inspiring and cinematic',
    data: 'analytical structured background, implies data and insight, subtle grid or chart elements',
    image: 'full-bleed cinematic hero image, high production value',
    conclusion: 'forward-looking hopeful inspiring bright energy, strong closing feel',
  };

  const themeGuidance = {
    'modern-minimal': 'ultra-clean minimalist design, geometric shapes, ample white space, refined typography feel',
    'bold-gradient': 'bold vibrant colour gradients, dynamic energetic composition, high contrast',
    'corporate': 'professional corporate aesthetic, trustworthy polished elegant',
    'creative': 'creative artistic expressive composition, unique visual style',
    'tech': 'futuristic technology aesthetic, digital data streams, cutting-edge, dark moody',
  };

  const parts = [
    basePrompt,
    'Create a highly engaging, premium, presentation-ready slide image.',
    'The image should be polished, visually rich, clear, and easy to present.',
    typeGuidance[slideType] || typeGuidance.content,
    themeGuidance[theme] || '',
    colorPalette?.primary ? `Primary colour palette: ${colorPalette.primary}, secondary: ${colorPalette.secondary || ''}` : '',
    'Professional presentation background, 16:9 widescreen aspect ratio.',
    'No visible UI elements, no watermarks, no random text overlays.',
    'Ultra high resolution, photorealistic or premium illustration quality.',
  ];

  return parts.filter(Boolean).join('. ');
}

// ─── Edit-failure overlay (keeps original slide image, stamps a retry banner) ──

const ASPECT_DIMENSIONS = {
  '16:9': [1600, 900],
  '9:16': [900, 1600],
  '4:3': [1600, 1200],
  '3:4': [1200, 1600],
  '1:1': [1200, 1200],
};

export function generateEditFailedImage(originalImageData, aspectRatio = '16:9') {
  const [w, h] = ASPECT_DIMENSIONS[aspectRatio] || ASPECT_DIMENSIONS['16:9'];
  const bannerH = Math.round(h * 0.16);
  const bannerY = Math.round((h - bannerH) / 2);
  const imageLayer = originalImageData
    ? `<image href="${originalImageData}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="xMidYMid slice"/>`
    : '';
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    ${imageLayer}
    <rect x="0" y="${bannerY}" width="${w}" height="${bannerH}" fill="#000000" fill-opacity="0.65"/>
    <text x="${w / 2}" y="${bannerY + bannerH * 0.42}" font-size="${bannerH * 0.32}" font-family="Arial, sans-serif" fill="#ffffff" text-anchor="middle" font-weight="bold">Edit failed</text>
    <text x="${w / 2}" y="${bannerY + bannerH * 0.78}" font-size="${bannerH * 0.22}" font-family="Arial, sans-serif" fill="#ffffff" text-anchor="middle">Retry the changes</text>
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ─── Rich placeholder gradients (mock / fallback) ─────────────────────────

const GRADIENT_SETS = [
  { stops: [['#0f0c29', 0], ['#302b63', 50], ['#24243e', 100]], accent: '#7b61ff' },
  { stops: [['#0f2027', 0], ['#203a43', 50], ['#2c5364', 100]], accent: '#00c9ff' },
  { stops: [['#1a1a2e', 0], ['#16213e', 50], ['#0f3460', 100]], accent: '#4facfe' },
  { stops: [['#141e30', 0], ['#243b55', 100]], accent: '#667eea' },
  { stops: [['#2d1b69', 0], ['#11998e', 100]], accent: '#38ef7d' },
  { stops: [['#2c003e', 0], ['#f64f59', 100]], accent: '#f093fb' },
  { stops: [['#0a3d2e', 0], ['#11998e', 100]], accent: '#43e97b' },
  { stops: [['#1a0a00', 0], ['#6b2d0a', 50], ['#f7971e', 100]], accent: '#ffd200' },
  { stops: [['#2b2d42', 0], ['#3d4b6b', 100]], accent: '#8ecae6' },
  { stops: [['#0d0d0d', 0], ['#1a0533', 50], ['#0d0d0d', 100]], accent: '#b721ff' },
];

const SHAPES = {
  cover: (w, h, a) => `
    <circle cx="${w*.85}" cy="${h*.15}" r="${h*.5}" fill="${a}" fill-opacity="0.08"/>
    <circle cx="${w*.1}" cy="${h*.9}" r="${h*.3}" fill="${a}" fill-opacity="0.06"/>`,
  section: (w, h, a) => `
    <rect x="${w*.05}" y="${h*.3}" width="${w*.9}" height="2" fill="${a}" fill-opacity="0.15"/>
    <circle cx="${w*.92}" cy="${h*.5}" r="${h*.35}" fill="${a}" fill-opacity="0.05"/>`,
  content: (w, h, a) => `
    <rect x="${w*.75}" y="0" width="${w*.25}" height="${h}" fill="${a}" fill-opacity="0.04"/>
    <circle cx="${w*.9}" cy="${h*.2}" r="${h*.25}" fill="${a}" fill-opacity="0.06"/>`,
  data: (w, h, a) => `
    ${Array.from({length:8},(_,i)=>`<line x1="${w*.05+i*w*.13}" y1="${h*.1}" x2="${w*.05+i*w*.13}" y2="${h*.9}" stroke="${a}" stroke-opacity="0.05" stroke-width="1"/>`).join('')}
    <circle cx="${w*.8}" cy="${h*.3}" r="${h*.18}" fill="${a}" fill-opacity="0.07"/>`,
  quote: (w, h, a) => `
    <text x="${w*.07}" y="${h*.45}" font-size="${h*.5}" fill="${a}" fill-opacity="0.07" font-family="Georgia,serif">&ldquo;</text>`,
  image: (w, h, a) => `
    <circle cx="${w*.5}" cy="${h*.5}" r="${h*.55}" fill="${a}" fill-opacity="0.06"/>`,
  conclusion: (w, h, a) => `
    <circle cx="${w*.5}" cy="${h*1.1}" r="${h*.8}" fill="${a}" fill-opacity="0.07"/>
    <circle cx="${w*.5}" cy="${h*1.1}" r="${h*.55}" fill="${a}" fill-opacity="0.05"/>`,
};

function generateRichPlaceholder(slideType = 'content', theme = 'modern-minimal', index = 0) {
  const palette = GRADIENT_SETS[index % GRADIENT_SETS.length];
  const w = 1600, h = 900;
  const gradStops = palette.stops.map(([c, p]) => `<stop offset="${p}%" stop-color="${c}"/>`).join('');
  const shapesFn = SHAPES[slideType] || SHAPES.content;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs><linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">${gradStops}</linearGradient></defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    ${shapesFn(w, h, palette.accent)}
  </svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
