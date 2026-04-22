import { GoogleGenAI } from '@google/genai';

const MOCK_MODE = !process.env.GOOGLE_API_KEY || process.env.GOOGLE_API_KEY === 'demo';

let ai;
function getClient() {
  if (!ai) ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_API_KEY });
  return ai;
}

const THEME_MODIFIERS = {
  'modern-minimal': 'ultra-clean minimalist design, geometric shapes, ample negative space',
  'bold-gradient': 'bold vibrant colour gradients, dynamic energetic composition',
  'corporate': 'professional corporate aesthetic, trustworthy, polished, elegant',
  'creative': 'creative artistic composition, unique visual style, expressive',
  'tech': 'futuristic technology aesthetic, digital data visualisation, cutting-edge',
};

const TYPE_MODIFIERS = {
  cover: 'hero image, full-bleed, atmospheric, powerful, impactful',
  section: 'divider graphic, bold, graphic design element, section header vibe',
  content: 'subtle presentation background, not distracting, soft and airy',
  quote: 'atmospheric moody background, inspiring, editorial photography style',
  data: 'abstract data visualisation implied, analytical, graphs and numbers mood',
  image: 'full-bleed featured hero image, cinematic, high impact',
  conclusion: 'forward-looking, hopeful, inspiring, bright future aesthetic',
};

function buildPrompt(basePrompt, slideType, theme, colorPalette) {
  const parts = [basePrompt];
  if (theme && THEME_MODIFIERS[theme]) parts.push(THEME_MODIFIERS[theme]);
  if (slideType && TYPE_MODIFIERS[slideType]) parts.push(TYPE_MODIFIERS[slideType]);
  if (colorPalette?.primary) {
    parts.push(`dominant colour palette: ${colorPalette.primary} and ${colorPalette.secondary || ''}`);
  }
  parts.push(
    'professional presentation background',
    '16:9 widescreen aspect ratio',
    'no text, no words, no letters',
    'no UI elements, no watermarks',
    'photorealistic or premium illustration',
    'ultra high resolution 4K'
  );
  return parts.filter(Boolean).join(', ');
}

export async function generateSlideImage(basePrompt, slideType, theme, colorPalette, slideIndex = 0) {
  if (MOCK_MODE) {
    // Simulate generation time so the loading animation is visible
    const delay = 700 + Math.random() * 900;
    await new Promise(r => setTimeout(r, delay));
    return generateRichPlaceholder(slideType, theme, slideIndex);
  }

  const prompt = buildPrompt(basePrompt, slideType, theme, colorPalette);

  try {
    const response = await getClient().models.generateImages({
      model: 'imagen-3.0-generate-002',
      prompt,
      config: {
        numberOfImages: 1,
        aspectRatio: '16:9',
        safetyFilterLevel: 'block_only_high',
        addWatermark: false,
      },
    });
    const imageBytes = response.generatedImages[0].image.imageBytes;
    return `data:image/png;base64,${Buffer.from(imageBytes).toString('base64')}`;
  } catch (imagenErr) {
    console.warn('Imagen 3 failed, trying Gemini 2.0 Flash:', imagenErr.message);
  }

  try {
    const response = await getClient().models.generateContent({
      model: 'gemini-2.0-flash-preview-image-generation',
      contents: prompt,
      config: { responseModalities: ['IMAGE'] },
    });
    const parts = response.candidates?.[0]?.content?.parts ?? [];
    const imagePart = parts.find(p => p.inlineData?.mimeType?.startsWith('image/'));
    if (imagePart) {
      return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    }
  } catch (geminiErr) {
    console.warn('Gemini image generation failed:', geminiErr.message);
  }

  return generateRichPlaceholder(slideType, theme, slideIndex);
}

// ─── Beautiful placeholder gradients ─────────────────────────────────────

const GRADIENT_SETS = [
  // 0: deep purple
  { stops: [['#0f0c29', 0], ['#302b63', 50], ['#24243e', 100]], accent: '#7b61ff' },
  // 1: ocean teal
  { stops: [['#0f2027', 0], ['#203a43', 50], ['#2c5364', 100]], accent: '#00c9ff' },
  // 2: midnight navy
  { stops: [['#1a1a2e', 0], ['#16213e', 50], ['#0f3460', 100]], accent: '#4facfe' },
  // 3: deep indigo
  { stops: [['#141e30', 0], ['#243b55', 100]], accent: '#667eea' },
  // 4: rich plum
  { stops: [['#2d1b69', 0], ['#11998e', 100]], accent: '#38ef7d' },
  // 5: dark rose
  { stops: [['#2c003e', 0], ['#f64f59', 100]], accent: '#f093fb' },
  // 6: forest dark
  { stops: [['#0a3d2e', 0], ['#11998e', 100]], accent: '#43e97b' },
  // 7: warm amber
  { stops: [['#1a0a00', 0], ['#6b2d0a', 50], ['#f7971e', 100]], accent: '#ffd200' },
  // 8: slate blue
  { stops: [['#2b2d42', 0], ['#3d4b6b', 100]], accent: '#8ecae6' },
  // 9: electric
  { stops: [['#0d0d0d', 0], ['#1a0533', 50], ['#0d0d0d', 100]], accent: '#b721ff' },
];

const SHAPES = {
  cover: (w, h, accent) => `
    <circle cx="${w * 0.85}" cy="${h * 0.15}" r="${h * 0.5}" fill="${accent}" fill-opacity="0.08"/>
    <circle cx="${w * 0.1}" cy="${h * 0.9}" r="${h * 0.3}" fill="${accent}" fill-opacity="0.06"/>
    <line x1="0" y1="${h * 0.6}" x2="${w}" y2="${h * 0.6}" stroke="${accent}" stroke-opacity="0.04" stroke-width="1"/>
  `,
  section: (w, h, accent) => `
    <rect x="${w * 0.05}" y="${h * 0.3}" width="${w * 0.9}" height="2" fill="${accent}" fill-opacity="0.15"/>
    <rect x="${w * 0.05}" y="${h * 0.7}" width="${w * 0.6}" height="1" fill="${accent}" fill-opacity="0.10"/>
    <circle cx="${w * 0.92}" cy="${h * 0.5}" r="${h * 0.35}" fill="${accent}" fill-opacity="0.05"/>
  `,
  content: (w, h, accent) => `
    <rect x="${w * 0.75}" y="0" width="${w * 0.25}" height="${h}" fill="${accent}" fill-opacity="0.04"/>
    <circle cx="${w * 0.9}" cy="${h * 0.2}" r="${h * 0.25}" fill="${accent}" fill-opacity="0.06"/>
    <line x1="${w * 0.05}" y1="${h * 0.88}" x2="${w * 0.5}" y2="${h * 0.88}" stroke="${accent}" stroke-opacity="0.08" stroke-width="1"/>
  `,
  data: (w, h, accent) => `
    ${Array.from({length: 8}, (_, i) => `<line x1="${w * 0.05 + i * w * 0.13}" y1="${h * 0.1}" x2="${w * 0.05 + i * w * 0.13}" y2="${h * 0.9}" stroke="${accent}" stroke-opacity="0.05" stroke-width="1"/>`).join('')}
    ${Array.from({length: 5}, (_, i) => `<line x1="${w * 0.05}" y1="${h * 0.2 + i * h * 0.16}" x2="${w * 0.95}" y2="${h * 0.2 + i * h * 0.16}" stroke="${accent}" stroke-opacity="0.05" stroke-width="1"/>`).join('')}
    <circle cx="${w * 0.8}" cy="${h * 0.3}" r="${h * 0.18}" fill="${accent}" fill-opacity="0.07"/>
  `,
  quote: (w, h, accent) => `
    <text x="${w * 0.07}" y="${h * 0.45}" font-size="${h * 0.5}" fill="${accent}" fill-opacity="0.07" font-family="Georgia,serif">&ldquo;</text>
    <circle cx="${w * 0.85}" cy="${h * 0.75}" r="${h * 0.2}" fill="${accent}" fill-opacity="0.05"/>
  `,
  image: (w, h, accent) => `
    <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.55}" fill="${accent}" fill-opacity="0.06"/>
    <circle cx="${w * 0.5}" cy="${h * 0.5}" r="${h * 0.35}" fill="${accent}" fill-opacity="0.04"/>
  `,
  conclusion: (w, h, accent) => `
    <circle cx="${w * 0.5}" cy="${h * 1.1}" r="${h * 0.8}" fill="${accent}" fill-opacity="0.07"/>
    <circle cx="${w * 0.5}" cy="${h * 1.1}" r="${h * 0.55}" fill="${accent}" fill-opacity="0.05"/>
    <line x1="${w * 0.3}" y1="${h * 0.85}" x2="${w * 0.7}" y2="${h * 0.85}" stroke="${accent}" stroke-opacity="0.12" stroke-width="1"/>
  `,
};

function generateRichPlaceholder(slideType = 'content', theme = 'modern-minimal', index = 0) {
  const palette = GRADIENT_SETS[index % GRADIENT_SETS.length];
  const w = 1600, h = 900;

  const gradStops = palette.stops
    .map(([color, pct]) => `<stop offset="${pct}%" stop-color="${color}"/>`)
    .join('');

  const shapesFn = SHAPES[slideType] || SHAPES.content;
  const shapeSVG = shapesFn(w, h, palette.accent);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        ${gradStops}
      </linearGradient>
    </defs>
    <rect width="${w}" height="${h}" fill="url(#bg)"/>
    ${shapeSVG}
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
