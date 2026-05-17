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
    },
    {
      index: 1,
      type: 'section',
      title: 'The Landscape Today',
      subtitle: 'Where we are in 2025',
      key_points: [],
      speaker_note: 'Set the stage before diving into opportunities.',
      image_prompt: 'Dark teal to blue gradient with geometric shapes',
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
    },
    {
      index: 5,
      type: 'quote',
      title: "AI is not a technology trend — it's a fundamental shift in how we operate.",
      subtitle: 'Satya Nadella, CEO Microsoft',
      key_points: [],
      speaker_note: 'Let the quote breathe. Silence is powerful here.',
      image_prompt: 'Deep purple to magenta atmospheric gradient',
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
    },
    {
      index: 8,
      type: 'image',
      title: 'The Competitive Advantage Window Is Now',
      subtitle: 'First movers are establishing moats that will be hard to close',
      key_points: [],
      speaker_note: 'Create urgency — without fear. This is opportunity, not threat.',
      image_prompt: 'Rich gold to amber gradient, cinematic light',
    },
    {
      index: 9,
      type: 'conclusion',
      title: 'Start Your AI Journey Today',
      subtitle: "The best time to start was yesterday. The second best time is now.",
      key_points: [],
      speaker_note: 'End with conviction. Invite questions with confidence.',
      image_prompt: 'Deep purple to blue hopeful gradient, light rays',
    },
  ],
};

async function mockChat(history) {
  await new Promise(r => setTimeout(r, 600)); // simulate thinking
  const userTurns = history.filter(m => m.role === 'user').length;

  if (userTurns === 0) {
    return {
      message: `Great brief! I love the direction. To make sure I build you exactly the right deck, three quick questions:\n\n1. **Who's in the room?** (e.g. investors, C-suite, clients, internal team)\n2. **What's the main tone?** (bold & punchy, clean & corporate, creative & vibrant)\n3. **Any brand colours or visual references** I should work with?`,
      state: 'gathering_info',
      slide_plan: null,
    };
  }

  return {
    message: `Perfect — I have everything I need. I'm building you a **10-slide deck** with a modern-minimal aesthetic:\n\n✦ Powerful cover with your core message\n✦ Market context & key challenges\n✦ Three strategic use cases\n✦ A standout quote slide\n✦ ROI data & roadmap\n✦ Strong CTA close\n\nGenerating your visuals now — sit tight! 🚀`,
    state: 'ready',
    slide_plan: DEMO_SLIDE_PLAN,
  };
}

async function mockRegenerateSlide(slide, instruction) {
  await new Promise(r => setTimeout(r, 800));
  return {
    ...slide,
    title: slide.title,
    subtitle: `Updated: ${instruction.slice(0, 40)}…`,
    key_points: slide.key_points,
    image_prompt: `${slide.image_prompt}, updated style`,
  };
}

// ─── Real mode ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Nova, an expert presentation designer and creative director at HyperBeing. Your job is to help users build stunning, professional presentations.

Your personality:
- Warm, insightful, and concise — like a brilliant creative partner
- Ask smart targeted questions (2-3 max at a time, never more)
- Think like a top McKinsey consultant combined with an Apple designer
- Always focused on the audience, the message, and the impact

Your workflow:
1. Analyse the user's brief (they may share text, images, logos, files)
2. If you need key details, ask focused clarifying questions
3. Once you have enough — create a complete slide plan

You ALWAYS respond with VALID JSON in EXACTLY this format:

{
  "message": "Your warm, helpful message to the user (markdown OK)",
  "state": "gathering_info" | "ready",
  "slide_plan": null
}

When state is "ready", set slide_plan to:
{
  "presentation_title": "Title",
  "total_slides": <number 5-20>,
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
      "title": "Slide title",
      "subtitle": "Optional subtitle or tagline",
      "key_points": ["point one", "point two"],
      "speaker_note": "What to say here",
      "image_prompt": "Detailed Imagen background prompt"
    }
  ]
}

Image prompt guidelines (for slide backgrounds — NO text in the image):
- Always specify: "professional presentation background, 16:9 widescreen, no text, no UI elements"
- Be specific about: mood, color palette, subject matter, style
- Good examples:
  - "Abstract flowing neural network data streams, deep navy and electric gold, dark futuristic background, photorealistic 4K"
  - "Modern geometric office space, aerial view, warm golden hour light, glass and steel architecture, editorial photography"

CRITICAL RULES:
1. Always return valid JSON — nothing outside the JSON object
2. Never make up facts about the user's business — only use what they provide
3. When state = "ready", slide_plan MUST be fully populated with all slides
4. image_prompt must NEVER contain text/words to display on screen
5. key_points should be punchy bullet points (≤ 12 words each)`;

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
The image_prompt should describe a NEW background image that reflects the requested changes.
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
