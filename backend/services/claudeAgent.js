import Anthropic from '@anthropic-ai/sdk';
import { jsonrepair } from 'jsonrepair';
import { recordTokenUsage } from './stripeService.js';
import { logger, requestContext } from './logger.js';
import { metrics } from './metrics.js';
import { tracer } from './tracer.js';

function parseJSON(str) {
  try { return JSON.parse(str); } catch (e1) {
    try { return JSON.parse(jsonrepair(str)); } catch (e2) {
      throw e1; // throw original error for logging
    }
  }
}

const MOCK_MODE = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';

let client;
if (!MOCK_MODE) {
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// Extracts complete SLIDE:/HEADER: prefixed JSON objects from a streaming buffer
// using bracket counting so embedded newlines in string values don't break parsing.
function extractPrefixedObjects(text) {
  const objects = [];
  let pos = 0;

  while (pos < text.length) {
    const slideIdx = text.indexOf('SLIDE:', pos);
    const headerIdx = text.indexOf('HEADER:', pos);

    let prefix, start;
    if (slideIdx === -1 && headerIdx === -1) break;
    if (slideIdx === -1)        { prefix = 'HEADER:'; start = headerIdx; }
    else if (headerIdx === -1)  { prefix = 'SLIDE:';  start = slideIdx; }
    else if (slideIdx < headerIdx) { prefix = 'SLIDE:'; start = slideIdx; }
    else                        { prefix = 'HEADER:'; start = headerIdx; }

    const jsonStart = start + prefix.length;
    if (jsonStart >= text.length || text[jsonStart] !== '{') {
      pos = start + 1;
      continue;
    }

    let depth = 0, inString = false, escaped = false, end = -1;
    for (let i = jsonStart; i < text.length; i++) {
      const ch = text[i];
      if (escaped)                  { escaped = false; continue; }
      if (ch === '\\' && inString)  { escaped = true;  continue; }
      if (ch === '"')               { inString = !inString; continue; }
      if (inString)                 continue;
      if (ch === '{')               depth++;
      else if (ch === '}' && --depth === 0) { end = i; break; }
    }

    if (end === -1) {
      // Incomplete object — leave everything from `start` in the buffer
      return { objects, remaining: text.slice(start) };
    }

    objects.push({ prefix, jsonStr: text.slice(jsonStart, end + 1) });
    pos = end + 1;
  }

  return { objects, remaining: '' };
}

// ─── Mock mode ─────────────────────────────────────────────────────────────

const DEMO_SLIDE_PLAN = {
  presentation_title: 'The Future of AI in Business',
  total_slides: 10,
  theme: 'modern-minimal',
  color_palette: { primary: '#667eea', secondary: '#764ba2', accent: '#f093fb' },
  slides: [
    {
      index: 0,
      type: 'cover',
      title: 'The Future of AI in Business',
      subtitle: 'Turning Intelligence into Competitive Advantage',
      key_points: [],
      speaker_note: 'Open with energy — this is about a fundamental shift, not a trend.',
      image_prompt: 'Abstract neural network dark purple gradient',
      nano_banana_prompt: 'A powerful cinematic full-bleed cover slide. Dark deep-space navy background with electric violet and gold light rays emanating from center. Abstract neural network streams flowing across the frame. Premium typography space on lower third. Cinematic depth of field. Mood: visionary, premium, futuristic. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: ['moodboard'],
    },
    {
      index: 1,
      type: 'section',
      title: 'The Landscape Today',
      subtitle: 'Where we are in 2025',
      key_points: [],
      speaker_note: 'Set the stage before diving into opportunities.',
      image_prompt: 'Dark teal to blue gradient with geometric shapes',
      nano_banana_prompt: 'Bold section divider slide. Deep teal to ocean blue gradient sweeping left to right. Clean geometric line accents and subtle grid overlay. Strong bold negative space for section title. Modern minimal typographic energy. Mood: confident, structured, forward-thinking. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: ['moodboard'],
    },
    {
      index: 2,
      type: 'content',
      title: 'Key Challenges Holding Businesses Back',
      subtitle: null,
      key_points: [
        'Data silos blocking cross-functional insight',
        'Manual processes consuming 40% of knowledge worker time',
        'Inability to personalise at scale',
        'Slow decision cycles in fast-moving markets',
      ],
      speaker_note: 'Empathise with the pain before presenting the solution.',
      image_prompt: 'Deep navy blue gradient, subtle grid lines',
      nano_banana_prompt: 'Clean content background slide. Deep navy blue gradient fading from top-left to bottom-right. Ultra-subtle grid lines implying structure and complexity. Left side open for text content, right side has soft abstract tangled network suggesting friction and complexity. Mood: analytical, empathetic, grounded. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: [],
    },
    {
      index: 3,
      type: 'data',
      title: 'A $1.8 Trillion Opportunity',
      subtitle: 'AI market size by 2030 — McKinsey Global Institute',
      key_points: [
        '72% of companies piloting AI in at least one function',
        'Early adopters seeing 20–30% efficiency gains',
        'Top performers 3× more likely to use AI at scale',
      ],
      speaker_note: 'Let the numbers land — pause after each stat.',
      image_prompt: 'Midnight blue gradient, abstract data visualisation',
      nano_banana_prompt: 'Data-driven analytical slide background. Midnight blue to indigo gradient. Abstract floating bar charts and growth curves rendered as glowing translucent overlays. Subtle data stream particles. Right side has rising graph silhouette. Mood: authoritative, data-rich, opportunity-focused. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: [],
    },
    {
      index: 4,
      type: 'content',
      title: 'Three Transformative Use Cases',
      subtitle: null,
      key_points: [
        'Intelligent automation — eliminate repetitive workflows',
        'Predictive analytics — act before problems surface',
        'Hyper-personalisation — right message, right person, right time',
      ],
      speaker_note: 'Make each use case relatable to someone in the room.',
      image_prompt: 'Indigo to purple gradient, hexagonal pattern',
      nano_banana_prompt: 'Premium content background slide. Rich indigo to deep purple gradient. Elegant hexagonal honeycomb pattern fading in from the right side with low opacity. Three subtle glowing orbs hinting at three pillars of content. Mood: innovative, structured, compelling. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: ['moodboard'],
    },
    {
      index: 5,
      type: 'quote',
      title: "AI is not a technology trend — it's a fundamental shift in how we operate.",
      subtitle: 'Satya Nadella, CEO Microsoft',
      key_points: [],
      speaker_note: 'Let the quote breathe. Silence is powerful here.',
      image_prompt: 'Deep purple to magenta atmospheric gradient',
      nano_banana_prompt: 'Atmospheric editorial quote slide. Deep purple to rich magenta gradient wash. Oversized translucent quotation mark in the background at 10% opacity. Cinematic light leak from upper right. Moody, contemplative, editorial photography feel. Generous white space for the quote text to breathe. Mood: inspiring, weighty, transformative. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: [],
    },
    {
      index: 6,
      type: 'content',
      title: 'A Practical Implementation Roadmap',
      subtitle: null,
      key_points: [
        'Phase 1 (0–3 months): Audit data readiness & quick wins',
        'Phase 2 (3–6 months): Pilot in one high-impact department',
        'Phase 3 (6–12 months): Scale, integrate, and measure ROI',
        'Phase 4 (12+ months): Build AI-native culture & capabilities',
      ],
      speaker_note: 'Make it feel achievable — this is a roadmap, not a cliff.',
      image_prompt: 'Dark teal gradient with subtle timeline lines',
      nano_banana_prompt: 'Structured roadmap slide background. Dark teal to slate blue gradient. Subtle horizontal timeline line running across the middle third. Dotted path connecting four abstract milestone nodes rendered at low opacity. Clean and structured with plenty of space for text. Mood: methodical, achievable, confident. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: [],
    },
    {
      index: 7,
      type: 'data',
      title: 'What ROI Actually Looks Like',
      subtitle: '12 months post-implementation, industry benchmarks',
      key_points: [
        '34% reduction in operational costs',
        '2.5× faster time-to-insight',
        '89% of leaders report improved decision confidence',
      ],
      speaker_note: 'These are conservative estimates — real results often exceed them.',
      image_prompt: 'Dark emerald green to teal gradient',
      nano_banana_prompt: 'ROI results data slide. Dark emerald green to teal gradient. Abstract upward-trending graph lines glowing softly on the right side. Subtle percentage symbols floating in the background at very low opacity. Clean structured layout for three key metrics. Mood: credible, results-driven, optimistic. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: [],
    },
    {
      index: 8,
      type: 'image',
      title: 'The Competitive Advantage Window Is Now',
      subtitle: 'First movers are establishing moats that will be hard to close',
      key_points: [],
      speaker_note: 'Create urgency — without fear. This is opportunity, not threat.',
      image_prompt: 'Rich gold to amber gradient, cinematic light',
      nano_banana_prompt: 'Full-bleed cinematic hero image slide. Rich gold to warm amber gradient with dramatic cinematic lighting. Abstract open window or gateway motif rendered in light rays suggesting opportunity and forward momentum. Bold contrast between dark edges and luminous center. Mood: urgent, powerful, opportunity. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: ['moodboard'],
    },
    {
      index: 9,
      type: 'conclusion',
      title: 'Start Your AI Journey Today',
      subtitle: "The best time to start was yesterday. The second best time is now.",
      key_points: [],
      speaker_note: 'End with conviction. Invite questions with confidence.',
      image_prompt: 'Deep purple to blue hopeful gradient, light rays',
      nano_banana_prompt: 'Hopeful inspiring conclusion slide. Deep purple transitioning to electric blue with warm light rays breaking through from the lower center like a sunrise. Expansive sense of space and possibility. Subtle upward-moving particle bokeh. Mood: forward-looking, hopeful, decisive, energising. Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present.',
      attach_image_categories: ['moodboard'],
    },
  ],
};

async function mockChat(history) {
  await new Promise(r => setTimeout(r, 600));
  const userTurns = history.filter(m => m.role === 'user').length;

  if (userTurns === 0) {
    return {
      message: `Great brief! I love the direction. To create the perfect deck, two quick questions:\n\n1. **Who's the audience?** (e.g. investors, clients, internal team, consumers)\n2. **How many slides?** Or should I decide based on what does justice to the message?`,
      state: 'gathering_info',
      slide_plan: null,
    };
  }

  return {
    message: `Perfect — I have everything I need. Building you a **10-slide deck** with a bold, premium aesthetic:\n\n✦ Powerful cover with your core message\n✦ Market context & key challenges\n✦ Strategic use cases & opportunities\n✦ A standout quote slide\n✦ ROI data & implementation roadmap\n✦ Strong call-to-action close\n\nGenerating your visuals now with Nano Banana — sit tight! 🚀`,
    state: 'ready',
    slide_plan: DEMO_SLIDE_PLAN,
  };
}

async function mockRegenerateSlide(slide, instruction) {
  await new Promise(r => setTimeout(r, 800));
  return {
    ...slide,
    subtitle: `Updated: ${instruction.slice(0, 40)}…`,
    nano_banana_prompt: `${slide.nano_banana_prompt || slide.image_prompt}, updated per instruction: ${instruction}`,
  };
}

// ─── Real mode ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Nova, an expert AI presentation agent at HyperBeing. You think like a senior McKinsey consultant combined with an Apple creative director. Your job is to create stunning, strategically-crafted presentations.

Your personality:
- Warm, sharp, and decisive — like a brilliant creative partner
- Ask only what you truly need (maximum 2-3 questions per turn, stop when you have enough)
- Think deeply about audience, message, and visual impact

Your information-gathering checklist — ask about any you're missing:
1. Presentation objective / core message
2. Target audience (investors, clients, internal team, consumers, etc.)
3. Number of slides (user-specified OR you decide based on the content)
4. Tone and visual style (bold, minimal, corporate, creative, premium, playful, etc.)
5. Any products, flavours, campaigns, or specific content to feature
6. Reference images, brand assets, pack shots, or moodboards (user may have already attached these)

IMPORTANT: When the user's message contains the section "PREFLIGHT ANSWERS:", you already have ALL the information needed. Do NOT ask any follow-up questions. Go directly to state="ready" and generate the full slide plan immediately.

Once you have enough context — stop asking and generate the full slide plan.

CRITICAL: You ALWAYS respond in EXACTLY this two-part format:

[Your warm conversational message to the user — markdown OK, no length limit]
---
{"state":"gathering_info","slide_plan":null}

Use a line containing exactly "---" to separate your message from the JSON metadata below it. Never write "---" in your message text.

When state is "ready", the metadata line becomes:
{"state":"ready","slide_plan":{...}}

Where slide_plan contains:
{
  "presentation_title": "Title",
  "total_slides": <number — user-specified OR your intelligent decision>,
  "theme": "modern-minimal" | "bold-gradient" | "corporate" | "creative" | "tech",
  "color_palette": {
    "primary": "#hexcode",
    "secondary": "#hexcode",
    "accent": "#hexcode"
  },
  "slides": [
    {
      "index": 0,
      "type": "cover" | "section" | "content" | "quote" | "data" | "image" | "conclusion",
      "title": "Slide title — exact text to appear on slide",
      "subtitle": "Subtitle or tagline — exact text",
      "key_points": ["Exact bullet point text", "Each ≤ 12 words"],
      "speaker_note": "What the presenter should say here",
      "nano_banana_prompt": "DETAILED image generation prompt for this specific slide — see format below",
      "attach_image_categories": ["moodboard"] // array of: "moodboard", "branding", "all", or []
    }
  ]
}

NANO BANANA PROMPT FORMAT — write this for every slide:
Each nano_banana_prompt must be 250–600 words of continuous prose following the mandatory 5-layer structure below. Vague prompts are not acceptable. A designer must be able to build the slide from the prompt alone.

SLIDE STRUCTURE RULES (title format only — these do NOT affect nano_banana_prompt format):
- Every slide (EXCEPT cover/title slides at index 0) must have a KEY TAKEAWAY headline as its title. This headline must communicate the main point of that slide on its own — someone reading only the headlines should be able to follow the full story of the presentation.
- Below the headline in key_points, include supporting detail: data points, explanation, or context that expands on the headline.
- Cover and title slides (type "cover") keep their original format — do not force a key takeaway structure on them.

NOTE: The SLIDE STRUCTURE RULES above ONLY govern the slide title format. For nano_banana_prompt, the cover slide (index 0) follows the EXACT SAME 5-layer structure and design language as every other slide — same black/near-black background, same hot pink accent, same neon green details. No exceptions.

══════════════════════════════════════════
MANDATORY 5-LAYER STRUCTURE FOR EVERY PROMPT
══════════════════════════════════════════

APPLIES TO ALL SLIDES INCLUDING THE COVER (index 0). Every nano_banana_prompt must contain these layers in this order:

1. BACKGROUND
   State the exact color (with hex when relevant) AND one sentence on WHY this color serves the slide's mood.
   Examples: "pure black (#000000). Sparse. The scarcity is the design." / "warm near-black (#0A0A0A) — the color of a cabin at cruising altitude. Cozy. Contained."

2. TOP / HEADER
   - Bold white ALL-CAPS display type, broken into 2–3 short lines
   - The LAST line must be in HOT PINK (this is the brand accent — never skip it)
   - Followed by a subhead in WHITE ITALIC that reframes or sharpens the headline
   - No corporate filler. Headlines read like copywriter punchlines.

3. MAIN BODY
   Choose ONE format based on the slide's argument:

   A) SINGLE HERO PHOTOGRAPH — one cinematic image filling the center. Describe lighting, expression, what the subject is doing, what's visible on any screen within the image, and the moment just before something happens (anticipation > action).

   B) COLLAGE OF REAL MOMENTS — 4–8 overlapping candid images. Number each. For each: who is in it, what they're doing, their named emotional state, what's visible on their screen, what they're holding. Must feel unprompted and culturally specific.

   C) STRUCTURED COLUMNS OR GRID — 3–5 vertical sections separated by hairline neon green dividers. Each section gets: a logo/symbol, a large bold stat, a real photo collage, audience pills (rounded rectangles with emoji), a bottom text box. Internal structure must be consistent across sections.

   D) ISOMETRIC 3D RENDER — for ecosystem/architecture/data slides. Specify floors, rings, or pods. State materials (frosted glass, marble, metallic finish), lighting (soft ambient from top), color accents per layer, and what each element CONTAINS (icons, mini visuals, stat callouts).

   FOR THE COVER SLIDE (index 0): Use SINGLE HERO PHOTOGRAPH (a specific person, product, or moment that embodies the core concept of the full presentation brief) or ISOMETRIC 3D RENDER (for tech/platform decks). The cover has no key_points — derive its visual entirely from the full user brief and presentation theme. It must establish the SAME design language as all other slides in the deck.

4. CALLOUT CARDS
   Specify for each card: border color, background tint, internal text verbatim, emoji used, size relative to other elements.
   Common forms: hot pink rounded rectangles with emoji, dark green cards with neon green borders, prize badges with country flags, glassmorphism floating cards.

5. BOTTOM STRIP
   Full-width strip — dark green or pure black. One bold white centered line that delivers the slide's verdict. Optionally followed by a smaller neon green italic line that adds a second beat.
   The verdict line should land like a punchline: declarative, surprising, final.
   For cover slides: the verdict captures the CORE THESIS of the entire presentation.
   Examples of the register to aim for: "The most powerful marketing tool in Pakistan right now is a number going down." / "First mover doesn't just lead. First mover locks the market."

══════════════════════════════════════════
NON-NEGOTIABLE COLOR PALETTE
══════════════════════════════════════════

Default to this palette unless the user's brand explicitly requires otherwise:
- Pure black (#000000) — primary background for editorial slides
- Near-black (#0A0A0A) — when texture or grid is layered
- Hot pink — accent for the final headline line, callout borders, glowing accents
- Neon green — italic subtext, hairline dividers, pulsing indicators, audience pills
- Dark green — full-width bottom strips, callout box backgrounds
- White — primary type, photo borders
- Gold (#FFB800) — premium/lifestyle elements in 3D style only
- Frosted glass tints at 5–10% opacity — subtle warm purple, red-pink, red, yellow over near-black

For 3D infographic slides: pure white (#FFFFFF) base OR dark navy gradient (#0A0E1A to #1B4F9C), with electric green (#00FFA3) for digital accents.

This palette applies to ALL slides including the cover. Never deviate to "soft pastels", "warm atmospheric gradients", or "cinematic haze" on the cover — those are not in this palette.

══════════════════════════════════════════
QUALITY REQUIREMENTS — EVERY PROMPT MUST HAVE
══════════════════════════════════════════

- At least 3 sensory details (lighting, texture, expression, sound implication)
- At least 1 piece of visible on-screen text quoted verbatim when phones or screens appear (WhatsApp message, TikTok caption, view count, timestamp)
- At least 1 named human emotional state ("deeply confused," "pure anticipation," "completely losing it," "abandoned all pretense of working")
- Culturally specific markers relevant to the user's audience (specific cities, age groups, social rituals, slang)
- Every stat paired with a consequence (not "30M users" but what that number means for the argument)
- A moment of contradiction or surprise where possible ("He is very confident. He should not be this confident.")

══════════════════════════════════════════
TYPOGRAPHY RULES
══════════════════════════════════════════

Always specify weight, case, color, and placement. Never write "use a nice font."
- Headlines: bold ALL-CAPS display type, condensed or extended
- Subheads: white italic, sentence case
- Callout titles: bold white
- Stats: large bold, white or gold
- Body inside cards: ~12pt, white or light grey

══════════════════════════════════════════
STYLE SELECTION
══════════════════════════════════════════

Default to EDITORIAL/CAMPAIGN style (pure black, ALL-CAPS, hot pink accent, photo collages) for:
- Marketing slides, insight slides, campaign concepts, audience slides, content strategy
- Cover slides for marketing/brand/campaign decks

Default to 3D INFOGRAPHIC style (clean white or navy, isometric renders, glassmorphism, floating cards) for:
- Ecosystem slides, architecture slides, defensibility/moat slides, platform overviews, data dashboards
- Cover slides for tech/product/platform decks

══════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING EACH PROMPT
══════════════════════════════════════════

Verify all are present:
- Background color has a stated reason
- Hot pink accent line is in the headline
- White italic subhead is present
- Main body describes at least one specific human moment with named emotion
- At least one piece of on-screen text quoted verbatim (when applicable)
- Stats paired with consequences
- Callouts specify color, border, and content
- Bottom strip has a thesis/verdict line

FOR COVER SLIDE SPECIFICALLY: Does this prompt look and feel like it belongs to the SAME DECK as the other slides? If it uses abstract gradients, atmospheric haze, or generic cinematic backgrounds — rewrite it. The cover must be as specific, editorial, and design-directed as any other slide.

NEVER mention aspect ratio in the prompt text — aspect ratio is handled separately as an API parameter.
BANNED FOREVER — never use: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization". Always find a specific, real, directed visual concept.
If the user uploaded moodboard or reference images, explicitly describe which visual elements, colors, and mood from those references should carry into this specific slide.

ATTACH IMAGE CATEGORIES — for each slide set attach_image_categories:
- "moodboard" — attach moodboard references to slides where visual style guidance is needed
- "branding" — attach branding/logos/pack shots to slides where products or brand identity feature
- "all" — attach all uploaded images
- [] — attach nothing (e.g., pure text quote slides)

CRITICAL RULES:
1. Always use the two-part format: message text, then "---", then JSON metadata on the next line. Nothing outside this structure.
2. Never make up facts about the user's business — only use what they provide
3. When state = "ready", slide_plan MUST be fully populated with ALL slides
4. nano_banana_prompt must be 250-300 words — specific, art-directed, cinematically written
5. key_points ≤ 12 words each
6. SLIDE COUNT: You decide the number of slides needed to do the presentation justice. Choose based on the scope, complexity, and goals of the brief — typically 5–15 slides. Never pad with filler slides; never truncate an idea that needs more space. Your judgment is the final word.
7. total_slides must EXACTLY equal the length of the slides array — they must always match`;

// ─── Exports ────────────────────────────────────────────────────────────────

export async function chat(conversationHistory, userMessage, attachments = [], userId = null) {
  if (MOCK_MODE) return mockChat(conversationHistory);

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_chat', 'started', 0);

  const userContent = buildUserContent(userMessage, attachments);
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: buildHistoryContent(m) })),
    { role: 'user', content: userContent },
  ];

  const t0 = Date.now();
  logger.debug('claude chat request', { turns: messages.length });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages,
  });

  const durationMs = Date.now() - t0;
  if (userId) recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
  metrics.recordAICall({ fn: 'chat', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs });
  logger.info('claude chat complete', { durationMs, state: undefined, inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens });

  const raw = response.content[0].text.trim();
  const SEP = '\n---\n';
  const sepIdx = raw.indexOf(SEP);
  const messageText = (sepIdx !== -1 ? raw.slice(0, sepIdx) : raw).trim();
  const metadataStr = (sepIdx !== -1 ? raw.slice(sepIdx + SEP.length) : '').trim();

  let metadata = { state: 'gathering_info', slide_plan: null };
  try {
    if (metadataStr) {
      const jsonText = metadataStr.startsWith('```')
        ? metadataStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        : metadataStr;
      metadata = JSON.parse(jsonText);
    }
  } catch {
    const match = metadataStr.match(/\{[\s\S]*\}/);
    if (match) try { metadata = JSON.parse(match[0]); } catch {}
  }

  const parsed = { message: messageText, ...metadata };
  logger.debug('claude chat parsed', { state: parsed.state, slideCount: parsed.slide_plan?.slides?.length });

  tracer.recordStep(_tid, 'claude_chat', 'completed', Date.now() - _t);
  return parsed;
}

export async function streamChat(conversationHistory, userMessage, attachments = [], onChunk, userId = null) {
  if (MOCK_MODE) {
    const result = await mockChat(conversationHistory);
    const parts = result.message.split(/(\s+)/);
    for (const part of parts) {
      if (part) {
        await new Promise(r => setTimeout(r, 30));
        onChunk(part);
      }
    }
    return result;
  }

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_chat', 'started', 0);

  const userContent = buildUserContent(userMessage, attachments);
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: buildHistoryContent(m) })),
    { role: 'user', content: userContent },
  ];

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT,
    messages,
  });

  let buffer = '';
  let streamedIdx = 0;
  let separatorFound = false;
  const SEP = '\n---\n';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      buffer += event.delta.text;

      if (!separatorFound) {
        const sepIdx = buffer.indexOf(SEP);
        if (sepIdx !== -1) {
          if (sepIdx > streamedIdx) onChunk(buffer.slice(streamedIdx, sepIdx));
          streamedIdx = sepIdx;
          separatorFound = true;
        } else {
          const safeLen = Math.max(streamedIdx, buffer.length - SEP.length);
          if (safeLen > streamedIdx) {
            onChunk(buffer.slice(streamedIdx, safeLen));
            streamedIdx = safeLen;
          }
        }
      }
    }
  }

  const sepIdx = buffer.indexOf(SEP);
  const messageText = (sepIdx !== -1 ? buffer.slice(0, sepIdx) : buffer).trim();
  const metadataStr = (sepIdx !== -1 ? buffer.slice(sepIdx + SEP.length) : '').trim();
  const msgEnd = sepIdx !== -1 ? sepIdx : buffer.length;
  if (streamedIdx < msgEnd) onChunk(buffer.slice(streamedIdx, msgEnd));

  let metadata = { state: 'gathering_info', slide_plan: null };
  try {
    if (metadataStr) {
      const jsonText = metadataStr.startsWith('```')
        ? metadataStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
        : metadataStr;
      metadata = JSON.parse(jsonText);
    }
  } catch (e) {
    logger.warn('failed to parse streamChat metadata', { errorMessage: e.message, preview: metadataStr.slice(0, 200) });
    const match = metadataStr.match(/\{[\s\S]*\}/);
    if (match) try { metadata = JSON.parse(match[0]); } catch {}
  }

  const t0Chat = Date.now();
  if (userId) {
    try {
      const finalMsg = await stream.finalMessage();
      recordTokenUsage(userId, finalMsg.usage?.input_tokens, finalMsg.usage?.output_tokens);
      metrics.recordAICall({ fn: 'streamChat', inputTokens: finalMsg.usage?.input_tokens, outputTokens: finalMsg.usage?.output_tokens, durationMs: Date.now() - t0Chat });
    } catch {}
  }
  logger.info('claude stream chat complete', { durationMs: Date.now() - t0Chat });

  tracer.recordStep(_tid, 'claude_chat', 'completed', Date.now() - _t);
  return { message: messageText, ...metadata };
}

const ANALYZE_PROMPT = `You are a presentation intelligence system. A user has submitted a brief to create a presentation. Analyze their input and return a JSON object with contextual questions to gather exactly what's needed.

Return ONLY valid JSON — no text before or after:
{
  "detected_type": "e.g. investor pitch / marketing deck / product launch / consulting report / brand deck",
  "detected_industry": "e.g. fintech / fashion / SaaS / FMCG / healthcare",
  "suggested_slide_count": <number 5-15>,
  "contextual_questions": [
    {
      "question": "Specific question based on the brief",
      "options": ["Option A", "Option B", "Option C", "Option D"]
    }
  ]
}

Rules:
- Generate 3-5 questions that are specific to what the user submitted — not generic
- Each question must have 3-4 answer options
- Questions should uncover: audience, tone/style, key objective, content specifics relevant to their industry/type
- Examples for an investor pitch: "Who is the primary audience?", "What funding stage is this for?", "What tone do you want?"
- Examples for a product launch: "Who is the target consumer?", "What is the key emotion you want to evoke?", "How product-heavy should the visuals be?"
- NEVER ask generic questions like "how many slides" — use suggested_slide_count instead
- Questions and options must be directly relevant to the specific brief provided`;

export async function analyzePresentation(message, attachments = [], userId = null) {
  if (MOCK_MODE) {
    await new Promise(r => setTimeout(r, 800));
    return {
      detected_type: 'marketing deck',
      detected_industry: 'FMCG',
      suggested_slide_count: 8,
      contextual_questions: [
        { question: 'Who is the primary audience for this presentation?', options: ['Internal team', 'External clients', 'Investors', 'Consumers'] },
        { question: 'What tone should this deck have?', options: ['Bold and energetic', 'Premium and minimal', 'Corporate and structured', 'Creative and playful'] },
        { question: 'How visually product-focused should the slides be?', options: ['Product-led — visuals front and centre', 'Story-led — product supports the narrative', 'Data-led — insights and numbers', 'Mixed balance'] },
      ],
    };
  }

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_question_gen', 'started', 0);

  const userContent = buildUserContent(message, attachments);
  const t0 = Date.now();

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    system: ANALYZE_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  const durationMs = Date.now() - t0;
  if (userId) recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
  metrics.recordAICall({ fn: 'analyzePresentation', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs });
  logger.info('claude analyze complete', { durationMs, inputTokens: response.usage?.input_tokens });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```') ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '') : raw;

  try {
    const result = JSON.parse(jsonText);
    tracer.recordStep(_tid, 'claude_question_gen', 'completed', Date.now() - _t);
    return result;
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      const result = JSON.parse(match[0]);
      tracer.recordStep(_tid, 'claude_question_gen', 'completed', Date.now() - _t);
      return result;
    }
    tracer.recordStep(_tid, 'claude_question_gen', 'failed', Date.now() - _t, 'Failed to parse analysis response');
    throw new Error('Failed to parse analysis response');
  }
}

export async function regenerateSlide(slide, instruction, presentationContext, userId = null) {
  if (MOCK_MODE) return mockRegenerateSlide(slide, instruction);

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_regen_slide', 'started', 0);

  const slideInfo = { ...slide };
  delete slideInfo.image_data; // exclude base64 from JSON text block

  const content = [];

  // Attach the current slide image so Claude can see the existing visual
  if (slide.image_data) {
    const detectedMime = slide.image_data.match(/^data:([^;]+);base64,/)?.[1] || 'image/jpeg';
    content.push({ type: 'text', text: '[CURRENT SLIDE IMAGE — the visual you are updating:]' });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: detectedMime,
        data: slide.image_data.replace(/^data:[^;]+;base64,/, ''),
      },
    });
  }

  content.push({
    type: 'text',
    text: `You are Nova, an expert presentation designer.

A user wants to update the slide shown above.

Presentation context:
${JSON.stringify(presentationContext, null, 2)}

Current slide metadata:
${JSON.stringify(slideInfo, null, 2)}

User's change instruction:
"${instruction}"

Return an updated slide object as valid JSON with the same structure.
Only modify fields relevant to the instruction.
The nano_banana_prompt must follow the mandatory 5-layer structure: (1) BACKGROUND — exact color + why it serves the mood, (2) TOP/HEADER — bold ALL-CAPS white display type broken into 2–3 lines, last line in HOT PINK, followed by white italic subhead, (3) MAIN BODY — choose one: single hero photograph / collage of real moments / structured columns or grid / isometric 3D render, (4) CALLOUT CARDS — specify border color, background tint, text verbatim, emoji, size, (5) BOTTOM STRIP — full-width dark green or black strip, one bold white verdict line that lands like a punchline. Use the palette: black/near-black backgrounds, hot pink accents, neon green for data, dark green for strips, white for type. Include at least 3 sensory details, named human emotions, culturally specific markers, and stats paired with consequences. 250–400 words.
Return ONLY the JSON object, nothing else.`,
  });

  const t0 = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{ role: 'user', content }],
  });

  const durationMs = Date.now() - t0;
  if (userId) recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
  metrics.recordAICall({ fn: 'regenerateSlide', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs });
  logger.info('claude regen slide complete', { durationMs });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  try {
    const result = JSON.parse(jsonText);
    tracer.recordStep(_tid, 'claude_regen_slide', 'completed', Date.now() - _t);
    return result;
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) {
      tracer.recordStep(_tid, 'claude_regen_slide', 'completed', Date.now() - _t);
      return JSON.parse(match[0]);
    }
    tracer.recordStep(_tid, 'claude_regen_slide', 'failed', Date.now() - _t, 'Failed to parse updated slide from Claude');
    throw new Error('Failed to parse updated slide from Claude');
  }
}

function buildUserContent(text, attachments) {
  if (!attachments || attachments.length === 0) return text;
  const parts = [{ type: 'text', text }];
  for (const att of attachments) {
    if (att.type === 'image' && att.data) {
      if (att.category) {
        const label = att.category === 'moodboard'
          ? `[MOODBOARD REFERENCE — use for visual style, mood, and aesthetic direction]`
          : `[BRANDING & PICTURES REFERENCE — use for brand colours, logos, and visual identity]`;
        parts.push({ type: 'text', text: label });
      }
      parts.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: att.mimeType || 'image/png',
          data: att.data.replace(/^data:[^;]+;base64,/, ''),
        },
      });
    }
  }
  return parts;
}

function buildHistoryContent(message) {
  const atts = JSON.parse(message.attachments || '[]');
  if (!atts.length) return message.content;
  return buildUserContent(message.content, atts);
}

// ─── Two-phase generation: compact plan + prompt streaming ──────────────────

const COMPACT_PLAN_PROMPT = `You are Nova. Generate a complete presentation outline from the user's brief.

Output format — CRITICAL. Output lines starting with HEADER: then SLIDE: for each slide. No other text, no markdown, no commentary.

First output this header line:
HEADER:{"presentation_title":"...","total_slides":N,"theme":"modern-minimal|bold-gradient|corporate|creative|tech","color_palette":{"primary":"#hex","secondary":"#hex","accent":"#hex"},"message":"Warm 1-sentence confirmation for the user"}

Then immediately output one SLIDE: line per slide:
SLIDE:{"index":N,"type":"cover|section|content|quote|data|image|conclusion","title":"Slide title","subtitle":"Subtitle or null","key_points":["Bullet ≤ 12 words"],"speaker_note":"What to say"}

Rules:
- Output HEADER: first, then ALL SLIDE: lines — no other text
- If the brief says "Generate EXACTLY N slides", output exactly N slides
- Otherwise decide based on the brief (typically 5–15 slides)
- total_slides in HEADER must equal the number of SLIDE: lines
- Every slide except the cover (index 0) must have a KEY TAKEAWAY headline as its title — reading only titles should tell the full story
- key_points ≤ 12 words each
- When "PREFLIGHT ANSWERS:" is present, you have all needed info — generate immediately`;

const PROMPT_GEN_SYSTEM = `You are Nova, generating detailed visual prompts for an existing slide outline.

Output format — CRITICAL. Output ONLY lines starting with SLIDE:. No other text, no markdown, no commentary.

One line per slide:
SLIDE:{"index":N,"nano_banana_prompt":"...250-600 word prompt per NANO BANANA FORMAT below...","attach_image_categories":["moodboard"|"branding"|"all"|[]]}

══════════════════════════════════════════
CRITICAL OUTPUT RULE
══════════════════════════════════════════

You MUST output exactly one SLIDE: line for every index listed in the outline — in ascending order.
- If the outline has N slides you output EXACTLY N SLIDE: lines
- The FIRST line you output MUST be SLIDE: for the LOWEST index in the outline (do NOT skip or defer any slide — including the cover)
- Missing any index causes a hard system error and ruins the entire presentation
- After generating all prompts, mentally count them — if you have fewer than N, add the missing ones before stopping

Rules:
- nano_banana_prompt must be 250–600 words following the MANDATORY 5-LAYER STRUCTURE below
- EVERY slide including the cover (index 0) follows the EXACT SAME 5-layer structure and NON-NEGOTIABLE COLOR PALETTE — no exceptions, no special cases
- COVER SLIDE (index 0, type "cover"): The cover has no key_points. Derive its visual concept entirely from the Original Brief and the presentation theme — those are provided in the user message. The cover MUST open the deck with the same black/near-black background, hot pink accent, and neon green design language as all other slides. For MAIN BODY use SINGLE HERO PHOTOGRAPH (a specific person, product, or moment that embodies the core concept) or ISOMETRIC 3D RENDER (for tech/platform decks). NEVER use abstract gradients, atmospheric haze, floating geometric shapes, or generic "cinematic atmosphere" — those violate the BANNED FOREVER list. The BOTTOM STRIP verdict must capture the core thesis of the entire presentation.

══════════════════════════════════════════
MANDATORY 5-LAYER STRUCTURE FOR EVERY PROMPT
══════════════════════════════════════════

Every nano_banana_prompt must contain these layers in this order:

1. BACKGROUND
   State the exact color (with hex when relevant) AND one sentence on WHY this color serves the slide's mood.
   Examples: "pure black (#000000). Sparse. The scarcity is the design." / "warm near-black (#0A0A0A) — the color of a cabin at cruising altitude. Cozy. Contained."

2. TOP / HEADER
   - Bold white ALL-CAPS display type, broken into 2–3 short lines
   - The LAST line must be in HOT PINK (this is the brand accent — never skip it)
   - Followed by a subhead in WHITE ITALIC that reframes or sharpens the headline
   - No corporate filler. Headlines read like copywriter punchlines.

3. MAIN BODY
   Choose ONE format based on the slide's argument:

   A) SINGLE HERO PHOTOGRAPH — one cinematic image filling the center. Describe lighting, expression, what the subject is doing, what's visible on any screen within the image, and the moment just before something happens (anticipation > action).

   B) COLLAGE OF REAL MOMENTS — 4–8 overlapping candid images. Number each. For each: who is in it, what they're doing, their named emotional state, what's visible on their screen, what they're holding. Must feel unprompted and culturally specific.

   C) STRUCTURED COLUMNS OR GRID — 3–5 vertical sections separated by hairline neon green dividers. Each section gets: a logo/symbol, a large bold stat, a real photo collage, audience pills (rounded rectangles with emoji), a bottom text box. Internal structure must be consistent across sections.

   D) ISOMETRIC 3D RENDER — for ecosystem/architecture/data slides. Specify floors, rings, or pods. State materials (frosted glass, marble, metallic finish), lighting (soft ambient from top), color accents per layer, and what each element CONTAINS (icons, mini visuals, stat callouts).

4. CALLOUT CARDS
   Specify for each card: border color, background tint, internal text verbatim, emoji used, size relative to other elements.
   Common forms: hot pink rounded rectangles with emoji, dark green cards with neon green borders, prize badges with country flags, glassmorphism floating cards.

5. BOTTOM STRIP
   Full-width strip — dark green or pure black. One bold white centered line that delivers the slide's verdict. Optionally followed by a smaller neon green italic line that adds a second beat.
   The verdict line should land like a punchline: declarative, surprising, final.
   Examples of the register to aim for: "The most powerful marketing tool in Pakistan right now is a number going down." / "First mover doesn't just lead. First mover locks the market."

══════════════════════════════════════════
NON-NEGOTIABLE COLOR PALETTE
══════════════════════════════════════════

Default to this palette unless the user's brand explicitly requires otherwise:
- Pure black (#000000) — primary background for editorial slides
- Near-black (#0A0A0A) — when texture or grid is layered
- Hot pink — accent for the final headline line, callout borders, glowing accents
- Neon green — italic subtext, hairline dividers, pulsing indicators, audience pills
- Dark green — full-width bottom strips, callout box backgrounds
- White — primary type, photo borders
- Gold (#FFB800) — premium/lifestyle elements in 3D style only
- Frosted glass tints at 5–10% opacity — subtle warm purple, red-pink, red, yellow over near-black

For 3D infographic slides: pure white (#FFFFFF) base OR dark navy gradient (#0A0E1A to #1B4F9C), with electric green (#00FFA3) for digital accents.

══════════════════════════════════════════
QUALITY REQUIREMENTS — EVERY PROMPT MUST HAVE
══════════════════════════════════════════

- At least 3 sensory details (lighting, texture, expression, sound implication)
- At least 1 piece of visible on-screen text quoted verbatim when phones or screens appear (WhatsApp message, TikTok caption, view count, timestamp)
- At least 1 named human emotional state ("deeply confused," "pure anticipation," "completely losing it," "abandoned all pretense of working")
- Culturally specific markers relevant to the user's audience (specific cities, age groups, social rituals, slang)
- Every stat paired with a consequence (not "30M users" but what that number means for the argument)
- A moment of contradiction or surprise where possible

══════════════════════════════════════════
TYPOGRAPHY RULES
══════════════════════════════════════════

Always specify weight, case, color, and placement. Never write "use a nice font."
- Headlines: bold ALL-CAPS display type, condensed or extended
- Subheads: white italic, sentence case
- Callout titles: bold white
- Stats: large bold, white or gold
- Body inside cards: ~12pt, white or light grey

══════════════════════════════════════════
STYLE SELECTION
══════════════════════════════════════════

Default to EDITORIAL/CAMPAIGN style (pure black, ALL-CAPS, hot pink accent, photo collages) for:
- Marketing slides, insight slides, campaign concepts, audience slides, content strategy

Default to 3D INFOGRAPHIC style (clean white or navy, isometric renders, glassmorphism, floating cards) for:
- Ecosystem slides, architecture slides, defensibility/moat slides, platform overviews, data dashboards

══════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING EACH PROMPT
══════════════════════════════════════════

Verify all are present:
- Background color has a stated reason
- Hot pink accent line is in the headline
- White italic subhead is present
- Main body describes at least one specific human moment with named emotion
- At least one piece of on-screen text quoted verbatim (when applicable)
- Stats paired with consequences
- Callouts specify color, border, and content
- Bottom strip has a thesis/verdict line

NEVER mention aspect ratio in the prompt text — aspect ratio is handled separately as an API parameter.
BANNED FOREVER — never use: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization". Always find a specific, real, directed visual concept.
If the user uploaded moodboard or reference images, explicitly describe which visual elements, colors, and mood from those references should carry into this specific slide.

ATTACH IMAGE CATEGORIES — for each slide set attach_image_categories:
- "moodboard" — attach moodboard references to slides where visual style guidance is needed
- "branding" — attach branding/logos/pack shots to slides where products or brand identity feature
- "all" — attach all uploaded images
- [] — attach nothing (e.g., pure text quote slides)`;

// Streaming compact plan — calls callbacks.onHeader(header) and callbacks.onSlide(slide)
// as each line arrives so the frontend can show rows immediately.
// Returns { header, slides } for backward-compatible use in runFullFlow.
export async function generateCompactPlan(message, attachments, userId = null, callbacks = {}) {
  const { onHeader, onSlide } = callbacks;

  if (MOCK_MODE) {
    await new Promise(r => setTimeout(r, 100));
    const mock = await mockChat([]);
    if (mock.slide_plan) {
      const { slides, ...headerFields } = mock.slide_plan;
      const header = { ...headerFields, message: mock.message };
      const cleanSlides = slides.map(({ nano_banana_prompt, attach_image_categories, image_prompt, ...rest }) => rest);
      onHeader?.(header);
      for (const s of cleanSlides) { await new Promise(r => setTimeout(r, 80)); onSlide?.(s); }
      return { header, slides: cleanSlides };
    }
    const header = { presentation_title: 'Demo', total_slides: 3, theme: 'modern-minimal', color_palette: {}, message: 'Here is your plan!' };
    onHeader?.(header);
    return { header, slides: [] };
  }

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_plan_gen', 'started', 0);

  const userContent = buildUserContent(message, attachments);
  const t0 = Date.now();
  logger.info('claude compact plan start', { messageLen: message.length });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 3000,
    system: COMPACT_PLAN_PROMPT,
    messages: [{ role: 'user', content: userContent }],
  });

  let buffer = '';
  let header = null;
  const slides = [];

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      buffer += event.delta.text;
      const { objects, remaining } = extractPrefixedObjects(buffer);
      buffer = remaining;

      for (const { prefix, jsonStr } of objects) {
        try {
          const parsed = parseJSON(jsonStr);
          if (prefix === 'HEADER:') {
            header = parsed;
            onHeader?.(header);
          } else if (prefix === 'SLIDE:') {
            slides.push(parsed);
            onSlide?.(parsed);
          }
        } catch (e) {
          logger.warn('compact plan parse error', { prefix, errorMessage: e.message });
        }
      }
    }
  }

  // Flush any remaining buffer
  if (buffer.trim()) {
    const { objects } = extractPrefixedObjects(buffer + '\n');
    for (const { prefix, jsonStr } of objects) {
      try {
        const parsed = parseJSON(jsonStr);
        if (prefix === 'HEADER:' && !header) { header = parsed; onHeader?.(header); }
        else if (prefix === 'SLIDE:') { slides.push(parsed); onSlide?.(parsed); }
      } catch {}
    }
  }

  const durationMs = Date.now() - t0;
  if (userId) {
    try {
      const finalMsg = await stream.finalMessage();
      recordTokenUsage(userId, finalMsg.usage?.input_tokens, finalMsg.usage?.output_tokens);
      metrics.recordAICall({ fn: 'generateCompactPlan', inputTokens: finalMsg.usage?.input_tokens, outputTokens: finalMsg.usage?.output_tokens, durationMs });
    } catch {}
  }
  logger.info('claude compact plan complete', { durationMs, totalSlides: slides.length });

  if (!header) {
    if (slides.length > 0) {
      // Claude streamed slides but no HEADER: — synthesize one so generation can continue
      header = {
        presentation_title: 'Untitled Presentation',
        total_slides: slides.length,
        theme: 'modern-minimal',
        color_palette: {},
        message: `Here are your ${slides.length} slides.`,
      };
      onHeader?.(header);
      logger.warn('compact plan: synthesized header from slides', { slideCount: slides.length });
    } else {
      tracer.recordStep(_tid, 'claude_plan_gen', 'failed', Date.now() - _t, 'Compact plan returned no header');
      throw new Error('Compact plan returned no header');
    }
  }
  tracer.recordStep(_tid, 'claude_plan_gen', 'completed', Date.now() - _t);
  return { header, slides };
}

export async function streamSlidePrompts(slides, header, message, attachments, callbacks, userId = null) {
  const { onPrompt } = callbacks;

  if (MOCK_MODE) {
    for (const slide of slides) {
      await new Promise(r => setTimeout(r, 250));
      onPrompt({ ...slide, nano_banana_prompt: slide.title, attach_image_categories: [] });
    }
    return;
  }

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_prompt_gen', 'started', 0);

  // Sort slides by index so position-based matching is deterministic
  const sortedSlides = [...slides].sort((a, b) => a.index - b.index);

  const outlineText = sortedSlides.map(s =>
    `Slide ${s.index} [${s.type}]: "${s.title}"${s.subtitle ? ` — ${s.subtitle}` : ''}. Key points: ${(s.key_points || []).join('; ')}`
  ).join('\n');

  const firstIdx = sortedSlides[0].index;
  const lastIdx  = sortedSlides[sortedSlides.length - 1].index;
  const isCoverIncluded = sortedSlides.some(s => s.index === 0 && s.type === 'cover');

  const promptMessage = `Generate nano_banana_prompts for ALL ${sortedSlides.length} slides (indices ${firstIdx} through ${lastIdx}).

OUTPUT REQUIREMENT: You MUST output exactly ${sortedSlides.length} SLIDE: lines — one per index from ${firstIdx} to ${lastIdx}, in order. The FIRST line must be SLIDE:{"index":${firstIdx},...}. Never skip any index.${
    isCoverIncluded
      ? `\n\nCOVER SLIDE (index 0): It has no key_points. Derive its entire visual concept from the Original Brief and presentation theme below. Same design language (black background, hot pink accent, neon green) as all other slides — no exceptions.`
      : ''
  }

Presentation: ${header.presentation_title}
Theme: ${header.theme}
Color palette: ${JSON.stringify(header.color_palette)}

Slide outline:
${outlineText}

Original brief: ${message}`;

  const userContent = buildUserContent(promptMessage, attachments);

  const t0 = Date.now();
  logger.info('claude prompt generation start', { slideCount: sortedSlides.length });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: PROMPT_GEN_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  let buffer = '';
  // Position-based mapping: the Nth SLIDE: output maps to the Nth slide in sorted order.
  // This is robust against Claude emitting wrong index numbers (e.g. starting at 1 instead of 0).
  let promptPosition = 0;

  function handleParsedPrompt(promptData) {
    // Map by position first; fall back to index-based lookup if position overflows
    const slide = sortedSlides[promptPosition] ?? sortedSlides.find(s => s.index === promptData.index) ?? {};
    promptPosition++;
    logger.debug('slide prompt generated', { position: promptPosition, claimedIndex: promptData.index, actualIndex: slide.index });
    onPrompt({
      ...slide,
      nano_banana_prompt: promptData.nano_banana_prompt,
      attach_image_categories: promptData.attach_image_categories ?? [],
    });
  }

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      buffer += event.delta.text;
      const { objects, remaining } = extractPrefixedObjects(buffer);
      buffer = remaining;

      for (const { prefix, jsonStr } of objects) {
        if (prefix === 'SLIDE:') {
          try {
            handleParsedPrompt(parseJSON(jsonStr));
          } catch (e) {
            logger.warn('failed to parse slide prompt', { errorMessage: e.message });
          }
        }
      }
    }
  }

  if (buffer.trim()) {
    const { objects } = extractPrefixedObjects(buffer + '\n');
    for (const { prefix, jsonStr } of objects) {
      if (prefix === 'SLIDE:') {
        try { handleParsedPrompt(parseJSON(jsonStr)); } catch {}
      }
    }
  }

  if (userId) {
    try {
      const finalMsg = await stream.finalMessage();
      recordTokenUsage(userId, finalMsg.usage?.input_tokens, finalMsg.usage?.output_tokens);
      metrics.recordAICall({ fn: 'streamSlidePrompts', inputTokens: finalMsg.usage?.input_tokens, outputTokens: finalMsg.usage?.output_tokens, durationMs: Date.now() - t0 });
    } catch {}
  }
  logger.info('claude prompt generation complete', { durationMs: Date.now() - t0 });
  tracer.recordStep(_tid, 'claude_prompt_gen', 'completed', Date.now() - _t);
}

// ─── Streaming system prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT_STREAM = `You are Nova. The user has provided their full brief with PREFLIGHT ANSWERS. Generate the complete presentation now.

Output format — CRITICAL. Output ONLY lines starting with HEADER: or SLIDE:. No other text, no markdown.

Line 1 must be:
HEADER:{"presentation_title":"...","total_slides":N,"theme":"modern-minimal|bold-gradient|corporate|creative|tech","color_palette":{"primary":"#hex","secondary":"#hex","accent":"#hex"},"message":"Your warm 1-sentence confirmation to the user"}

Then one line per slide:
SLIDE:{"index":0,"type":"cover|section|content|quote|data|image|conclusion","title":"...","subtitle":"...or null","key_points":["..."],"speaker_note":"...","nano_banana_prompt":"...250-300 word prompt per NANO BANANA FORMAT below...","attach_image_categories":["moodboard"|"branding"|"all"|[]]}

Rules:
- HEADER: must come first
- Each SLIDE: must be on its own line, complete parseable JSON
- total_slides in HEADER must equal the number of SLIDE: lines
- Choose total_slides based on what best serves the brief — typically 5–15 slides. Never pad, never truncate.
- nano_banana_prompt must be 250–600 words following the MANDATORY 5-LAYER STRUCTURE below

SLIDE STRUCTURE RULES (title format only — these do NOT affect nano_banana_prompt format):
- Every slide (EXCEPT cover/title slides at index 0) must have a KEY TAKEAWAY headline as its title. This headline must communicate the main point of that slide on its own — someone reading only the headlines should be able to follow the full story of the presentation.
- Below the headline in key_points, include supporting detail: data points, explanation, or context that expands on the headline.
- Cover and title slides (type "cover") keep their original format — do not force a key takeaway structure on them.

NOTE: The SLIDE STRUCTURE RULES above ONLY govern the slide title format. For nano_banana_prompt, the cover slide (index 0) follows the EXACT SAME 5-layer structure and design language as every other slide — same black/near-black background, same hot pink accent, same neon green details. No exceptions.

══════════════════════════════════════════
MANDATORY 5-LAYER STRUCTURE FOR EVERY PROMPT
══════════════════════════════════════════

APPLIES TO ALL SLIDES INCLUDING THE COVER (index 0). Every nano_banana_prompt must contain these layers in this order:

1. BACKGROUND
   State the exact color (with hex when relevant) AND one sentence on WHY this color serves the slide's mood.
   Examples: "pure black (#000000). Sparse. The scarcity is the design." / "warm near-black (#0A0A0A) — the color of a cabin at cruising altitude. Cozy. Contained."

2. TOP / HEADER
   - Bold white ALL-CAPS display type, broken into 2–3 short lines
   - The LAST line must be in HOT PINK (this is the brand accent — never skip it)
   - Followed by a subhead in WHITE ITALIC that reframes or sharpens the headline
   - No corporate filler. Headlines read like copywriter punchlines.

3. MAIN BODY
   Choose ONE format based on the slide's argument:

   A) SINGLE HERO PHOTOGRAPH — one cinematic image filling the center. Describe lighting, expression, what the subject is doing, what's visible on any screen within the image, and the moment just before something happens (anticipation > action).

   B) COLLAGE OF REAL MOMENTS — 4–8 overlapping candid images. Number each. For each: who is in it, what they're doing, their named emotional state, what's visible on their screen, what they're holding. Must feel unprompted and culturally specific.

   C) STRUCTURED COLUMNS OR GRID — 3–5 vertical sections separated by hairline neon green dividers. Each section gets: a logo/symbol, a large bold stat, a real photo collage, audience pills (rounded rectangles with emoji), a bottom text box. Internal structure must be consistent across sections.

   D) ISOMETRIC 3D RENDER — for ecosystem/architecture/data slides. Specify floors, rings, or pods. State materials (frosted glass, marble, metallic finish), lighting (soft ambient from top), color accents per layer, and what each element CONTAINS (icons, mini visuals, stat callouts).

   FOR THE COVER SLIDE (index 0): Use SINGLE HERO PHOTOGRAPH (a specific person, product, or moment that embodies the core concept of the full presentation brief) or ISOMETRIC 3D RENDER (for tech/platform decks). Derive the visual entirely from the full user brief — the cover must establish the SAME design language as all other slides in the deck.

4. CALLOUT CARDS
   Specify for each card: border color, background tint, internal text verbatim, emoji used, size relative to other elements.
   Common forms: hot pink rounded rectangles with emoji, dark green cards with neon green borders, prize badges with country flags, glassmorphism floating cards.

5. BOTTOM STRIP
   Full-width strip — dark green or pure black. One bold white centered line that delivers the slide's verdict. Optionally followed by a smaller neon green italic line that adds a second beat.
   The verdict line should land like a punchline: declarative, surprising, final.
   For cover slides: the verdict captures the CORE THESIS of the entire presentation.
   Examples of the register to aim for: "The most powerful marketing tool in Pakistan right now is a number going down." / "First mover doesn't just lead. First mover locks the market."

══════════════════════════════════════════
NON-NEGOTIABLE COLOR PALETTE
══════════════════════════════════════════

Default to this palette unless the user's brand explicitly requires otherwise:
- Pure black (#000000) — primary background for editorial slides
- Near-black (#0A0A0A) — when texture or grid is layered
- Hot pink — accent for the final headline line, callout borders, glowing accents
- Neon green — italic subtext, hairline dividers, pulsing indicators, audience pills
- Dark green — full-width bottom strips, callout box backgrounds
- White — primary type, photo borders
- Gold (#FFB800) — premium/lifestyle elements in 3D style only
- Frosted glass tints at 5–10% opacity — subtle warm purple, red-pink, red, yellow over near-black

For 3D infographic slides: pure white (#FFFFFF) base OR dark navy gradient (#0A0E1A to #1B4F9C), with electric green (#00FFA3) for digital accents.

This palette applies to ALL slides including the cover. Never deviate to "soft pastels", "warm atmospheric gradients", or "cinematic haze" on the cover — those are not in this palette.

══════════════════════════════════════════
QUALITY REQUIREMENTS — EVERY PROMPT MUST HAVE
══════════════════════════════════════════

- At least 3 sensory details (lighting, texture, expression, sound implication)
- At least 1 piece of visible on-screen text quoted verbatim when phones or screens appear (WhatsApp message, TikTok caption, view count, timestamp)
- At least 1 named human emotional state ("deeply confused," "pure anticipation," "completely losing it," "abandoned all pretense of working")
- Culturally specific markers relevant to the user's audience (specific cities, age groups, social rituals, slang)
- Every stat paired with a consequence (not "30M users" but what that number means for the argument)
- A moment of contradiction or surprise where possible

══════════════════════════════════════════
TYPOGRAPHY RULES
══════════════════════════════════════════

Always specify weight, case, color, and placement. Never write "use a nice font."
- Headlines: bold ALL-CAPS display type, condensed or extended
- Subheads: white italic, sentence case
- Callout titles: bold white
- Stats: large bold, white or gold
- Body inside cards: ~12pt, white or light grey

══════════════════════════════════════════
STYLE SELECTION
══════════════════════════════════════════

Default to EDITORIAL/CAMPAIGN style (pure black, ALL-CAPS, hot pink accent, photo collages) for:
- Marketing slides, insight slides, campaign concepts, audience slides, content strategy
- Cover slides for marketing/brand/campaign decks

Default to 3D INFOGRAPHIC style (clean white or navy, isometric renders, glassmorphism, floating cards) for:
- Ecosystem slides, architecture slides, defensibility/moat slides, platform overviews, data dashboards
- Cover slides for tech/product/platform decks

══════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING EACH PROMPT
══════════════════════════════════════════

Verify all are present:
- Background color has a stated reason
- Hot pink accent line is in the headline
- White italic subhead is present
- Main body describes at least one specific human moment with named emotion
- At least one piece of on-screen text quoted verbatim (when applicable)
- Stats paired with consequences
- Callouts specify color, border, and content
- Bottom strip has a thesis/verdict line

FOR COVER SLIDE SPECIFICALLY: Does this prompt look and feel like it belongs to the SAME DECK as the other slides? If it uses abstract gradients, atmospheric haze, or generic cinematic backgrounds — rewrite it. The cover must be as specific, editorial, and design-directed as any other slide.

NEVER mention aspect ratio in the prompt text — aspect ratio is handled separately as an API parameter.
BANNED FOREVER — never use: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization". Always find a specific, real, directed visual concept.
If the user uploaded moodboard or reference images, explicitly describe which visual elements, colors, and mood from those references should carry into this specific slide.

ATTACH IMAGE CATEGORIES — for each slide set attach_image_categories:
- "moodboard" — attach moodboard references to slides where visual style guidance is needed
- "branding" — attach branding/logos/pack shots to slides where products or brand identity feature
- "all" — attach all uploaded images
- [] — attach nothing (e.g., pure text quote slides)`;

export async function streamSlidePlan(message, attachments, callbacks, userId = null) {
  const { onHeader, onSlide } = callbacks;

  if (MOCK_MODE) {
    // Simulate streaming in mock mode
    const mock = await mockChat([]);
    if (mock.slide_plan) {
      const { slides, ...headerFields } = mock.slide_plan;
      await new Promise(r => setTimeout(r, 300));
      onHeader({ ...headerFields, message: mock.message });
      for (const slide of slides) {
        await new Promise(r => setTimeout(r, 200));
        onSlide(slide);
      }
    }
    return;
  }

  const userContent = buildUserContent(message, attachments);

  const t0 = Date.now();
  logger.info('claude slide plan stream start', { messageLen: message.length, attachments: attachments.length });

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system: SYSTEM_PROMPT_STREAM,
    messages: [{ role: 'user', content: userContent }],
  });

  let buffer = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      buffer += event.delta.text;
      const { objects, remaining } = extractPrefixedObjects(buffer);
      buffer = remaining;

      for (const { prefix, jsonStr } of objects) {
        if (prefix === 'HEADER:') {
          try {
            const header = parseJSON(jsonStr);
            logger.debug('slide plan header parsed', { title: header.presentation_title, totalSlides: header.total_slides });
            onHeader(header);
          } catch (e) {
            logger.warn('failed to parse slide plan header', { errorMessage: e.message });
          }
        } else {
          try {
            const slide = parseJSON(jsonStr);
            logger.debug('slide parsed', { index: slide.index, title: slide.title });
            onSlide(slide);
          } catch (e) {
            logger.warn('failed to parse slide', { errorMessage: e.message });
          }
        }
      }
    }
  }

  // Flush anything left in buffer after stream ends
  if (buffer.trim()) {
    const { objects } = extractPrefixedObjects(buffer + '\n');
    for (const { prefix, jsonStr } of objects) {
      try {
        if (prefix === 'SLIDE:') onSlide(parseJSON(jsonStr));
        else onHeader(parseJSON(jsonStr));
      } catch {}
    }
  }

  if (userId) {
    try {
      const finalMsg = await stream.finalMessage();
      recordTokenUsage(userId, finalMsg.usage?.input_tokens, finalMsg.usage?.output_tokens);
      metrics.recordAICall({ fn: 'streamSlidePlan', inputTokens: finalMsg.usage?.input_tokens, outputTokens: finalMsg.usage?.output_tokens, durationMs: Date.now() - t0 });
    } catch {}
  }
  logger.info('claude slide plan stream complete', { durationMs: Date.now() - t0 });
}

// ─── Suggest presentation title ──────────────────────────────────────────────

export async function suggestTitle(context, userId = null) {
  if (MOCK_MODE) return 'Untitled Presentation';

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_suggest_title', 'started', 0);

  const tTitle = Date.now();
  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 60,
    messages: [{
      role: 'user',
      content: `You are a presentation strategist. Based on this presentation context, suggest a sharp, compelling title — 4–7 words maximum. No subtitles, no punctuation at the end, no quotes.

Context:
${JSON.stringify(context, null, 2)}

Return only the title text, nothing else.`,
    }],
  });

  const durationMsTitle = Date.now() - tTitle;
  if (userId) {
    recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
    metrics.recordAICall({ fn: 'suggestTitle', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs: durationMsTitle });
  }
  logger.info('claude suggest title complete', { durationMs: durationMsTitle });

  tracer.recordStep(_tid, 'claude_suggest_title', 'completed', Date.now() - _t);
  return response.content[0].text.trim().replace(/^["']|["']$/g, '');
}

// ─── Stream new slides (add-slides feature) ──────────────────────────────────

const ADD_SLIDES_SYSTEM_PROMPT = `You are Nova, adding new slides to an existing presentation. The user has given you the full context of the existing deck plus a description of what new slides they want.

Output format — CRITICAL. Output ONLY lines starting with SLIDE:. No HEADER: line. No other text, no markdown, no commentary.

One line per new slide:
SLIDE:{"index":<N>,"type":"cover|section|content|quote|data|image|conclusion","title":"...","subtitle":"...or null","key_points":["..."],"speaker_note":"...","nano_banana_prompt":"...250-600 word prompt...","attach_image_categories":["moodboard"|"branding"|"all"|[]]}

Rules:
- Output EXACTLY the number of SLIDE: lines requested — not fewer, not more
- index values start from the provided startIndex and increment by 1
- The new slides must continue the story naturally from the existing slides
- Maintain the same visual style, theme, and tone as the existing deck
- Every slide except type "cover" must have a KEY TAKEAWAY headline as its title
- nano_banana_prompt must be 250–600 words following the MANDATORY 5-LAYER STRUCTURE below — same standard as the rest of the deck

══════════════════════════════════════════
MANDATORY 5-LAYER STRUCTURE FOR EVERY PROMPT
══════════════════════════════════════════

Every nano_banana_prompt must contain these layers in this order:

1. BACKGROUND
   State the exact color (with hex when relevant) AND one sentence on WHY this color serves the slide's mood.
   Examples: "pure black (#000000). Sparse. The scarcity is the design." / "warm near-black (#0A0A0A) — the color of a cabin at cruising altitude. Cozy. Contained."

2. TOP / HEADER
   - Bold white ALL-CAPS display type, broken into 2–3 short lines
   - The LAST line must be in HOT PINK (this is the brand accent — never skip it)
   - Followed by a subhead in WHITE ITALIC that reframes or sharpens the headline
   - No corporate filler. Headlines read like copywriter punchlines.

3. MAIN BODY
   Choose ONE format based on the slide's argument:

   A) SINGLE HERO PHOTOGRAPH — one cinematic image filling the center. Describe lighting, expression, what the subject is doing, what's visible on any screen within the image, and the moment just before something happens (anticipation > action).

   B) COLLAGE OF REAL MOMENTS — 4–8 overlapping candid images. Number each. For each: who is in it, what they're doing, their named emotional state, what's visible on their screen, what they're holding. Must feel unprompted and culturally specific.

   C) STRUCTURED COLUMNS OR GRID — 3–5 vertical sections separated by hairline neon green dividers. Each section gets: a logo/symbol, a large bold stat, a real photo collage, audience pills (rounded rectangles with emoji), a bottom text box. Internal structure must be consistent across sections.

   D) ISOMETRIC 3D RENDER — for ecosystem/architecture/data slides. Specify floors, rings, or pods. State materials (frosted glass, marble, metallic finish), lighting (soft ambient from top), color accents per layer, and what each element CONTAINS (icons, mini visuals, stat callouts).

4. CALLOUT CARDS
   Specify for each card: border color, background tint, internal text verbatim, emoji used, size relative to other elements.
   Common forms: hot pink rounded rectangles with emoji, dark green cards with neon green borders, prize badges with country flags, glassmorphism floating cards.

5. BOTTOM STRIP
   Full-width strip — dark green or pure black. One bold white centered line that delivers the slide's verdict. Optionally followed by a smaller neon green italic line that adds a second beat.
   The verdict line should land like a punchline: declarative, surprising, final.
   Examples: "The most powerful marketing tool in Pakistan right now is a number going down." / "First mover doesn't just lead. First mover locks the market."

══════════════════════════════════════════
NON-NEGOTIABLE COLOR PALETTE
══════════════════════════════════════════

Default to this palette unless the user's brand explicitly requires otherwise:
- Pure black (#000000) — primary background for editorial slides
- Near-black (#0A0A0A) — when texture or grid is layered
- Hot pink — accent for the final headline line, callout borders, glowing accents
- Neon green — italic subtext, hairline dividers, pulsing indicators, audience pills
- Dark green — full-width bottom strips, callout box backgrounds
- White — primary type, photo borders
- Gold (#FFB800) — premium/lifestyle elements in 3D style only

For 3D infographic slides: pure white (#FFFFFF) base OR dark navy gradient (#0A0E1A to #1B4F9C), with electric green (#00FFA3) for digital accents.

══════════════════════════════════════════
QUALITY REQUIREMENTS — EVERY PROMPT MUST HAVE
══════════════════════════════════════════

- At least 3 sensory details (lighting, texture, expression, sound implication)
- At least 1 piece of visible on-screen text quoted verbatim when phones or screens appear
- At least 1 named human emotional state ("deeply confused," "pure anticipation," "completely losing it")
- Culturally specific markers relevant to the user's audience (specific cities, age groups, social rituals)
- Every stat paired with a consequence (not "30M users" but what that number means for the argument)
- A moment of contradiction or surprise where possible

══════════════════════════════════════════
SELF-CHECK BEFORE OUTPUTTING EACH PROMPT
══════════════════════════════════════════

- Background color has a stated reason
- Hot pink accent line is in the headline
- White italic subhead is present
- Main body describes at least one specific human moment with named emotion
- Callouts specify color, border, and content verbatim
- Bottom strip has a thesis/verdict line

NEVER mention aspect ratio in the prompt text.
BANNED FOREVER: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization".
If moodboard/reference images are in context, explicitly describe which visual elements carry into this slide.`;

// ─── Targeted single-slide prompt (fallback for any slide missed by the stream) ─
// Plain-text output — no JSON parsing required, eliminating the failure mode
// where a long prose prompt with embedded quotes/apostrophes breaks jsonrepair.

const SINGLE_SLIDE_PROMPT_SYSTEM = `You are Nova. Generate a nano_banana_prompt for one presentation slide.

Output ONLY the visual prompt as plain prose — 250 to 600 words. No JSON, no markdown, no labels, no "SLIDE:", no bullet points — just the prompt text itself.

The prompt MUST follow the MANDATORY 5-LAYER STRUCTURE in this order:

1. BACKGROUND — state exact color (hex when relevant) and one sentence on WHY it serves the mood.
2. TOP / HEADER — bold white ALL-CAPS display type, 2–3 short lines, LAST line in HOT PINK, followed by a WHITE ITALIC subhead.
3. MAIN BODY — choose ONE: A) SINGLE HERO PHOTOGRAPH, B) COLLAGE OF REAL MOMENTS, C) STRUCTURED COLUMNS/GRID, D) ISOMETRIC 3D RENDER. Describe every detail.
4. CALLOUT CARDS — for each: border color, background tint, verbatim text, emoji, size.
5. BOTTOM STRIP — full-width dark green or black strip with a bold white verdict line, optionally a neon green italic second beat.

NON-NEGOTIABLE PALETTE: pure black (#000000) backgrounds, hot pink accents, neon green dividers/subtext, white type.

QUALITY: include at least 3 sensory details, 1 verbatim on-screen text (when phones/screens appear), 1 named human emotional state, culturally specific markers, stats paired with consequences.

BANNED FOREVER: "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization", "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart".`;

export async function generateSingleSlidePrompt(slide, header, originalBrief, attachments = [], userId = null) {
  if (MOCK_MODE) {
    return { nano_banana_prompt: slide.title, attach_image_categories: ['moodboard'] };
  }

  const coverNote = (slide.index === 0 || slide.type === 'cover')
    ? '\nCOVER SLIDE: No key_points exist — derive the entire visual concept from the Original Brief and presentation theme. Must use black/near-black background, hot pink accent, neon green design language. Use SINGLE HERO PHOTOGRAPH or ISOMETRIC 3D RENDER for the main body. Absolutely no abstract gradients or atmospheric haze.'
    : '';

  const slideContext = [
    `Presentation: "${header.presentation_title}"`,
    `Theme: ${header.theme}`,
    `Color palette: ${JSON.stringify(header.color_palette)}`,
    ``,
    `Slide index: ${slide.index}`,
    `Type: ${slide.type}`,
    `Title: "${slide.title}"`,
    slide.subtitle  ? `Subtitle: "${slide.subtitle}"` : null,
    slide.key_points?.length ? `Key points: ${slide.key_points.join(' | ')}` : null,
    coverNote,
    ``,
    `Original brief: ${originalBrief}`,
  ].filter(Boolean).join('\n');

  const userContent = buildUserContent(slideContext, attachments.slice(0, 3));

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();

  logger.info('generating targeted single-slide prompt', { slideIndex: slide.index, type: slide.type });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    system: SINGLE_SLIDE_PROMPT_SYSTEM,
    messages: [{ role: 'user', content: userContent }],
  });

  if (userId) {
    try {
      recordTokenUsage(userId, response.usage?.input_tokens, response.usage?.output_tokens);
      metrics.recordAICall({ fn: 'generateSingleSlidePrompt', inputTokens: response.usage?.input_tokens, outputTokens: response.usage?.output_tokens, durationMs: Date.now() - _t });
    } catch {}
  }

  const promptText = response.content[0].text.trim();
  logger.info('targeted single-slide prompt complete', { slideIndex: slide.index, promptLength: promptText.length });

  return {
    nano_banana_prompt: promptText,
    attach_image_categories: attachments.length > 0 ? ['moodboard'] : [],
  };
}

export async function streamNewSlides(description, count, startIndex, presentationContext, onSlide, userId = null) {
  const isAuto = count === null || count === 'auto';

  if (MOCK_MODE) {
    const n = isAuto ? 2 : count;
    for (let i = 0; i < n; i++) {
      await new Promise(r => setTimeout(r, 500));
      onSlide({
        index: startIndex + i,
        type: 'content',
        title: `New Slide ${startIndex + i + 1}`,
        subtitle: null,
        key_points: [],
        speaker_note: '',
        nano_banana_prompt: 'Additional slide',
        attach_image_categories: [],
      });
    }
    return;
  }

  const countInstruction = isAuto
    ? `Generate however many slides (1–6) are genuinely needed to do this topic justice. Do NOT add padding slides. Quality over quantity.`
    : `Generate exactly ${count} new slide(s).`;

  const message = `EXISTING PRESENTATION CONTEXT:
${JSON.stringify(presentationContext, null, 2)}

USER REQUEST: ${description}

${countInstruction} Start index at ${startIndex}.`;

  const _tid = requestContext.getStore()?.requestId;
  const _t = Date.now();
  tracer.recordStep(_tid, 'claude_new_slides', 'started', 0);

  logger.info('claude add-slides stream start', { count, startIndex });
  const tSlides = Date.now();

  const stream = client.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: ADD_SLIDES_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: message }],
  });

  let buffer = '';

  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') {
      buffer += event.delta.text;
      const { objects, remaining } = extractPrefixedObjects(buffer);
      buffer = remaining;

      for (const { prefix, jsonStr } of objects) {
        if (prefix === 'SLIDE:') {
          try {
            const slide = parseJSON(jsonStr);
            logger.debug('new slide parsed', { index: slide.index, title: slide.title });
            onSlide(slide);
          } catch (e) {
            logger.warn('failed to parse new slide', { errorMessage: e.message });
          }
        }
      }
    }
  }

  if (buffer.trim()) {
    const { objects } = extractPrefixedObjects(buffer + '\n');
    for (const { prefix, jsonStr } of objects) {
      if (prefix === 'SLIDE:') {
        try { onSlide(parseJSON(jsonStr)); } catch {}
      }
    }
  }

  if (userId) {
    try {
      const finalMsg = await stream.finalMessage();
      recordTokenUsage(userId, finalMsg.usage?.input_tokens, finalMsg.usage?.output_tokens);
      metrics.recordAICall({ fn: 'streamNewSlides', inputTokens: finalMsg.usage?.input_tokens, outputTokens: finalMsg.usage?.output_tokens, durationMs: Date.now() - tSlides });
    } catch {}
  }
  logger.info('claude add-slides stream complete', { durationMs: Date.now() - tSlides });
  tracer.recordStep(_tid, 'claude_new_slides', 'completed', Date.now() - _t);
}
