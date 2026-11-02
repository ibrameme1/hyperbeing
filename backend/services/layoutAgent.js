import Anthropic from '@anthropic-ai/sdk';
import { recordTokenUsage } from './stripeService.js';
import { logger, requestContext } from './logger.js';
import { metrics } from './metrics.js';
import { tracer } from './tracer.js';
import { CLASSIC_ART_DIRECTION, MINIMALISTIC_STYLE_REFERENCE, sanitizeDeep } from './claudeAgent.js';
import { FONT_NAMES, MAX_GENERATIONS_PER_SLIDE, MAX_SHEET_ICONS, canvasFor, extractCompletedLayoutParts } from './slideLayout.js';

// ─── Layered-slide agent ────────────────────────────────────────────────────
// Three Claude calls drive a layered slide:
//   1. designDeckSystem   — once per deck: the shared style block, fonts and
//                           palette that keep every layer of every slide
//                           visually consistent.
//   2. designSlideLayout  — once per slide: the layout (background, image
//                           elements with prompts, native text/shapes/charts).
//   3. reviewSlideLayout  — once per slide: Claude LOOKS at the rendered
//                           preview of its own layout and returns fixes.
// All three use forced tool calls (parsed JSON, no line protocol) and all
// output goes through sanitizeDeep (em-dash policy) + token accounting.

const MODEL = 'claude-sonnet-4-6';
const MOCK_MODE = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';
let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function account(userId, fn, response, t0) {
  if (!userId) return;
  try {
    recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
    metrics.recordAICall({ fn, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs: Date.now() - t0 });
  } catch { /* accounting must never break generation */ }
}

function imageBlock(dataUrl, mime) {
  return {
    type: 'image',
    source: { type: 'base64', media_type: mime || (/^data:([^;]+);/.exec(dataUrl)?.[1]) || 'image/png', data: dataUrl.replace(/^data:[^;]+;base64,/, '') },
  };
}

// The user's brief attachments, labelled with the index the layout refers to
// them by ("upload:N").
function uploadsContent(uploads) {
  const parts = [];
  uploads.forEach((u, i) => {
    if (!u?.data) return;
    const cat = u.category === 'moodboard' ? 'moodboard / style reference'
      : u.category ? 'branding / logo / product picture' : 'reference image';
    parts.push({ type: 'text', text: `UPLOAD ${i} (${cat}${u.name ? `, file "${String(u.name).slice(0, 60)}"` : ''}):` });
    parts.push(imageBlock(u.data, u.mimeType));
  });
  return parts;
}

function artDirectionFor(style) {
  return style === 'minimalistic'
    ? `This deck uses the MINIMALISTIC style. The reference prompts below show the look as single images; translate that look into layers.\n\n${MINIMALISTIC_STYLE_REFERENCE}`
    : `This deck uses the CLASSIC editorial style. The art direction below was written for single-image slides; translate it into layers (headline/subhead/strip/cards become native text and shapes, photographs and renders become image layers or a scene background). Wherever it asks for "on-screen text quoted verbatim" on phones or screens, that text becomes NATIVE in_screen layers on a front-facing device — never words inside an image prompt.\n\n${CLASSIC_ART_DIRECTION}`;
}

// ═══ 1. Deck design system ══════════════════════════════════════════════════

const DECK_SYSTEM_TOOL = {
  name: 'submit_deck_design',
  description: 'Submit the shared visual design system for this presentation.',
  input_schema: {
    type: 'object',
    properties: {
      style_block: { type: 'string', description: 'Shared rendering style prepended to EVERY image prompt in the deck (60-120 words).' },
      fonts: {
        type: 'object',
        properties: { display: { type: 'string', enum: FONT_NAMES }, body: { type: 'string', enum: FONT_NAMES } },
        required: ['display', 'body'],
      },
      palette: {
        type: 'object',
        properties: {
          background: { type: 'string' }, text: { type: 'string' }, muted: { type: 'string' },
          accent: { type: 'string' }, accent2: { type: 'string' }, panel: { type: 'string' },
        },
        required: ['background', 'text', 'accent'],
      },
      gradient: { type: 'object', description: 'Optional signature gradient for key words/lines: {angle, stops:[{color,pos}]}' },
      notes: { type: 'string', description: 'One or two sentences of layout/typography conventions every slide follows.' },
    },
    required: ['style_block', 'fonts', 'palette'],
  },
};

const DECK_SYSTEM_PROMPT = `You are Nova, the art director of a premium presentation. Every slide in this deck is built from LAYERS: a background image (or flat color), separate generated image elements on transparent backgrounds, and native text, shapes and charts rendered by the app.

Your job now: define the deck's shared design system so every layer of every slide looks like it came from one designer.

- style_block: 60-120 words of rendering style that will be prepended to EVERY image prompt in the deck: medium (3D render / photograph / illustration and its finish), lighting direction and quality (state ONE consistent key-light direction, e.g. "soft key light from upper-left"), color grade, material language, palette with hex values, level of detail, grain. It must make backgrounds and isolated elements match each other. Never put text, logos, layout or composition instructions in it.
- fonts: choose the display and body fonts that do this deck justice, from the allowed list only.
- palette: hex colors (or rgba for panel tints) for background, text, muted text, accent, accent2, and panel fill.
- gradient: optional signature gradient used for key words.
- notes: conventions every slide follows (e.g. "logo small top-left at 64px margin; slide numbers grey bottom-right; headlines sentence case").

If the user uploaded brand or moodboard images, the design system must follow them. If the brief names brand colors or fonts, use them (closest allowed font).

${'{ART_DIRECTION}'}`;

export async function designDeckSystem({ header, slides, brief, uploads = [], style = 'classic', userId = null }) {
  if (MOCK_MODE) return mockDeckDesign(style);
  const _tid = requestContext.getStore()?.requestId;
  const t0 = Date.now();
  tracer.recordStep(_tid, 'claude_deck_design', 'started', 0);
  const outline = slides.map(s => `${s.index}. [${s.type}] ${s.title}`).join('\n');
  const content = [
    { type: 'text', text: `PRESENTATION: ${header?.presentation_title || ''}\nTHEME HINT: ${header?.theme || ''}\nPALETTE HINT: ${JSON.stringify(header?.color_palette || {})}\n\nOUTLINE:\n${outline}\n\nORIGINAL BRIEF:\n${String(brief || '').slice(0, 12000)}` },
    ...uploadsContent(uploads),
  ];
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: DECK_SYSTEM_PROMPT.replace('{ART_DIRECTION}', artDirectionFor(style)),
    tools: [DECK_SYSTEM_TOOL],
    tool_choice: { type: 'tool', name: DECK_SYSTEM_TOOL.name },
    messages: [{ role: 'user', content }],
  });
  account(userId, 'designDeckSystem', response, t0);
  const out = response.content.find(b => b.type === 'tool_use')?.input;
  tracer.recordStep(_tid, 'claude_deck_design', out ? 'completed' : 'failed', Date.now() - t0);
  if (!out) throw new Error('deck design returned no tool call');
  logger.info('deck design complete', { ms: Date.now() - t0, fonts: out.fonts });
  return sanitizeDeep(out);
}

// ═══ 2. Per-slide layout ════════════════════════════════════════════════════

const LAYOUT_TOOL = {
  name: 'submit_slide_layout',
  description: 'Submit the complete layered layout for one slide.',
  input_schema: {
    type: 'object',
    // Property order matters: the app starts generating the background and
    // image layers while the rest of the layout is still streaming.
    properties: {
      composition: { type: 'string', enum: ['scene', 'objects', 'native'] },
      style_block: { type: 'string' },
      brands: { type: 'array', items: { type: 'object' } },
      background: { type: 'object' },
      layers: {
        type: 'array',
        items: {
          type: 'object',
          properties: { kind: { type: 'string', enum: ['image', 'text', 'shape', 'chart', 'icon', 'logo'] }, id: { type: 'string' } },
          required: ['kind', 'id'],
        },
      },
    },
    required: ['composition', 'background', 'layers'],
  },
};

const LAYOUT_SYSTEM_PROMPT = `You are Nova, a world-class presentation designer. You design ONE slide as a stack of LAYERS that the app composites into a single polished slide, and that the user can then edit like in Keynote: retype any text, drag/resize/delete any image element, change chart numbers. The finished slide must look as premium as a single art-directed image — never like a template.

CANVAS: {W}×{H} px. Origin top-left. All x, y, w, h are canvas pixels. Keep a ~{M}px outer margin for text. Layers are drawn in array order (first = just above the background, last = on top).

══════════════════════════════════════════
STEP 1 — CHOOSE THE COMPOSITION (decide what does this slide's purpose justice)
══════════════════════════════════════════
- "scene": the slide's visual is ONE continuous photograph or render where things interact (people in an environment, a cabin, an aerial view, a street, a room, a cityscape). The scene is the BACKGROUND image, generated with NO text, NO cards, NO UI overlays, with deliberate negative space where your text goes. Only text, cards, charts, logos (and optionally a few floating UI elements) sit on top. Never cut people or objects out of a photographic scene into separate elements — that looks pasted on.
- "objects": a designed keynote slide — an atmospheric background (or flat color) plus 1-5 hero objects/illustrations/effects as SEPARATE transparent elements (a 3D phone, a glass controller, a coin stream, a wallet), plus native text/cards/charts.
- "native": typography, data and structure carry the slide (charts, timelines, stat grids, quotes, tables). Background is a flat color/gradient or one subtle textured image; zero to two image elements.

══════════════════════════════════════════
STEP 2 — LAYER KINDS (JSON fields)
══════════════════════════════════════════
Common fields on every layer: id (short unique slug like "headline", "phone", "card_1"), kind, name (2-3 word human label), x, y, w, h, rotation (deg, default 0), opacity (0-1, default 1).

background (top-level object, not a layer), one of:
  {"type":"image","prompt":"...","refs":["upload:0"],"color":"#hex shown while loading"}
  {"type":"color","color":"#000000"}
  {"type":"gradient","gradient":{"angle":135,"stops":[{"color":"#0A0E1A","pos":0},{"color":"#1B4F9C","pos":100}]}}
  Use a flat color/gradient when that's all the design needs (it's instant and free); use an image for atmosphere, glows, textures, scenes.

image — a generated visual element:
  {"kind":"image","id":"phone","role":"hero|element|effect","prompt":"...","refs":[],"x":..,"y":..,"w":..,"h":..,"shadow":{"color":"rgba(0,0,0,0.55)","blur":60,"dx":0,"dy":30},"glow":{"color":"rgba(255,46,116,0.5)","blur":80}}
  - role "hero": the main visual of the slide (at most one). "element": any other object, illustration, product, person cut-out on a designed slide, sticker, prop. "effect": light-based effects ONLY (glows, light trails, sparks, aurora wisps, lens flares, luminous particles) — these are rendered on pure black and converted to transparency, so describe them as light on black.
  - The box (x,y,w,h) is where the element sits; the generated image is fitted inside it preserving aspect, so give the box the element's natural proportions.
  - Contact shadows / reflections / glows that ground an element: use the native "shadow"/"glow" fields, or a separate "effect" layer under it. Never ask the element itself to include a shadow.
  - Devices whose SCREEN should show editable UI (chat messages, captions, dashboards): add "screen":{"fill":"#0B141A"} and describe the device as PERFECTLY FRONT-FACING and flat-on (no tilt, no perspective). Then put the screen contents as separate native layers with "in_screen":"<device id>" and x,y,w,h in NORMALIZED 0-1 coordinates of the screen (0,0 = screen top-left, 1,1 = bottom-right). A tilted/3D-angled device must instead have its screen content described in its prompt.
  - A photo/video frame that should appear INSIDE a device screen: an image layer with role "screen_image", "in_screen":"<device id>", normalized coords (usually 0,0,1,1 — it is cropped to fill that area). Its prompt describes only the picture on the display (e.g. "a candid selfie video frame of…"), never a phone or device.
  - The same device can appear several times: give every copy the identical prompt (it is generated once and reused).
  - HARD RULE: chat messages, social posts, captions, comments, view counts, notifications, dashboards and any other readable UI on a phone/laptop/tablet are ALWAYS native layers (text/shape/icon with "in_screen") on a front-facing device with "screen". Never write that copy into an image prompt — it must stay editable and spelled exactly. Only photographic content inside a screen (a selfie video frame, a photo) is an image ("screen_image"). The device prompt describes ONLY the hardware (body, finish, bezel, lighting) — never what is on the screen.
  - Example — a phone showing a WhatsApp thread (screen children use 0-1 screen coordinates and come right after their device):
    {"kind":"image","id":"phone","role":"hero","prompt":"A modern flagship smartphone, matte black frame, thin uniform bezels, soft cool rim light along the left edge","screen":{"fill":"#0B141A"},"x":120,"y":300,"w":380,"h":760}
    {"kind":"shape","id":"wa_header","shape":"rect","fill":"#1F2C34","in_screen":"phone","x":0,"y":0,"w":1,"h":0.09}
    {"kind":"text","id":"wa_name","role":"label","text":"Aura Airlines ✈️","font":"Inter","size":20,"weight":700,"color":"#E9EDEF","valign":"middle","in_screen":"phone","x":0.06,"y":0.015,"w":0.8,"h":0.06}
    {"kind":"shape","id":"bubble_1","shape":"rect","fill":"#202C33","radius":14,"in_screen":"phone","x":0.05,"y":0.13,"w":0.86,"h":0.3}
    {"kind":"text","id":"msg_1","role":"body","text":"Assalam o Alaikum [NAME]. You are #847 on the waitlist.","font":"Inter","size":18,"color":"#E9EDEF","in_screen":"phone","x":0.09,"y":0.15,"w":0.78,"h":0.22}
    {"kind":"text","id":"msg_1_time","role":"caption","text":"8:43 pm ✓✓","font":"Inter","size":14,"color":"#53BDEB","align":"right","in_screen":"phone","x":0.5,"y":0.38,"w":0.38,"h":0.04}

text — real, editable text:
  {"kind":"text","id":"headline","role":"headline|subhead|body|label|stat|caption|quote","text":"Line one\\nLine two","runs":[{"text":"Line two","color":"#FF2E74"}],"font":"<font>","size":96,"weight":800,"italic":false,"uppercase":true,"color":"#FFFFFF","gradient":{...optional},"align":"left|center|right","valign":"top|middle|bottom","line_height":1.0,"letter_spacing":0,"x":..,"y":..,"w":..,"h":..}
  - Copy is VERBATIM: every word the brief/outline specifies, spelled exactly. Use \\n for intentional line breaks. "runs" recolors/restyles substrings (e.g. last headline line in hot pink, key words in the gradient) — each run's text must appear in "text" in order.
  - Size the box for the text: h ≈ lines × size × line_height (+10%), w wide enough for the longest line. The app shrinks text that doesn't fit, but design it to fit.
  - Readability floor at 1080p canvas height: captions/labels ≥ 18px, body ≥ 24px, card text ≥ 22px, subheads ≥ 30px, headlines 60-140px. Nothing below 16px ever.

shape — native panels, cards, pills, strips, dividers, glass:
  {"kind":"shape","id":"card_1","shape":"rect|ellipse|line","fill":"rgba(255,255,255,0.08)","gradient":{...optional},"radius":24,"border":{"color":"rgba(255,255,255,0.18)","width":1.5},"frosted":{"blur":24},"shadow":{...optional},"x":..,"y":..,"w":..,"h":..}
  - Frosted glass cards = "frosted" + a translucent fill + thin light border. Pills = rect with radius = h/2. Full-width strips = rect spanning the canvas. Hairline dividers = shape "line" with h 2.
  - Cards, panels, screens-as-UI, tables, pills and strips are ALWAYS native shapes with native text on top — never generated images (they must stay editable and crisp).

chart — real, editable data:
  {"kind":"chart","id":"growth","chart_type":"column|bar|line|area|pie|donut","categories":["2000","2001"],"series":[{"name":"Volume","values":[100,108],"color":"#4FACFE"}],"options":{"show_values":true,"show_grid":false,"value_prefix":"","value_suffix":"%","axis_color":"rgba(255,255,255,0.4)","label_color":"#FFFFFF","font":"<font>","font_size":18,"y_min":0,"y_max":420,"line_width":5,"point_colors":["#FF2E74",null]},"x":..,"y":..,"w":..,"h":..}
  - Any real numbers that belong in a chart go in a chart layer, never into an image prompt. Segment emphasis (e.g. a red plateau then a blue climb) = two series with null where the other segment is. Annotations/callouts = native text + shape layers placed over the chart.

icon — small symbols:
  {"kind":"icon","id":"ic_check","source":"lucide","name":"circle-check","color":"#00FFA3","stroke":2,"x":..,"y":..,"w":40,"h":40}   ← simple UI/line icons from the Lucide set (use exact Lucide names: check, circle-check, wallet, users, trophy, flame, map-pin, camera, heart, gift, crown, coffee, rocket, chart-line, shield-check, plane, play, clock, star, zap, globe, smartphone, qr-code, ...)
  {"kind":"icon","id":"ic_ludo","source":"sheet","prompt":"a tiny glossy 3D ludo board tile","x":..,"y":..,"w":110,"h":110}   ← illustrated/3D icons; ALL "sheet" icons of a slide are generated together in ONE image (max ${MAX_SHEET_ICONS}) and sliced, so they match.

logo — real logos, placed exactly as provided:
  {"kind":"logo","id":"logo","source":"upload","upload":0,"x":64,"y":56,"w":220,"h":60}   ← the user's uploaded logo file (never generate a logo the user uploaded)
  {"kind":"logo","id":"tiktok","source":"brand","brand":"TikTok","x":..,"y":..,"w":..,"h":..}   ← a third-party brand mark; also list the brand in "brands"

brands (top-level): [{"name":"Simosa","domain":"simosa.com","famous":false}] — every brand whose logo or product appears. famous=true for globally famous brands the image model already knows (Meta, TikTok, YouTube, Apple, Coca-Cola…); for others give the official website domain and the app will fetch their logo online and attach it as a reference. To make a generated element use a brand's real logo/product, add "brand:<Name>" (or "upload:N") to that element's refs.

══════════════════════════════════════════
STEP 3 — IMAGE PROMPTS (the quality of the slide lives here)
══════════════════════════════════════════
- The deck style block is automatically prepended to every prompt; "style_block" (top level, optional) adds slide-specific lighting/material notes on top of it. Do not repeat the deck style block.
- Write each prompt like the art-directed prompts in the art direction below: specific subject, materials, lighting, camera/lens or render engine, expression and moment for people, culturally specific details. 40-150 words per element; 80-250 words for a scene background.
- Element prompts describe ONLY that one thing. The app appends "isolated on a transparent background, nothing else in frame, no shadow, no text" — do not describe a background, surface, floor, frame or other objects.
- Background prompts describe the environment/atmosphere ONLY. The app appends "no text, no letters, no logos, no UI, no cards". State exactly where the negative space is (e.g. "the left 45% falls off into clean near-black for text").
- No text inside generated images. All words are native text layers. The only exception is text physically printed on a real object inside a scene or a tilted device screen (a shop sign, a pack label) — keep it short and quote it exactly.
- refs: attach "upload:N" when an uploaded image should guide that layer (a product photo, a person, a moodboard look, a pack shot); attach "brand:<Name>" for a fetched brand logo.
- Image generations are expensive: background image + image layers + one icon sheet ≤ ${MAX_GENERATIONS_PER_SLIDE} per slide. Most slides need 1-5. Repeated identical devices count once.

══════════════════════════════════════════
STEP 4 — LAYOUT, HIERARCHY, READABILITY
══════════════════════════════════════════
- One clear focal point, one reading order. Align to a grid (e.g. 12 columns, 24px gutters); align text edges with each other and with cards.
- Dense slides (many cards/columns/pods): keep ALL the content the brief asks for, but structure it — consistent card sizes, consistent internal padding (≥24px), aligned baselines, repeated patterns. If it cannot fit at the readability floor, tighten copy inside cards rather than shrinking type.
- Text never sits on a busy part of an image: place it on negative space, a card, or a gradient strip.
- Cards behind text: the text box sits inside the card with ≥24px padding on every side.
- No two text boxes may overlap. Nothing important outside the canvas (bleeding decorative elements off-canvas is fine).
- Honor every explicit placement in the brief ("bottom-right corner empty", "logo small top-left", "slide number '09' grey bottom-right").
- Image elements never sit on top of text boxes. Keep image boxes inside the canvas (a small deliberate bleed off an edge is fine; a phone half off-screen is not). Stacked/fanned devices overlap each other by at most ~20%.
- Before submitting, check every box: x ≥ 0, y ≥ 0, x + w ≤ {W}, y + h ≤ {H} for text and cards; no text box intersects another text box or an image element.

OUTPUT ORDER: write the tool input keys in this order — composition, style_block, brands, background, layers — and inside "layers" put the image layers (background-most first) as early as the z-order allows, because generation of each image starts the moment its JSON is complete.

══════════════════════════════════════════
ART DIRECTION FOR THIS DECK
══════════════════════════════════════════
{ART_DIRECTION}

Submit the layout with the submit_slide_layout tool. Layers in back-to-front order.`;

// onPartial(parts) fires while the tool call streams, with every part of the
// layout that is already complete (extractCompletedLayoutParts) — the caller
// starts image generation for finished image layers before the layout is done.
export async function designSlideLayout({ slide, header, deckDesign, brief, uploads = [], aspectRatio = '16:9', style = 'classic', siblingTitles = [], instruction = null, userId = null, onPartial = null }) {
  if (MOCK_MODE) {
    await new Promise(r => setTimeout(r, 300 + Math.random() * 400));
    const layout = mockLayout(slide, header, deckDesign, aspectRatio, uploads);
    onPartial?.({ ...layout, layers: layout.layers });
    return layout;
  }
  const canvas = canvasFor(aspectRatio);
  const _tid = requestContext.getStore()?.requestId;
  const t0 = Date.now();
  tracer.recordStep(_tid, `claude_layout_${slide.index}`, 'started', 0);

  const system = LAYOUT_SYSTEM_PROMPT
    .replaceAll('{W}', canvas.w).replaceAll('{H}', canvas.h).replace('{M}', Math.round(canvas.w * 0.035))
    .replace('{ART_DIRECTION}', artDirectionFor(style));

  const text = [
    `DECK DESIGN SYSTEM (shared by every slide):\n${JSON.stringify(deckDesign || {}, null, 2)}`,
    `PRESENTATION: ${header?.presentation_title || ''}`,
    `ALL SLIDES: ${siblingTitles.join(' | ')}`,
    '',
    `THIS SLIDE (index ${slide.index}, type ${slide.type}${slide.index === 0 ? ', the COVER' : ''}):`,
    `Title: ${slide.title}`,
    slide.subtitle ? `Subtitle: ${slide.subtitle}` : null,
    slide.key_points?.length ? `Key points: ${slide.key_points.join(' | ')}` : null,
    slide.speaker_note ? `Speaker note: ${slide.speaker_note}` : null,
    instruction ? `\nSPECIFIC DIRECTION FOR THIS SLIDE: ${instruction}` : null,
    '',
    `ORIGINAL BRIEF (use its exact copy, numbers, brand names and art direction wherever it describes this slide):\n${String(brief || '').slice(0, 20000)}`,
    uploads.length ? `\nThe user uploaded ${uploads.length} image(s), shown below as UPLOAD 0..${uploads.length - 1}. Use them wherever applicable: place uploaded logos natively ("logo" with source "upload"), and attach uploads as refs to the layers they should guide.` : null,
  ].filter(v => v !== null).join('\n');

  const stream = getClient().messages.stream({
    model: MODEL,
    max_tokens: 12000,
    system,
    tools: [LAYOUT_TOOL],
    tool_choice: { type: 'tool', name: LAYOUT_TOOL.name },
    messages: [{ role: 'user', content: [{ type: 'text', text }, ...uploadsContent(uploads)] }],
  });
  let json = '';
  let lastLayerCount = -1; let sawBackground = false;
  stream.on('streamEvent', (ev) => {
    if (ev.type !== 'content_block_delta' || ev.delta?.type !== 'input_json_delta' || !onPartial) return;
    json += ev.delta.partial_json;
    const parts = extractCompletedLayoutParts(json);
    // Only notify when something new completed (cheap re-scan, rare callbacks).
    if (parts.layers.length !== lastLayerCount || (!!parts.background && !sawBackground)) {
      lastLayerCount = parts.layers.length;
      sawBackground = !!parts.background;
      try { onPartial(sanitizeDeep(parts)); } catch (err) { logger.warn('layout onPartial failed', { errorMessage: err.message }); }
    }
  });
  const response = await stream.finalMessage();
  account(userId, 'designSlideLayout', response, t0);
  const out = response.content.find(b => b.type === 'tool_use')?.input;
  tracer.recordStep(_tid, `claude_layout_${slide.index}`, out ? 'completed' : 'failed', Date.now() - t0);
  if (!out) throw new Error('slide layout returned no tool call');
  logger.info('slide layout designed', { slideIndex: slide.index, ms: Date.now() - t0, layers: out.layers?.length, composition: out.composition, outputTokens: response.usage?.output_tokens });
  return sanitizeDeep(out);
}

// ═══ 3. Visual self-review ══════════════════════════════════════════════════

const REVIEW_TOOL = {
  name: 'submit_layout_fixes',
  description: 'Submit fixes for the rendered slide, or an empty list if it is already right.',
  input_schema: {
    type: 'object',
    properties: {
      verdict: { type: 'string', description: 'One sentence: what is wrong, or "looks right".' },
      fixes: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            x: { type: 'number' }, y: { type: 'number' }, w: { type: 'number' }, h: { type: 'number' },
            size: { type: 'number' }, color: { type: 'string' }, opacity: { type: 'number' },
            align: { type: 'string', enum: ['left', 'center', 'right'] },
            remove: { type: 'boolean' },
            move_to: { type: 'string', enum: ['front', 'back', 'forward', 'backward'] },
          },
          required: ['id'],
        },
      },
    },
    required: ['verdict', 'fixes'],
  },
};

const REVIEW_SYSTEM_PROMPT = `You are Nova, reviewing the rendered result of a slide you designed as layers. You see the composited slide image and its layer JSON (canvas pixel coordinates). The preview uses fallback fonts, so judge layout, not exact letterforms.

Find and fix only real problems:
- text overflowing its box, clipped, colliding with other text, or crossing an important part of an image;
- text on a busy or low-contrast area (move it to negative space, onto a card, or adjust color);
- elements overlapping in ugly ways, awkward gaps, misalignment, an element covering the focal point;
- a generated element that looks wrongly sized or placed for the composition;
- cards that don't contain their text with comfortable padding;
- anything outside the canvas that shouldn't be.

Return small, surgical fixes (move/resize/recolor/resize-font/reorder, or remove a broken decorative element). Never change text content. If the slide already looks right, return an empty fixes list. Coordinates are canvas pixels.`;

export async function reviewSlideLayout({ layout, previewPng, warnings = [], userId = null, slideIndex = 0 }) {
  if (MOCK_MODE) return { verdict: 'looks right', fixes: [] };
  const _tid = requestContext.getStore()?.requestId;
  const t0 = Date.now();
  tracer.recordStep(_tid, `claude_review_${slideIndex}`, 'started', 0);
  const compact = {
    canvas: layout.canvas,
    layers: layout.layers.map(l => {
      const { prompt, refs, src, file, runs, ...rest } = l;
      return rest;
    }),
  };
  const response = await getClient().messages.create({
    model: MODEL,
    max_tokens: 3000,
    system: REVIEW_SYSTEM_PROMPT,
    tools: [REVIEW_TOOL],
    tool_choice: { type: 'tool', name: REVIEW_TOOL.name },
    messages: [{
      role: 'user',
      content: [
        imageBlock(`data:image/png;base64,${previewPng.toString('base64')}`, 'image/png'),
        { type: 'text', text: `LAYERS:\n${JSON.stringify(compact)}\n\nAUTOMATED CHECK WARNINGS:\n${warnings.length ? warnings.map(w => `- ${w}`).join('\n') : '(none)'}` },
      ],
    }],
  });
  account(userId, 'reviewSlideLayout', response, t0);
  const out = response.content.find(b => b.type === 'tool_use')?.input || { verdict: 'no review', fixes: [] };
  tracer.recordStep(_tid, `claude_review_${slideIndex}`, 'completed', Date.now() - t0);
  logger.info('slide layout reviewed', { slideIndex, ms: Date.now() - t0, verdict: String(out.verdict).slice(0, 200), fixes: out.fixes?.length || 0 });
  return sanitizeDeep(out);
}

// ═══ mock mode ══════════════════════════════════════════════════════════════
// A believable layered slide built from the outline, so the whole layered
// pipeline (and the editor/exporter on top of it) runs with zero API keys.

function mockDeckDesign(style) {
  const minimal = style === 'minimalistic';
  return {
    style_block: minimal
      ? 'Cinematic photographic render, single soft key light from upper-left, crushed blacks, subtle film grain, restrained near-monochrome palette with one warm accent.'
      : 'Premium 3D keynote render, soft studio key light from upper-left, glossy and frosted materials, deep aubergine-black ambience (#100812), accents in soft orange #FF8A1F and hot pink #FF2E74, crisp high detail.',
    fonts: minimal ? { display: 'Bebas Neue', body: 'Inter' } : { display: 'Lato', body: 'Lato' },
    palette: { background: '#100812', text: '#FFFFFF', muted: '#A79FB0', accent: '#FF2E74', accent2: '#FF8A1F', panel: 'rgba(255,255,255,0.07)' },
    gradient: { angle: 90, stops: [{ color: '#FF8A1F', pos: 0 }, { color: '#FF2E74', pos: 100 }] },
    notes: 'Logo top-left; headlines sentence case; frosted cards with thin white borders.',
  };
}

function mockLayout(slide, header, deck, aspectRatio, uploads) {
  const { w: W, h: H } = canvasFor(aspectRatio);
  const d = deck || mockDeckDesign('classic');
  const m = Math.round(W * 0.05);
  const points = (slide.key_points || []).slice(0, 3);
  const layers = [];
  const logoIdx = uploads.findIndex(u => u?.category === 'branding');
  if (logoIdx !== -1) layers.push({ kind: 'logo', id: 'logo', name: 'Logo', source: 'upload', upload: logoIdx, x: m, y: m * 0.6, w: 200, h: 56 });
  layers.push({ kind: 'image', id: 'glow', name: 'Glow', role: 'effect', prompt: 'soft pink and orange light glow', x: W * 0.5, y: H * 0.1, w: W * 0.5, h: H * 0.8 });
  layers.push({ kind: 'image', id: 'hero', name: 'Hero object', role: 'hero', prompt: `a striking 3D object representing "${slide.title}"`, x: W * 0.58, y: H * 0.18, w: W * 0.34, h: H * 0.64, shadow: { color: 'rgba(0,0,0,0.5)', blur: 60, dx: 0, dy: 30 } });
  layers.push({ kind: 'shape', id: 'pill', name: 'Label pill', shape: 'rect', fill: 'rgba(255,46,116,0.15)', border: { color: 'rgba(255,46,116,0.6)', width: 1.5 }, radius: 22, x: m, y: H * 0.17, w: 260, h: 44 });
  layers.push({ kind: 'text', id: 'label', name: 'Label', role: 'label', text: `SLIDE ${slide.index + 1}`, font: d.fonts.body, size: 18, weight: 700, uppercase: true, letter_spacing: 0.12, color: '#FF2E74', align: 'center', valign: 'middle', x: m, y: H * 0.17, w: 260, h: 44 });
  layers.push({ kind: 'text', id: 'headline', name: 'Headline', role: 'headline', text: slide.title || 'Untitled', font: d.fonts.display, size: 72, weight: 800, color: '#FFFFFF', line_height: 1.08, x: m, y: H * 0.25, w: W * 0.46, h: H * 0.28 });
  const isData = slide.type === 'data' || /\d/.test(slide.title || '');
  (isData ? [] : points).forEach((p, i) => {
    const y = H * 0.56 + i * (H * 0.12);
    layers.push({ kind: 'shape', id: `card_${i + 1}`, name: `Card ${i + 1}`, shape: 'rect', fill: 'rgba(255,255,255,0.07)', frosted: { blur: 24 }, border: { color: 'rgba(255,255,255,0.18)', width: 1.5 }, radius: 20, x: m, y, w: W * 0.46, h: H * 0.1 });
    layers.push({ kind: 'icon', id: `icon_${i + 1}`, source: 'lucide', name: ['circle-check', 'zap', 'star'][i], color: '#FF8A1F', x: m + 28, y: y + H * 0.05 - 18, w: 36, h: 36 });
    layers.push({ kind: 'text', id: `point_${i + 1}`, name: `Point ${i + 1}`, role: 'body', text: p, font: d.fonts.body, size: 26, color: '#FFFFFF', valign: 'middle', x: m + 84, y: y + 12, w: W * 0.46 - 108, h: H * 0.1 - 24 });
  });
  if (isData) {
    layers.push({ kind: 'chart', id: 'chart', name: 'Chart', chart_type: 'column', categories: ['2023', '2024', '2025', '2026'], series: [{ name: 'Growth', values: [12, 19, 31, 48], color: '#FF2E74' }], options: { show_values: true, show_grid: false, value_suffix: '%', font: d.fonts.body, font_size: 18 }, x: W * 0.06, y: H * 0.6, w: W * 0.4, h: H * 0.32 });
  }
  return {
    composition: 'objects',
    style_block: '',
    background: { type: 'image', prompt: 'deep aubergine-black field with soft orange and pink aurora glows on the right, left 45% clean near-black', color: d.palette.background },
    brands: [],
    layers,
  };
}
