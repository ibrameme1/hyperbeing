import { GoogleGenAI } from '@google/genai';

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

export async function generateSlideImage(basePrompt, slideType, theme, colorPalette) {
  const prompt = buildPrompt(basePrompt, slideType, theme, colorPalette);
  const client = getClient();

  // Primary: Imagen 3 via Google AI
  try {
    const response = await client.models.generateImages({
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
    const b64 = Buffer.from(imageBytes).toString('base64');
    return `data:image/png;base64,${b64}`;
  } catch (imagenErr) {
    console.warn('Imagen 3 failed, falling back to Gemini 2.0 Flash image generation:', imagenErr.message);
  }

  // Fallback: Gemini 2.0 Flash with image output modality
  try {
    const response = await client.models.generateContent({
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
    console.warn('Gemini image generation also failed:', geminiErr.message);
  }

  // Last resort: return a beautiful CSS gradient as a placeholder SVG
  return generatePlaceholderImage(slideType, theme);
}

function generatePlaceholderImage(slideType, theme) {
  const palettes = {
    'modern-minimal': ['#667eea', '#764ba2'],
    'bold-gradient': ['#f093fb', '#f5576c'],
    'corporate': ['#4facfe', '#00f2fe'],
    'creative': ['#43e97b', '#38f9d7'],
    'tech': ['#0f0c29', '#302b63'],
  };

  const [c1, c2] = palettes[theme] || palettes['modern-minimal'];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style="stop-color:${c1}"/>
        <stop offset="100%" style="stop-color:${c2}"/>
      </linearGradient>
    </defs>
    <rect width="1600" height="900" fill="url(#g)"/>
    <circle cx="1300" cy="150" r="300" fill="rgba(255,255,255,0.05)"/>
    <circle cx="200" cy="750" r="250" fill="rgba(255,255,255,0.05)"/>
  </svg>`;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
