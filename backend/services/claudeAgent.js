import Anthropic from '@anthropic-ai/sdk';

const MOCK_MODE = !process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === 'demo';

let client;
if (!MOCK_MODE) {
  client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
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

Once you have enough context — stop asking and generate the full slide plan.

CRITICAL: You ALWAYS respond with VALID JSON in EXACTLY this format:

{
  "message": "Your warm conversational message to the user (markdown OK)",
  "state": "gathering_info" | "ready",
  "slide_plan": null
}

When state is "ready", set slide_plan to:
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
Each nano_banana_prompt must be richly detailed and include:
- What this slide is about and its role in the story
- The exact visual mood, energy, and atmosphere
- Specific imagery, objects, or scenes to show
- Layout direction (e.g., hero image left, text space right; full-bleed background; etc.)
- Colour palette direction
- Style keywords (cinematic, editorial, minimalist, bold, etc.)
- Relevant visual elements (icons, textures, patterns, product visuals if relevant)
- Always end every prompt with: "Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present."

ATTACH IMAGE CATEGORIES — for each slide set attach_image_categories:
- "moodboard" — attach moodboard references to slides where visual style guidance is needed
- "branding" — attach branding/logos/pack shots to slides where products or brand identity feature
- "all" — attach all uploaded images
- [] — attach nothing (e.g., pure text quote slides)

CRITICAL RULES:
1. Always return valid JSON — nothing outside the JSON object
2. Never make up facts about the user's business — only use what they provide
3. When state = "ready", slide_plan MUST be fully populated with ALL slides
4. nano_banana_prompt must be detailed (100-200 words per slide)
5. key_points ≤ 12 words each
6. total_slides: use the user's number if specified; otherwise decide intelligently (typically 5-12 slides)`;

// ─── Exports ────────────────────────────────────────────────────────────────

export async function chat(conversationHistory, userMessage, attachments = []) {
  if (MOCK_MODE) return mockChat(conversationHistory);

  const userContent = buildUserContent(userMessage, attachments);
  const messages = [
    ...conversationHistory.map(m => ({ role: m.role, content: buildHistoryContent(m) })),
    { role: 'user', content: userContent },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  try {
    return JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return { message: raw, state: 'gathering_info', slide_plan: null };
  }
}

export async function regenerateSlide(slide, instruction, presentationContext) {
  if (MOCK_MODE) return mockRegenerateSlide(slide, instruction);

  const slideInfo = { ...slide };
  delete slideInfo.image_data; // exclude base64 from JSON text block

  const content = [];

  // Attach the current slide image so Claude can see the existing visual
  if (slide.image_data) {
    content.push({ type: 'text', text: '[CURRENT SLIDE IMAGE — the visual you are updating:]' });
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: 'image/png',
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
The nano_banana_prompt should describe a NEW background image that reflects the requested changes — richly detailed, 100-200 words, ending with: "Create a highly engaging, premium, presentation-ready slide. Use attached reference images wherever applicable. Follow the visual style, layout energy, and design language of the provided references. Make the slide feel professionally designed, visually rich, clear, and easy to present."
Return ONLY the JSON object, nothing else.`,
  });

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content }],
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  try {
    return JSON.parse(jsonText);
  } catch {
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
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
