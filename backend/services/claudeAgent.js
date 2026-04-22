import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

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
- Be specific: mood, colors, subject, style
- Always append: "professional presentation background, 16:9 widescreen, no text, no UI, ultra high resolution"
- Good examples:
  - "Abstract flowing neural network data streams, deep navy and electric gold, dark futuristic background, photorealistic 4K"
  - "Minimalist corporate office aerial view, warm golden hour light, glass and steel architecture, editorial photography"
  - "Bold geometric gradient shapes, electric blue to deep purple, modern tech aesthetic, ultra clean, 4K"
  - "Lush rainforest canopy from above, vibrant green, sustainability theme, cinematic aerial photography"

Information you want to gather (not all at once):
- Topic / core message of the presentation
- Target audience (executives, clients, investors, students, team…)
- Purpose (pitch, inform, inspire, train, update, sell…)
- Tone (bold, formal, casual, minimal, creative, playful…)
- Key takeaways (what should the audience remember?)
- Approximate length (if not stated, default to 10–14 slides)
- Industry or department
- Any brand colours, logo, or visual reference

CRITICAL RULES:
1. Always return valid JSON — nothing outside the JSON object
2. Never make up facts about the user's business — only use what they provide
3. When state = "ready", slide_plan MUST be fully populated with all slides
4. image_prompt must NEVER contain text/words to display on screen
5. key_points should be punchy bullet points (≤ 12 words each)`;

export async function chat(conversationHistory, userMessage, attachments = []) {
  const userContent = buildUserContent(userMessage, attachments);

  const messages = [
    ...conversationHistory.map(m => ({
      role: m.role,
      content: buildHistoryContent(m),
    })),
    { role: 'user', content: userContent },
  ];

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages,
  });

  const raw = response.content[0].text.trim();

  // Strip markdown code fences if Claude wraps the JSON
  const jsonText = raw.startsWith('```')
    ? raw.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '')
    : raw;

  try {
    return JSON.parse(jsonText);
  } catch {
    // Fallback: extract JSON from the text
    const match = jsonText.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return {
      message: raw,
      state: 'gathering_info',
      slide_plan: null,
    };
  }
}

export async function regenerateSlide(slide, instruction, presentationContext) {
  const prompt = `You are Nova, an expert presentation designer.

A user wants to update one specific slide in their presentation.

Presentation context:
${JSON.stringify(presentationContext, null, 2)}

Current slide:
${JSON.stringify(slide, null, 2)}

User's change instruction:
"${instruction}"

Please return an updated slide object as valid JSON with the same structure.
Only modify fields relevant to the instruction.
The image_prompt MUST describe a visual background (no text in the image).

Return ONLY the JSON object, nothing else.`;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
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
  if (!attachments || attachments.length === 0) {
    return text;
  }

  const parts = [{ type: 'text', text }];
  for (const att of attachments) {
    if (att.type === 'image' && att.data) {
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
