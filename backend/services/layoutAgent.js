import crypto from 'crypto';
import { recordClaudeCall } from './aiCosts.js';
import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { recordTokenUsage } from './stripeService.js';
import { logger, requestContext } from './logger.js';
import { metrics } from './metrics.js';
import { tracer } from './tracer.js';
import { sanitizeDeep } from './claudeAgent.js';
import { MINIMALISTIC_EXAMPLE_PROMPTS } from './minimalisticExamples.js';
import { CLAUDE_MODEL, claudeRequest, toolInput, answeredBy, usesAutoTools, warmupMaxTokens, streamToolCall } from './claudeModel.js';
import { FONT_NAMES, MAX_GENERATIONS_PER_SLIDE, MAX_LAYERS, MAX_SCREEN_LAYERS, MAX_SHEET_ICONS, canvasFor, extractCompletedLayoutParts } from './slideLayout.js';

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

// Model + per-model request shape (forced vs auto tool calls, thinking,
// warm-up max_tokens) live in claudeModel.js; CLAUDE_MODEL switches them all.
const MODEL = CLAUDE_MODEL;

// ── The team's quality reference library ────────────────────────────────────
// Every ideal slide prompt the team supplied (prompts/layered_quality_examples.md
// + the 12 minimalistic exemplars), sent VERBATIM to the deck-design and
// layout calls so Claude knows the quality, specificity and voice expected.
// ~12k tokens: it is the FIRST system block and marked for prompt caching, so
// after the first call it is billed at the cached rate and adds little latency.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const QUALITY_LIBRARY = `${fs.readFileSync(path.join(__dirname, '../prompts/layered_quality_examples.md'), 'utf8')}

---

## Cinematic minimal exemplars (verbatim)
${MINIMALISTIC_EXAMPLE_PROMPTS.map((p, i) => `### Cinematic minimal ${i + 1}\n${p}`).join('\n\n')}`;

// Finished reference slides the team supplied (prompts/reference_slides/*.jpg),
// shown to the layout call as IMAGES — the visual quality bar for hierarchy,
// composition and how objects connect. Cached with the system prompt.
const REFERENCE_DIR = path.join(__dirname, '../prompts/reference_slides');
const REFERENCE_SLIDES = (() => {
  try {
    return fs.readdirSync(REFERENCE_DIR).filter(f => /\.(jpe?g|png)$/i.test(f)).sort().map(f => ({
      name: f.replace(/\.[^.]+$/, ''),
      block: { type: 'image', source: { type: 'base64', media_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: fs.readFileSync(path.join(REFERENCE_DIR, f)).toString('base64') } },
    }));
  } catch { return []; }
})();

function referenceSlideBlocks() {
  if (!REFERENCE_SLIDES.length) return [];
  const blocks = [{ type: 'text', text: `QUALITY REFERENCE SLIDES (${REFERENCE_SLIDES.map(r => r.name).join(', ')}): finished slides at the bar this slide must meet. Study the hierarchy (one dominant takeaway), composition, how objects physically connect and sit on grounding elements, card anatomy and spacing. Never copy their content, brands or copy.` }];
  REFERENCE_SLIDES.forEach((r, i) => {
    blocks.push(i === REFERENCE_SLIDES.length - 1 ? { ...r.block, cache_control: { type: 'ephemeral' } } : r.block);
  });
  return blocks;
}

function systemBlocks(text) {
  return [
    { type: 'text', text: QUALITY_LIBRARY, cache_control: { type: 'ephemeral' } },
    { type: 'text', text },
  ];
}
// CLAUDE_PROVIDER=files (TEST/BENCHMARK ONLY): instead of calling the API,
// every Claude request is written to $CLAUDE_FILES_DIR/requests/<kind>_<key>.*
// and the response is read from $CLAUDE_FILES_DIR/<kind>_<key>.json once a
// person (or another model) has written it. Lets the pipeline be exercised
// without spending API credits; never enable in production.
const FILES_MODE = process.env.CLAUDE_PROVIDER === 'files';
const MOCK_MODE = !FILES_MODE && (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo');

function filesAgent(kind, keyMaterial, request, { png = null } = {}) {
  const dir = process.env.CLAUDE_FILES_DIR || 'claude-files';
  const key = crypto.createHash('sha1').update(JSON.stringify(keyMaterial)).digest('hex').slice(0, 12);
  const answer = path.join(dir, `${kind}_${key}.json`);
  if (fs.existsSync(answer)) return { key, response: JSON.parse(fs.readFileSync(answer, 'utf8')) };
  fs.mkdirSync(path.join(dir, 'requests'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'requests', `${kind}_${key}.json`), JSON.stringify(request, null, 2));
  if (png) fs.writeFileSync(path.join(dir, 'requests', `${kind}_${key}.png`), png);
  logger.warn('claude files mode: response missing', { kind, key, expected: answer });
  return { key, response: null };
}
let client;
function getClient() {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

function account(userId, fn, response, t0) {
  recordClaudeCall({ call: fn, model: answeredBy(response), usage: response.usage, durationMs: Date.now() - t0, userId });
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

// Which uploads a call is shown. The user's own images (and pictures from
// files marked as design inspiration) guide every call. Pictures extracted from
// their other files are only shown to the slide they belong to: the slide of
// the redesigned deck they came from, or the slides the plan assigned them to
// ("uploads":[N]). Indices stay GLOBAL, so "upload:N" means the same image
// everywhere (layout refs, logos, edits).
export function uploadVisible(u, i, slide = null) {
  if (!u?.data) return false;
  if (!u.source_doc || u.category === 'moodboard') return true;
  if (!slide) return false;
  if (Array.isArray(slide.uploads) && slide.uploads.map(Number).includes(i)) return true;
  return !!(Array.isArray(u.slides) && slide.source_slide && u.slides.includes(Number(slide.source_slide)));
}

// The user's brief attachments, labelled with the index the layout refers to
// them by ("upload:N").
function uploadsContent(uploads, slide = null) {
  const parts = [];
  uploads.forEach((u, i) => {
    if (!uploadVisible(u, i, slide)) return;
    const cat = u.category === 'moodboard' ? 'moodboard / style reference'
      : u.category === 'document' ? `picture from the user's file "${String(u.source_doc || '').slice(0, 60)}"${u.slides ? ` (their slide ${u.slides.join(', ')})` : ''}`
      : u.category ? 'branding / logo / product picture' : 'reference image';
    parts.push({ type: 'text', text: `UPLOAD ${i} (${cat}${u.name && !u.source_doc ? `, file "${String(u.name).slice(0, 60)}"` : ''}):` });
    parts.push(imageBlock(u.data, u.mimeType));
  });
  return parts;
}

// ONE design system. There are no user-selectable style presets: Claude
// chooses each deck's visual language from the brief, calibrated against the
// quality library (every ideal output the team supplied — editorial campaign
// keynotes, 3D infographic slides and cinematic minimal slides). The craft
// rules below hold for every deck. (Replaces the old classic/minimalistic
// split, whose classic half hard-coded one palette.)
const ART_DIRECTION = `══════════════════════════════════════════
ONE HYPERBEING DESIGN SYSTEM
══════════════════════════════════════════

There are no style presets. The quality library at the top of this prompt is the full range of ideal outputs the team has signed off:
- EDITORIAL CAMPAIGN keynotes: bold condensed display headlines that land like a copywriter's punchline, culturally specific candid human moments, real phone and app UI, a verdict line.
- 3D INFOGRAPHIC slides: premium isometric or product renders, frosted glass, floating cards, objects that physically connect (streams, pedestals, orbits), clean data.
- CINEMATIC MINIMAL slides: one dramatic hero render or photograph, generous negative space, a single restrained headline.

Choose the visual language for THIS deck from the brief: audience, brand, subject, tone, uploaded brand assets or moodboards, and any art direction the user wrote (that always wins). Then match the closest ideal outputs in quality, specificity and voice. Never their subjects, brands, copy or numbers. A deck may combine languages where the content calls for it (an editorial campaign deck with one 3D ecosystem slide), but one deck keeps ONE palette, ONE type pairing and ONE rendering language, set by the deck design system.

Tendencies, not rules (the brief wins): marketing / insight / campaign / audience slides lean editorial; ecosystem / architecture / moat / platform / data slides lean 3D infographic; openings, vision, brand moments and emotional beats lean cinematic minimal.

══════════════════════════════════════════
CRAFT RULES FOR EVERY DECK
══════════════════════════════════════════

- Background: a specific colour or scene, chosen for a stated reason that serves the slide's mood.
- Headline: the slide's takeaway, written like a punchline, at most 2-3 short lines; one accent colour from the deck palette may mark the decisive line.
- ONE dominant visual idea per slide: a hero photograph, a collage of real candid moments, structured columns or a grid, an isometric 3D render, or a single cinematic hero. Never several competing ideas.
- Callout cards: exact copy, border, tint and size relative to everything else.
- When the slide argues something, end on a verdict line (a bottom strip or closing line): declarative, surprising, final.
- Image prompts carry at least 3 sensory details (light, material, texture, expression), a named human emotional state when people appear, culturally specific markers for the audience (places, age groups, rituals, slang), and a moment of contrast or surprise where possible. Every stat is paired with what it means.
- Typography: always specify weight, case, colour and placement through the native text layers; display type for headlines, a calm body face for everything else.
- UI on phones, laptops and screens (chats, captions, view counts, timestamps, dashboards) is DRAWN BY THE IMAGE MODEL by default: describe it in the device prompt and quote its key copy exactly. Only the hero device of a slide whose on-screen copy is the point gets a few native editable screen layers (see the image rules).
- If the user uploaded moodboards or reference images, say explicitly which colours, materials and mood from them carry into the slide.
- Never mention aspect ratio in an image prompt.
- BANNED: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization". Always find a specific, real, directed visual concept.`;

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
      notes: { type: 'string', description: 'The chosen visual language and why, then the layout/typography conventions every slide follows.' },
    },
    required: ['style_block', 'fonts', 'palette'],
  },
};

const DECK_SYSTEM_PROMPT = `You are Nova, the art director of a premium presentation. Every slide in this deck is built from LAYERS: a background image (or flat color), separate generated image elements on transparent backgrounds, and native text, shapes and charts rendered by the app.

Your job now: define the deck's shared design system so every layer of every slide looks like it came from one designer.

- style_block: 60-120 words of rendering style that will be prepended to EVERY image prompt in the deck (backgrounds included — so it must never imply subjects, products or objects to depict): medium (3D render / photograph / illustration and its finish), lighting direction and quality (state ONE consistent key-light direction, e.g. "soft key light from upper-left"), color grade, material language, palette with hex values, level of detail, grain. It must make backgrounds and isolated elements match each other. Never put text, logos, layout or composition instructions in it.
- fonts: choose the display and body fonts that do this deck justice, from the allowed list only.
- palette: hex colors (or rgba for panel tints) for background, text, muted text, accent, accent2, and panel fill.
- gradient: optional signature gradient used for key words.
- notes: first the visual language you chose for this deck from the brief (editorial campaign, 3D infographic, cinematic minimal, or a stated mix) and why in one sentence, then the conventions every slide follows (e.g. "logo small top-left at 64px margin; slide numbers grey bottom-right; headlines sentence case").

If the user uploaded brand or moodboard images, the design system must follow them. If the brief names brand colors or fonts, use them (closest allowed font).

${'{ART_DIRECTION}'}`;

export async function designDeckSystem({ header, slides, brief, uploads = [], userId = null }) {
  if (MOCK_MODE) return mockDeckDesign();
  if (FILES_MODE) {
    const outline = slides.map(sl => `${sl.index}. [${sl.type}] ${sl.title}`).join('\n');
    const { response } = filesAgent('deck', { outline, brief: String(brief || '').slice(0, 20000) }, {
      tool: DECK_SYSTEM_TOOL, header, outline, brief: String(brief || '').slice(0, 20000), uploads: uploads.length,
    });
    if (!response) throw new Error('deck design pending (files mode)');
    return sanitizeDeep(response);
  }
  const _tid = requestContext.getStore()?.requestId;
  const t0 = Date.now();
  tracer.recordStep(_tid, 'claude_deck_design', 'started', 0);
  const outline = slides.map(s => `${s.index}. [${s.type}] ${s.title}`).join('\n');
  const content = [
    { type: 'text', text: `PRESENTATION: ${header?.presentation_title || ''}\nTHEME HINT: ${header?.theme || ''}\nPALETTE HINT: ${JSON.stringify(header?.color_palette || {})}\n\nOUTLINE:\n${outline}\n\nORIGINAL BRIEF:\n${String(brief || '').slice(0, 20000)}` },
    ...uploadsContent(uploads),
  ];
  // If the layout warm-up is running, let it finish: deck design then READS
  // the shared library prefix instead of writing a second copy.
  await awaitAnyLayoutWarm();
  const response = await getClient().messages.create(...claudeRequest({
    max_tokens: 2000,
    system: systemBlocks(DECK_SYSTEM_PROMPT.replace('{ART_DIRECTION}', ART_DIRECTION)),
    tools: libraryTools(),
    messages: [{ role: 'user', content }],
  }, { tool: DECK_SYSTEM_TOOL.name }));
  account(userId, 'designDeckSystem', response, t0);
  const out = toolInput(response, DECK_SYSTEM_TOOL.name);
  tracer.recordStep(_tid, 'claude_deck_design', out ? 'completed' : 'failed', Date.now() - t0);
  if (!out) throw new Error('deck design returned no tool call');
  logger.info('deck design complete', { ms: Date.now() - t0, fonts: out.fonts, cacheWrite: response.usage?.cache_creation_input_tokens, cacheRead: response.usage?.cache_read_input_tokens });
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
  - role "cluster" — THE DEFAULT FOR THE VISUAL ZONE OF AN OBJECTS SLIDE: all the objects that belong together (hero, secondary objects, the streams/trails linking them, companions orbiting it) are generated TOGETHER in ONE image on a transparent background — so they share light, perspective and physically connect — and the app then splits that image into separately editable layers, one per item, placed exactly where they appeared:
      {"kind":"image","id":"visual","role":"cluster","prompt":"how they relate, e.g. coins pour out of the phone's ad banner in an arc and drop into the open wallet","items":[
        {"id":"phone","name":"Game phone","prompt":"...","x":930,"y":60,"w":560,"h":880},
        {"id":"coins","name":"Coin stream","prompt":"...","x":1330,"y":640,"w":330,"h":200},
        {"id":"wallet","name":"Wallet","prompt":"...","x":1500,"y":690,"w":290,"h":270}]}
    Items: 2-8 objects. The FIRST item is the hero. Each item's box is where that object should appear on the canvas (the app turns these into positions inside one frame). A stream/trail linking two objects is its own item whose box spans the gap between them. Items that should be separately movable need a little empty space between them in their boxes; items that physically touch will come out as one piece. Glows that wash behind everything stay separate "effect" layers; a device with a native "screen" stays a separate image layer. A cluster item that is a device showing UI gets "ui":true and quotes its screen copy in its prompt.
  - role "connector": the thing that PHYSICALLY LINKS elements so the slide reads as one connected scene — coins pouring from a phone's ad banner into a wallet, a light trail from a product to a card, an energy beam, a data stream, an orbit ring around a hero. Give
      "from":{"layer":"<id>","anchor":"top|bottom|left|right|center|top-left|top-right|bottom-left|bottom-right" or {"x":0.8,"y":0.85}} and "to":{...}  (anchor = a point of that layer's box; {"x","y"} are fractions of it — aim at the exact spot, e.g. the ad banner or the wallet's opening)
      or "around":"<id>" for an orbit ring encircling that layer,
      plus "medium":"objects" (solid things: coins, cubes, petals, icons in motion — rendered on transparent) or "light" (glowing trails, beams, sparks, energy — rendered on black), and "spread": thickness in px (default 200).
    Do NOT give a connector x/y/w/h — the app computes its exact box from the anchors and tells the image model precisely where the stream enters and exits. Prefer putting streams inside a "cluster" (generated with their objects, so they connect perfectly); use a separate connector only to link layers that can't be in the same cluster (e.g. a light trail from a cluster object to a native card, or an orbit ring around a screen device). Its prompt describes the stream itself ("a cascade of 9 glossy gold coins tumbling and spinning, small at the start and growing larger, with orange light streaks between them").
  - The box (x,y,w,h) is where the element sits; the generated image is fitted inside it preserving aspect, so give the box the element's natural proportions.
  - Contact shadows / reflections / glows that ground an element: use the native "shadow"/"glow" fields, or a separate "effect" layer under it. Never ask the element itself to include a shadow.
  - DEVICE SCREENS (phones, laptops, tablets, monitors). Default: the image model DRAWS the screen UI. Add "ui":true to the device layer and describe in its prompt what the screen shows (app, layout, colours) and quote the visible copy exactly in double quotes, kept short (a name, 1-3 short messages or a caption, a number, a button label; at most ~25 words of copy per device). The device may be tilted or angled. Don't add "screen" or in_screen layers for it. Changing that copy later regenerates the image, which is fine.
  - Exception, at most ONE device per slide: the slide's hero device when its on-screen copy IS the takeaway (the message itself is the point). Then add "screen":{"fill":"#0B141A"}, keep the device front-facing, and add AT MOST ${MAX_SCREEN_LAYERS} native layers with "in_screen":"<device id>" in NORMALIZED 0-1 screen coordinates (0,0 = screen top-left, 1,1 = bottom-right): only the copy that matters (e.g. a header name + 2-3 message bubbles). No status bars, keyboards, avatars, timestamps or decorative UI. Layers beyond the cap are discarded. Every other device on that slide uses "ui":true.
  - A photo/video frame that should appear INSIDE a native screen: an image layer with role "screen_image", "in_screen":"<device id>", normalized coords (usually 0,0,1,1 — it is cropped to fill that area). Its prompt describes only the picture on the display (e.g. "a candid selfie video frame of…"), never a phone or device.
  - The same device can appear several times: give every copy the identical prompt (it is generated once and reused).
  - Device prompts never repeat what the app already adds: no camera angle words for a native-screen device (the app makes it front-facing), no background, floor or void.
  - Example — a hero phone whose WhatsApp message is the point (native screen, 4 screen layers), next to a secondary phone drawn by the image model:
    {"kind":"image","id":"phone","role":"hero","prompt":"A modern flagship smartphone, matte black frame, thin uniform bezels, soft cool rim light along the left edge","screen":{"fill":"#0B141A"},"x":120,"y":300,"w":380,"h":760}
    {"kind":"shape","id":"wa_header","shape":"rect","fill":"#1F2C34","in_screen":"phone","x":0,"y":0,"w":1,"h":0.09}
    {"kind":"text","id":"wa_name","role":"label","text":"Aura Airlines ✈️","font":"Inter","size":20,"weight":700,"color":"#E9EDEF","valign":"middle","in_screen":"phone","x":0.06,"y":0.015,"w":0.8,"h":0.06}
    {"kind":"shape","id":"bubble_1","shape":"rect","fill":"#202C33","radius":14,"in_screen":"phone","x":0.05,"y":0.13,"w":0.86,"h":0.3}
    {"kind":"text","id":"msg_1","role":"body","text":"Assalam o Alaikum [NAME]. You are #847 on the waitlist.","font":"Inter","size":18,"color":"#E9EDEF","in_screen":"phone","x":0.09,"y":0.15,"w":0.78,"h":0.22}
    {"kind":"image","id":"phone_tiktok","role":"element","ui":true,"prompt":"A modern flagship smartphone, matte black frame, tilted 10 degrees, its screen showing a dark TikTok video feed: a candid clip of a young woman in a Lahore airport queue holding up her phone, caption \"I got the message 😭\", a red like counter reading \"412K\"","x":560,"y":360,"w":300,"h":600}

text — real, editable text:
  {"kind":"text","id":"headline","role":"headline|subhead|body|label|stat|caption|quote","text":"Line one\\nLine two","runs":[{"text":"Line two","color":"#FF2E74"}],"font":"<font>","size":96,"weight":800,"italic":false,"uppercase":true,"color":"#FFFFFF","gradient":{...optional},"align":"left|center|right","valign":"top|middle|bottom","line_height":1.0,"letter_spacing":0,"x":..,"y":..,"w":..,"h":..}
  - Copy is VERBATIM: every word the brief/outline specifies, spelled exactly. Use \\n for intentional line breaks. "runs" recolors/restyles substrings (e.g. the decisive headline line in the accent colour, key words in the gradient) — each run's text must appear in "text" in order.
  - Size the box for the text: h ≈ lines × size × line_height (+10%), w wide enough for the longest line. The app shrinks text that doesn't fit, but design it to fit.
  - Readability floor at 1080p canvas height: captions/labels ≥ 18px, body ≥ 24px, card text ≥ 22px, subheads ≥ 30px, headlines 60-140px. Nothing below 16px ever.

shape — native panels, cards, pills, strips, dividers, glass:
  {"kind":"shape","id":"card_1","shape":"rect|ellipse|line","fill":"rgba(255,255,255,0.08)","gradient":{...optional},"radius":24,"border":{"color":"rgba(255,255,255,0.18)","width":1.5},"frosted":{"blur":24},"shadow":{...optional},"x":..,"y":..,"w":..,"h":..}
  - Frosted glass cards = "frosted" + a translucent fill + thin light border; add "highlight":true for the glass bevel (light catching the top edge) and a gradient border for a lit/accent edge: "border":{"width":1.5,"gradient":{"angle":90,"stops":[{"color":"rgba(255,255,255,0.35)","pos":0},{"color":"rgba(255,46,116,0.6)","pos":100}]}}. A glowing card = "shadow":{"color":"rgba(255,46,116,0.45)","blur":60,"dx":0,"dy":0}. Pills = rect with radius = h/2. Full-width strips = rect spanning the canvas. Horizontal hairlines = shape "line" with h 2; vertical dividers = a rect 2px wide.
  - Cards, panels, tables, pills and strips on the slide itself are ALWAYS native shapes with native text on top — never generated images (they must stay editable and crisp). UI inside a device screen follows the device rules above.

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
- No text inside generated images. All words are native text layers. The exceptions: text physically printed on a real object inside a scene (a shop sign, a pack label), and the on-screen copy of a "ui":true device. Keep it short and quote it exactly.
- refs: attach "upload:N" when an uploaded image should guide that layer (a product photo, a person, a moodboard look, a pack shot); attach "brand:<Name>" for a fetched brand logo.
- Image generations are expensive: background image + image layers + one icon sheet ≤ ${MAX_GENERATIONS_PER_SLIDE} per slide. Most slides need 1-5. Repeated identical devices count once.
- At most ${MAX_LAYERS} layers per slide; anything after that is discarded. Most slides need 10-30. Every layer is written by you, so spend layers on what the audience reads, not on decorative detail.
- OUTPUT ECONOMY (every character you write is paid for; the app fills these in): OMIT any field that equals its default. Defaults: role "body"; align "left"; valign "top"; italic, uppercase, flip false; rotation 0; opacity 1; line_height 1.15; letter_spacing 0; weight 700 for roles headline/display/stat and 400 otherwise; font = the deck's display font for roles headline/display/stat and the deck's body font otherwise; text colour = the deck palette's text colour. Write a field only when it differs. Ids are short and unique (h1, sub, t3, card1, phone); never add "name". Image prompts describe only the subject: the app already prepends the deck style_block and appends isolation, no-text and device-angle instructions, so never repeat those. Economy is only about defaults: never drop a design choice to save tokens (accent runs and gradients on key words, heavier weights, shadows, glows, letter spacing the art direction calls for).

══════════════════════════════════════════
STEP 4 — DESIGN QUALITY BAR (the slide must look like a top keynote designer made it)
══════════════════════════════════════════
- CONNECTED, NOT FLOATING. Generate the visual zone as ONE "cluster" (see role "cluster") so it is literally one composed image, never separate stickers: every secondary object relates physically to the hero — linked by a connector (stream, beam, orbit), touching it, or overlapping its edge. The background's glow is placed behind the cluster so everything shares one light. Floating callout cards sit close to / slightly overlapping the cluster, with a glow shadow in the accent colour. Objects in the cluster share one light direction (the deck style's key light).
- SCALE. The hero fills 60-85% of the canvas height in its zone (a phone ~550x850, a controller ~800x600), often tilted 8-15 degrees for energy (describe the angle in its prompt). Secondary objects are substantial (at least ~15% of canvas height; a wallet ~280x260), never tiny props. Callout cards ~340x240.
- TYPE SCALE (1080p canvas): kicker/label 20-24px caps, letter_spacing 0.18-0.3 (em), accent colour or gradient · headline 76-110px weight 800, 2-4 lines, line_height 1.02-1.1 · big stat numbers 96-130px weight 800 filled with the deck's signature gradient · row titles 30-34px weight 700 · body 26-30px · footnotes 22-24px muted · slide number 64-80px weight 300 muted grey.
- ROW / CARD ANATOMY (use for lists of 2-4 items): frosted card 820-840 wide, 125-150 tall, radius 26-32, "highlight":true, subtle gradient border. Inside, left to right with ≥28px padding: an icon badge (ellipse 76x76, transparent fill, 2px accent/gradient border, a Lucide icon 36px centred in it) → bold title → a 2px vertical divider (rect, 55% card height, rgba(255,255,255,0.18)) → body text. Stat rows use a big gradient number instead of badge+title.
- FILL THE CANVAS WITH INTENT. Content column ~45% / visual zone ~55% unless briefed otherwise; no dead zone larger than ~15% of the canvas; small supporting lines (proof line with a shield-check icon, KPI line with a chart-line icon) anchor the bottom.
- Logo top-left at the margin (height 56-72px). If the user uploaded a logo, use it (source "upload").
- KEY TAKEAWAY FIRST: the headline/takeaway is the most prominent thing on the slide — largest type, clear space around it, nothing overlapping it. For campaign/insight slides with a dense visual, a centred full-width headline block above the visual (as in the device-collage reference) is often the strongest structure.
- DEVICE COLLAGES: the primary conversation sits on ONE large device (landscape when it is a long chat thread), secondary devices are smaller and grouped tightly (side by side or stacked 2-up) next to it on a shared baseline. Size every device box to the device's true shape (portrait phone ≈ 1:2 width:height, landscape phone ≈ 2:1) so it fills its box, and keep secondary devices ≤ 40px apart (or slightly overlapping) so the group reads as one unit. Devices never overlap text and never scatter.
- OBJECT + LABEL PAIRS (as in the pedestal reference): each object sits on a grounding element generated with it in the cluster (a pedestal, plinth, platform or glow ring), and its label card sits BESIDE it, touching or slightly overlapping its edge — never covering the object's face.
- PALETTE DISCIPLINE: every colour on the slide comes from the DECK DESIGN SYSTEM palette/gradient (tints and alpha variations of them are fine). Never introduce a colour the deck doesn't use (e.g. a dark-green strip on an aubergine/orange deck).
- COMPANIONS: small objects that accompany a hero (game tiles, icons, badges, products) are real elements at ≥ 150px, placed ON an orbit/arc around the hero (add a "light" connector with "around":"<hero id>" so they visibly orbit it), slightly overlapping its silhouette — never scattered tiny in empty corners.
- BACKGROUND for objects/native slides is an EMPTY atmosphere (light, colour, texture). Never describe objects, devices, products or shapes in a background prompt — every object is its own layer.
- GLOWS LIVE IN THE BACKGROUND. Aurora ribbons, blooms, haze and the glow behind the hero are part of the ONE background image: describe exactly where the bloom sits so it lands behind the cluster (e.g. "brightest bloom centred at ~68% from the left and ~55% from the top, behind where the phone stands"). Do NOT add separate "effect" glow layers behind objects; use an "effect" layer only for light that must sit IN FRONT of objects or cards (rare).

══════════════════════════════════════════
WORKED EXAMPLE (objects composition) — the quality bar. Brief: Simosa Door 6, aubergine-black + orange/pink aurora, Lato, logo uploaded as UPLOAD 0.
══════════════════════════════════════════
{"composition":"objects","style_block":"Key light from upper-left, warm orange-pink rim light from the right","brands":[{"name":"Simosa","domain":"simosa.pk","famous":false}],
"background":{"type":"image","prompt":"Deep aubergine-black (#100812) field. A sweeping soft orange (#FF8A1F) to hot pink (#FF2E74) aurora ribbon curves through the right 55%, with its brightest warm bloom centred at ~66% from the left and ~50% from the top (behind where the phone stands) and a second softer pink bloom low at ~85% from the left (behind the wallet); faint dust particles; the left 45% falls off into clean near-black for text.","color":"#100812"},
"layers":[
{"kind":"image","id":"visual","role":"cluster","name":"Phone, coins and wallet","prompt":"Gold coins pour out of the ad banner at the bottom of the phone's screen in a rising-then-falling arc, trailed by a ribbon of pink-orange light, and drop into the open wallet; the wallet glows where the coins land","refs":["upload:0"],"items":[
  {"id":"phone","name":"Game phone","prompt":"A sleek modern smartphone in a dark graphite frame, tilted about 12 degrees to the right in a three-quarter 3D view, screen showing a bright, colourful mobile platformer game: a cute fox pilot with goggles jumping between floating grassy islands, gold coins in mid-air, a score bar at the top, and at the bottom of the screen a clean white native ad banner with a pink sneaker photo and a pink 'Shop now' button.","x":930,"y":60,"w":560,"h":880},
  {"id":"coins","name":"Coin stream","prompt":"Nine glossy gold-orange coins with dollar marks tumbling and spinning, small near the phone and larger towards the wallet, with a ribbon of hot-pink and orange light and tiny sparks running through them","x":1300,"y":600,"w":330,"h":200},
  {"id":"wallet","name":"Wallet","prompt":"A premium dark plum leather wallet standing slightly open towards the viewer, the Simosa logo mark embossed in glowing pink on its front, warm light spilling from inside","x":1520,"y":700,"w":290,"h":270}]},
{"kind":"logo","id":"logo","source":"upload","upload":0,"x":44,"y":44,"w":300,"h":70},
{"kind":"shape","id":"pill","shape":"rect","fill":"rgba(255,46,116,0.08)","border":{"color":"rgba(255,90,90,0.75)","width":2},"radius":28,"x":66,"y":176,"w":226,"h":56},
{"kind":"text","id":"pill_text","role":"label","text":"DOOR 6 OF 6","font":"Lato","size":22,"weight":700,"uppercase":true,"letter_spacing":0.2,"color":"#FF8A5B","align":"center","valign":"middle","x":66,"y":176,"w":226,"h":56},
{"kind":"text","id":"headline","role":"headline","text":"Door 6: any mini-app\ndeveloper can earn from\nads shown inside their app.","font":"Lato","size":76,"weight":800,"line_height":1.06,"color":"#FFFFFF","x":66,"y":252,"w":840,"h":250},
{"kind":"shape","id":"row1","shape":"rect","fill":"rgba(255,255,255,0.05)","frosted":{"blur":24},"highlight":true,"border":{"width":1.5,"gradient":{"angle":90,"stops":[{"color":"rgba(255,255,255,0.28)","pos":0},{"color":"rgba(255,255,255,0.08)","pos":100}]}},"radius":28,"x":58,"y":494,"w":826,"h":132},
{"kind":"shape","id":"row1_badge","shape":"ellipse","fill":"transparent","border":{"color":"#FF6A3D","width":2},"x":90,"y":522,"w":76,"h":76},
{"kind":"icon","id":"row1_icon","source":"lucide","name":"smartphone","color":"#FF6A3D","stroke":2,"x":110,"y":542,"w":36,"h":36},
{"kind":"text","id":"row1_title","role":"label","text":"How it works","font":"Lato","size":32,"weight":700,"color":"#FFFFFF","valign":"middle","x":196,"y":530,"w":210,"h":60},
{"kind":"shape","id":"row1_div","shape":"rect","fill":"rgba(255,255,255,0.18)","x":424,"y":524,"w":2,"h":72},
{"kind":"text","id":"row1_body","role":"body","text":"We place ads inside the\nmini app through our ad stack","font":"Lato","size":27,"color":"#E9E3EE","valign":"middle","x":456,"y":514,"w":410,"h":92},
… row2 ("The split", icon "chart-pie", y 640) and row3 ("Payout", icon "wallet", y 786) repeat row1 exactly with y offsets …
{"kind":"icon","id":"proof_icon","source":"lucide","name":"shield-check","color":"#9A93A3","x":62,"y":944,"w":34,"h":34},
{"kind":"text","id":"proof","role":"caption","text":"WeChat pays developers 70% of ad revenue until RMB 1M, then 50%.","font":"Lato","size":24,"color":"#9A93A3","valign":"middle","x":112,"y":940,"w":800,"h":42},
{"kind":"shape","id":"earn_card","shape":"rect","fill":"rgba(30,12,28,0.55)","frosted":{"blur":28},"highlight":true,"border":{"width":2,"gradient":{"angle":135,"stops":[{"color":"rgba(255,255,255,0.3)","pos":0},{"color":"#FF2E74","pos":100}]}},"shadow":{"color":"rgba(255,46,116,0.45)","blur":60,"dx":0,"dy":0},"radius":30,"x":1544,"y":220,"w":340,"h":256},
{"kind":"text","id":"earn_label","role":"label","text":"This month:","font":"Lato","size":32,"color":"#FFFFFF","x":1576,"y":262,"w":290,"h":44},
{"kind":"text","id":"earn_value","role":"stat","text":"PKR 84,300","font":"Lato","size":60,"weight":800,"gradient":{"angle":90,"stops":[{"color":"#FF8A1F","pos":0},{"color":"#FF2E74","pos":100}]},"x":1576,"y":312,"w":300,"h":76},
{"kind":"shape","id":"tag","shape":"rect","fill":"rgba(255,255,255,0.08)","border":{"color":"rgba(255,255,255,0.18)","width":1},"radius":20,"x":1576,"y":402,"w":118,"h":40},
{"kind":"text","id":"tag_text","role":"caption","text":"Illustrative","font":"Lato","size":20,"color":"#CFC8D6","align":"center","valign":"middle","x":1576,"y":402,"w":118,"h":40},
{"kind":"text","id":"wallet_label","role":"label","text":"Developer\nearnings","font":"Lato","size":32,"weight":500,"color":"#FFFFFF","align":"center","x":1630,"y":556,"w":210,"h":84},
{"kind":"icon","id":"kpi_icon","source":"lucide","name":"chart-line","color":"#FF6A3D","x":1006,"y":982,"w":44,"h":44},
{"kind":"text","id":"kpi","role":"caption","text":"KPI: ad revenue paid out to developers.","runs":[{"text":"KPI:","color":"#FF6A3D","weight":700}],"font":"Lato","size":28,"color":"#FFFFFF","valign":"middle","x":1070,"y":980,"w":760,"h":48}
]}
Notice: the phone, coin stream and wallet are ONE cluster (one image, perfectly connected, split into three editable layers); hero tilted and large; wallet substantial and logo-branded; the background's blooms are placed behind the phone and the wallet; the earnings card glows and sits by the cluster; rows have badge + title + divider + body; gradient stat; logo, proof line and KPI line anchor the corners. Apply the same standard to every composition (scene slides: the scene background carries the visual, cards and text are native; native slides: charts and type carry it).

══════════════════════════════════════════
STEP 5 — LAYOUT, HIERARCHY, READABILITY
══════════════════════════════════════════
- One clear focal point, one reading order. Align to a grid (e.g. 12 columns, 24px gutters); align text edges with each other and with cards.
- Dense slides (many cards/columns/pods): keep ALL the content the brief asks for, but structure it — consistent card sizes, consistent internal padding (≥24px), aligned baselines, repeated patterns. If it cannot fit at the readability floor, tighten copy inside cards rather than shrinking type.
- Text never sits on a busy part of an image: place it on negative space, a card, or a gradient strip.
- Cards behind text: the text box sits inside the card with ≥24px padding on every side.
- No two text boxes may overlap. Nothing important outside the canvas (bleeding decorative elements off-canvas is fine).
- Copy belongs to THIS slide only: never reuse another slide's title or lines (the slide list is context, not copy). If the brief gives no line for a strip/caption, write one for this slide's own point.
- Honor every explicit placement in the brief ("bottom-right corner empty", "logo small top-left", "slide number '09' grey bottom-right").
- Image elements never cover text boxes (connectors and glows may pass BEHIND cards). Keep image boxes inside the canvas (a small deliberate bleed off an edge is fine; a phone half off-screen is not). Stacked/fanned devices overlap each other by at most ~20%.
- Before submitting, check every box: x ≥ 0, y ≥ 0, x + w ≤ {W}, y + h ≤ {H} for text and cards; no text box intersects another text box or an image element.

OUTPUT ORDER: write the tool input keys in this order — composition, style_block, brands, background, layers — and inside "layers" put the image layers (background-most first) as early as the z-order allows, because generation of each image starts the moment its JSON is complete.

══════════════════════════════════════════
ART DIRECTION FOR THIS DECK
══════════════════════════════════════════
{ART_DIRECTION}

Submit the layout with the submit_slide_layout tool. Layers in back-to-front order.`;

// ─── Shared layout prefix + cache pre-warm ─────────────────────────────────
// Every slide-layout call starts with the same ~28k-token prefix: the tool,
// the quality library, the layout rules for this canvas, and the 4 reference
// slides (cache breakpoint on the last one). All slides of a deck are designed
// at the same moment, so on a cold cache every one of them would pay the
// cache WRITE price (1.25×) instead of the read price (0.1×). The flow starts
// one warm-up request as soon as the outline header arrives (well before the
// slides start), and layout calls wait for it if it is still running.
//
// The warm-up must render the identical prefix, including tool_choice (a
// different tool_choice is a different cache entry) — both go through
// claudeRequest(). Forced tool use (Sonnet 4.6) is rejected with
// max_tokens: 0, so there it uses max_tokens: 1 (one billed output token);
// models with auto tool choice (Sonnet 5.5) use 0.
const WARM_TTL_MS = 4 * 60 * 1000; // ephemeral cache lives 5 min; stay under it
const layoutWarmth = new Map(); // key → { at, promise }

function layoutPrefix(aspectRatio) {
  const canvas = canvasFor(aspectRatio);
  const system = LAYOUT_SYSTEM_PROMPT
    .replaceAll('{W}', canvas.w).replaceAll('{H}', canvas.h).replace('{M}', Math.round(canvas.w * 0.035))
    .replace('{ART_DIRECTION}', ART_DIRECTION);
  return {
    system: systemBlocks(system),
    // Newest models stream tool input only with eager_input_streaming (the
    // images start while the layout streams); older ones keep the exact
    // tool definition their cached prefix was written with.
    tools: libraryTools(),
  };
}

// One design system → the cached prefix depends only on the canvas.
const warmKey = (aspectRatio) => aspectRatio;

function noteLayoutCacheUse(aspectRatio) {
  const k = warmKey(aspectRatio);
  const cur = layoutWarmth.get(k);
  layoutWarmth.set(k, { at: Date.now(), promise: cur?.promise || null });
}

// Deck design shares the library part of the warm-up's prefix whatever the
// canvas, so it waits for any warm-up in flight.
async function awaitAnyLayoutWarm(timeoutMs = 10000) {
  const pending = [...layoutWarmth.values()].map(v => v.promise).filter(Boolean);
  if (!pending.length) return;
  await Promise.race([Promise.all(pending), new Promise(r => setTimeout(r, timeoutMs))]);
}

async function awaitLayoutWarm(aspectRatio, timeoutMs = 10000) {
  const cur = layoutWarmth.get(warmKey(aspectRatio));
  if (!cur?.promise) return;
  await Promise.race([cur.promise, new Promise(r => setTimeout(r, timeoutMs))]);
}

/**
 * Warm the slide-layout cache for this canvas. Skipped when a layout
 * call or warm-up used the same prefix within the last 4 minutes (the cache is
 * already warm) or in mock/files mode. Never throws.
 */
export function prewarmLayoutCache({ aspectRatio = '16:9', userId = null } = {}) {
  if (MOCK_MODE || FILES_MODE) return Promise.resolve(false);
  const k = warmKey(aspectRatio);
  const cur = layoutWarmth.get(k);
  if (cur && Date.now() - cur.at < WARM_TTL_MS) return cur.promise || Promise.resolve(false);
  const t0 = Date.now();
  const promise = getClient().messages.create(...claudeRequest({
    max_tokens: warmupMaxTokens(MODEL),
    ...layoutPrefix(aspectRatio),
    messages: [{ role: 'user', content: [...referenceSlideBlocks(), { type: 'text', text: 'Cache warm-up: no slide yet.' }] }],
  }, { tool: LAYOUT_TOOL.name })).then((response) => {
    account(userId, 'prewarmLayoutCache', response, t0);
    logger.info('layout cache warmed', { aspectRatio, ms: Date.now() - t0, cacheWrite: response.usage?.cache_creation_input_tokens, cacheRead: response.usage?.cache_read_input_tokens });
    return true;
  }).catch((err) => {
    logger.warn('layout cache warm-up failed', { errorMessage: err.message });
    layoutWarmth.delete(k); // let the next deck try again
    return false;
  }).finally(() => {
    const now = layoutWarmth.get(k);
    if (now) layoutWarmth.set(k, { at: now.at, promise: null });
  });
  layoutWarmth.set(k, { at: Date.now(), promise });
  return promise;
}

// onPartial(parts) fires while the tool call streams, with every part of the
// layout that is already complete (extractCompletedLayoutParts) — the caller
// starts image generation for finished image layers before the layout is done.
export async function designSlideLayout({ slide, header, deckDesign, brief, uploads = [], aspectRatio = '16:9', siblingTitles = [], instruction = null, userId = null, onPartial = null }) {
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
    slide.source_content ? `\nTHE USER'S ORIGINAL VERSION OF THIS SLIDE (from the deck they asked to redesign; positions are % of their slide). Keep its content, facts and intent; you may keep, improve or replace its structure, but the result must meet the quality bar:\n${String(slide.source_content).slice(0, 4500)}` : null,
    slide.source_data ? `\nDATA FOR THIS SLIDE (from the user's files): show it as a native chart layer with these exact values and categories (never invent or change a number):\n${String(slide.source_data).slice(0, 3000)}` : null,
    '',
    `ORIGINAL BRIEF (use its exact copy, numbers, brand names and art direction wherever it describes this slide):\n${String(brief || '').slice(0, 20000)}`,
    uploads.some((u, i) => uploadVisible(u, i, slide)) ? `\nThe user's images are shown below, each labelled UPLOAD N. Use them wherever applicable: place uploaded logos natively ("logo" with source "upload"); a real photo / product shot / screenshot from their files that must appear unchanged is placed the same way (a "logo" layer with source "upload" and that UPLOAD number: it is shown as-is, contained in its box); otherwise attach uploads as refs to the generated layers they should guide.` : null,
  ].filter(v => v !== null).join('\n');

  if (FILES_MODE) {
    const { response } = filesAgent('layout', { title: slide.title, brief: String(brief || '').slice(0, 20000), instruction, deck: deckDesign }, {
      tool: LAYOUT_TOOL.name, canvas, user_message: text, uploads: uploads.length,
    });
    if (!response) throw new Error('slide layout pending (files mode)');
    const out = sanitizeDeep(response);
    onPartial?.(out);
    return out;
  }
  // A pre-warm for this exact prefix may be in flight (all slides of a deck
  // start together): wait for it briefly so this call reads the cache
  // instead of writing its own copy.
  await awaitLayoutWarm(aspectRatio);
  noteLayoutCacheUse(aspectRatio);
  let lastLayerCount = -1; let sawBackground = false;
  // Raw event stream, not the SDK's MessageStream (see streamToolCall).
  const response = await streamToolCall(getClient(), claudeRequest({
    max_tokens: 12000,
    ...layoutPrefix(aspectRatio),
    messages: [{ role: 'user', content: [...referenceSlideBlocks(), { type: 'text', text }, ...uploadsContent(uploads, slide)] }],
  }, { tool: LAYOUT_TOOL.name }), {
    onJson: onPartial ? (json) => {
      const parts = extractCompletedLayoutParts(json);
      // Only notify when something new completed (cheap re-scan, rare callbacks).
      if (parts.layers.length !== lastLayerCount || (!!parts.background && !sawBackground)) {
        lastLayerCount = parts.layers.length;
        sawBackground = !!parts.background;
        try { onPartial(sanitizeDeep(parts)); } catch (err) { logger.warn('layout onPartial failed', { errorMessage: err.message }); }
      }
    } : null,
  });
  account(userId, 'designSlideLayout', response, t0);
  if (response.stop_reason === 'max_tokens') logger.warn('slide layout hit max_tokens', { slideIndex: slide.index, outputTokens: response.usage?.output_tokens });
  if (response.stop_reason === 'refusal') logger.warn('slide layout refused', { slideIndex: slide.index, details: response.stop_details });
  const out = toolInput(response, LAYOUT_TOOL.name);
  tracer.recordStep(_tid, `claude_layout_${slide.index}`, out ? 'completed' : 'failed', Date.now() - t0);
  if (!out) throw new Error('slide layout returned no tool call');
  logger.info('slide layout designed', { slideIndex: slide.index, ms: Date.now() - t0, layers: out.layers?.length, composition: out.composition, outputTokens: response.usage?.output_tokens, cacheWrite: response.usage?.cache_creation_input_tokens, cacheRead: response.usage?.cache_read_input_tokens });
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
  if (FILES_MODE) {
    const { key, response } = filesAgent('review', compact, { layers: compact, warnings }, { png: previewPng });
    if (!response) return { verdict: `review pending (files mode, key ${key})`, fixes: [] };
    return sanitizeDeep(response);
  }
  const response = await getClient().messages.create(...claudeRequest({
    max_tokens: 3000,
    system: REVIEW_SYSTEM_PROMPT,
    tools: [REVIEW_TOOL],
    messages: [{
      role: 'user',
      content: [
        imageBlock(`data:image/png;base64,${previewPng.toString('base64')}`, 'image/png'),
        { type: 'text', text: `LAYERS:\n${JSON.stringify(compact)}\n\nAUTOMATED CHECK WARNINGS:\n${warnings.length ? warnings.map(w => `- ${w}`).join('\n') : '(none)'}` },
      ],
    }],
  }, { tool: REVIEW_TOOL.name }));
  account(userId, 'reviewSlideLayout', response, t0);
  const out = toolInput(response, REVIEW_TOOL.name) || { verdict: 'no review', fixes: [] };
  tracer.recordStep(_tid, `claude_review_${slideIndex}`, 'completed', Date.now() - t0);
  logger.info('slide layout reviewed', { slideIndex, ms: Date.now() - t0, verdict: String(out.verdict).slice(0, 200), fixes: out.fixes?.length || 0 });
  return sanitizeDeep(out);
}

// ═══ 4. Natural-language edits of a built slide ═════════════════════════════
// The user describes a change ("make the title shorter", "swap the phone for a
// laptop", "darker background"). Claude sees the slide (rendered) and its
// layers and answers with the SMALLEST set of operations on those layers.
// Only image layers it explicitly regenerates (or adds) cost a new image —
// everything else is restyled natively. Applied by layoutEdit.applyEditOps.

const EDIT_TOOL = {
  name: 'submit_slide_edits',
  description: 'Submit the edit operations that carry out the user\'s instruction on this slide.',
  input_schema: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'One short sentence describing what you changed, for the user.' },
      ops: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            op: { type: 'string', enum: ['update', 'remove', 'add', 'regenerate', 'reorder', 'background'] },
            id: { type: 'string' },
            set: { type: 'object', description: 'update: fields to change (geometry, text, runs, size, color, gradient, weight, italic, align, font, fill, radius, border, opacity, chart categories/series/options, icon name/color, hidden)' },
            prompt: { type: 'string', description: 'regenerate / background: the full new image prompt' },
            refs: { type: 'array', items: { type: 'string' } },
            layer: { type: 'object', description: 'add: a new layer in the same format as the layout' },
            after: { type: 'string', description: 'add: insert just above this layer id (z-order)' },
            to: { type: 'string', enum: ['front', 'back', 'forward', 'backward'] },
            color: { type: 'string' },
            gradient: { type: 'object' },
          },
          required: ['op'],
        },
      },
    },
    required: ['summary', 'ops'],
  },
};

// Every call that carries the quality library (deck design, layout + its
// warm-up, AI edits) sends this EXACT tool list in this order. The cache key
// is the prefix tools → system → messages, so different tool lists made the
// ~24k-token library get written twice per deck (once by deck design, once
// by the layout warm-up). With one list, the library block (system block 1,
// cache_control) is written once and read by every other call; tool_choice
// still selects the one tool each call must answer with.
let _libraryTools = null;
function libraryTools() {
  if (!_libraryTools) {
    _libraryTools = [usesAutoTools(MODEL) ? { ...LAYOUT_TOOL, eager_input_streaming: true } : LAYOUT_TOOL, DECK_SYSTEM_TOOL, EDIT_TOOL];
  }
  return _libraryTools;
}

const EDIT_SYSTEM_PROMPT = `You are Nova, editing ONE slide you already designed. The slide is built from layers (canvas pixel coordinates, z-order = array order): a background, generated image elements (each has the "prompt" it was generated from), native text, shapes, charts, icons and logos. You see the rendered slide and its layer JSON.

Carry out the user's instruction with the SMALLEST set of operations:
- Text, colours, sizes, fonts, positions, chart numbers, icons, card styles → "update" the existing layers natively. Never regenerate an image to change text or colour that is a native layer.
- A different or changed OBJECT/PICTURE (e.g. "make the phone a laptop", "the coins should be gold", "add a rocket") → "regenerate" that image layer with a complete new prompt in the same rendering style as the other prompts (or "add" a new image layer with role "element" and a prompt). Prompts describe only the object, never text, except a "ui":true device whose on-screen copy lives in its prompt: to change that copy, "regenerate" the device with its full prompt and the new copy quoted exactly. A device with a native "screen" keeps its copy in its in_screen layers.
- A different mood/scene → "background" with a full new prompt (keep its negative space where the text sits), or a native color/gradient.
- Removing something → "remove". Layering → "reorder".
- Keep the deck's palette and fonts unless the user asks otherwise. Keep everything readable (WCAG AA contrast) and inside the canvas; when you move or resize, keep alignment with the surrounding layers.
- Use the user's exact wording for any new copy. Never invent statistics.
- If the user attached reference images (UPLOAD N), pass "refs": ["upload:N"] on the image you regenerate or add from them.
- If the instruction is impossible or already satisfied, return an empty ops list and say why in the summary.

Return at most ${MAX_GENERATIONS_PER_SLIDE} image regenerations/additions.`;

export async function editSlideLayout({ layout, previewPng, instruction, deckDesign = null, uploads = [], userId = null, slideIndex = 0 }) {
  const compact = {
    canvas: layout.canvas,
    fonts: layout.fonts,
    composition: layout.composition,
    background: (({ file, src, frosted_file, ...b }) => b)(layout.background || {}),
    layers: layout.layers.map(l => {
      const { file, src, frosted_file, screen_norm, refs, runs, ...rest } = l;
      if (rest.screen) rest.screen = { fill: rest.screen.fill };
      return { ...rest, ...(runs?.length ? { runs } : {}) };
    }),
  };
  if (MOCK_MODE) {
    // Mock: regenerate the hero with the instruction folded into its prompt,
    // so the whole edit pipeline (ops → partial rebuild → preview) runs.
    const hero = layout.layers.find(l => l.kind === 'image' && l.role === 'hero') || layout.layers.find(l => l.kind === 'image');
    const title = layout.layers.find(l => l.kind === 'text' && /head|title/.test(l.role || l.id));
    const ops = [];
    if (hero) ops.push({ op: 'regenerate', id: hero.id, prompt: `${hero.prompt || 'the main object'}. ${instruction}` });
    else if (title) ops.push({ op: 'update', id: title.id, set: { color: '#FFD166' } });
    return { summary: `Mock edit: ${instruction}`, ops };
  }
  if (FILES_MODE) {
    const { key, response } = filesAgent('edit', { compact, instruction }, { instruction, deck: deckDesign, layout: compact, uploads: uploads.length }, { png: previewPng });
    if (!response) throw new Error(`slide edit pending (files mode, key ${key})`);
    return sanitizeDeep(response);
  }
  const _tid = requestContext.getStore()?.requestId;
  const t0 = Date.now();
  tracer.recordStep(_tid, `claude_edit_${slideIndex}`, 'started', 0);
  const response = await getClient().messages.create(...claudeRequest({
    max_tokens: 6000,
    system: systemBlocks(EDIT_SYSTEM_PROMPT),
    tools: libraryTools(),
    messages: [{
      role: 'user',
      content: [
        imageBlock(`data:image/png;base64,${previewPng.toString('base64')}`, 'image/png'),
        { type: 'text', text: `DECK DESIGN SYSTEM:\n${JSON.stringify(deckDesign || {})}\n\nCURRENT LAYERS:\n${JSON.stringify(compact)}\n\nUSER INSTRUCTION:\n${String(instruction).slice(0, 2000)}${uploads.length ? `\n\nThe user attached ${uploads.length} image(s), shown below as UPLOAD 0..${uploads.length - 1}.` : ''}` },
        ...uploadsContent(uploads),
      ],
    }],
  }, { tool: EDIT_TOOL.name }));
  account(userId, 'editSlideLayout', response, t0);
  const out = toolInput(response, EDIT_TOOL.name) || { summary: 'no edit', ops: [] };
  tracer.recordStep(_tid, `claude_edit_${slideIndex}`, 'completed', Date.now() - t0);
  logger.info('slide edit planned', { slideIndex, ms: Date.now() - t0, ops: out.ops?.length || 0, summary: String(out.summary).slice(0, 200) });
  return sanitizeDeep(out);
}

// ═══ mock mode ══════════════════════════════════════════════════════════════
// A believable layered slide built from the outline, so the whole layered
// pipeline (and the editor/exporter on top of it) runs with zero API keys.

function mockDeckDesign() {
  const minimal = false;
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
  const d = deck || mockDeckDesign();
  const m = Math.round(W * 0.05);
  const points = (slide.key_points || []).slice(0, 3);
  const layers = [];
  const logoIdx = uploads.findIndex(u => u?.category === 'branding');
  if (logoIdx !== -1) layers.push({ kind: 'logo', id: 'logo', name: 'Logo', source: 'upload', upload: logoIdx, x: m, y: m * 0.6, w: 200, h: 56 });
  layers.push({ kind: 'image', id: 'glow', name: 'Glow', role: 'effect', prompt: 'soft pink and orange light glow', x: W * 0.5, y: H * 0.1, w: W * 0.5, h: H * 0.8 });
  layers.push({ kind: 'image', id: 'visual', name: 'Visual cluster', role: 'cluster', prompt: 'the companion orbits the hero', items: [
    { id: 'hero', name: 'Hero object', prompt: `a striking 3D object representing "${slide.title}"`, x: W * 0.56, y: H * 0.14, w: W * 0.26, h: H * 0.62 },
    { id: 'companion', name: 'Companion', prompt: 'a small glossy companion object', x: W * 0.84, y: H * 0.62, w: W * 0.13, h: H * 0.22 },
  ] });
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
