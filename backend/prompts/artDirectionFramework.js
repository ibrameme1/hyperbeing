// Shared art-direction framework injected into every Nova system prompt that
// generates `nano_banana_prompt` text. Keeping this in one place means the
// visual system (background logic, typography, color, composition patterns,
// mood registers, slide-type mapping, anti-patterns) stays consistent across
// chat, two-phase generation, streaming, single-slide, and regeneration flows.

export const ART_DIRECTION_FRAMEWORK = `══════════════════════════════════════════
ART DIRECTION FRAMEWORK — APPLIES TO EVERY nano_banana_prompt
══════════════════════════════════════════

CORE PHILOSOPHY
- Each prompt is a full creative brief for a senior art director: background, composition, lighting, mood, typography, color palette, key visual elements, and emotional register — all specified.
- The visual must carry the slide's argument on its own. If all text were removed, the image should still communicate the point.
- Empty space is a choice, not a failure. One dominant element on a near-empty background often beats a crowded slide. Add an element only if it earns its place.
- Every strong slide has a contrast axis (old vs. new, problem vs. solution, small vs. massive, dead vs. alive). Find the contrast in this slide's message and make it visceral.

BACKGROUND — choose deliberately, never leave ambiguous
- BLACK (pure black #000000 / near-black #0A0A0A / warm near-black): bold claims, dramatic reveals, paradigm shifts, collage + neon accents, electric/urgent/raw tone.
- WHITE (#FFFFFF with a subtle radial gradient to light grey, or a warm gradient to gold): strategic frameworks, ecosystem maps, premium Apple-keynote feel, 3D or frosted-glass hero elements, precise/trustworthy tone.
- BRAND / NAVY (dark navy gradient #0A0E1A → #1B4F9C, or near-black with a faint brand-colored texture ghosted at ~8% opacity): flagship, immersive, branded statements.
- TEXTURED: ghost textures at 6–10% opacity (language characters, grid lines, urban texture, digital noise) for atmosphere without literal imagery — never let texture compete with foreground elements.
- Vary backgrounds across the deck on purpose for breathing room (e.g. black → white → black → white). Keep whatever rhythm gets established — don't make every slide identical.

TYPOGRAPHY
- Always specify position (top-left / top-center / bottom strip), weight (bold / condensed / italic), size (enormous / large / 12–14pt), case, and color. Never write "use a nice font."
- Dark-background headline: bold white ALL-CAPS, broken into 2–3 short lines. The LAST line carries the deck's primary accent color.
- Maximum ONE accent color per headline block — never two accents in the same block.
- Supporting copy: white italic, smaller size — creates rhythm and softens the headline.
- Bottom strip: full-width container in the deck's container/secondary color, bold white centered text — the slide's thesis, the "so what."
- Pull quotes and callouts: accent-colored border or rounded rectangle — specific and functional, never decorative filler.

COLOR SYSTEM & BRAND INHERITANCE
- Default roles on a black background: white (primary type), hot pink (accent 1 — urgency, the most important line, callout borders), neon green (accent 2 — data, proof, metrics, hairline dividers), dark green (container / bottom strip), gold #FFB800 (premium or financial value, 3D style only).
- Default roles on a white background: brand primary color (primary accent), gold (secondary / premium), frosted glass (structural), light accent tints per section.
- If the user supplied brand colors, ALWAYS apply them: the brand's primary color takes the "accent 1" role and the brand's secondary color takes the "container / bottom strip" role — on every slide, including the cover.
- Maximum 2 accent colors per slide. A third accent color is visual noise.
- Once an accent color is established on slide 1, every later slide uses it too — never switch accent colors mid-deck unless it intentionally signals a section break.

COMPOSITION PATTERNS — pick the ONE that serves this slide's argument
1. Dominant Center — one enormous visual element fills the frame; text and callouts are peripheral. Use for product reveals, hero moments, single powerful statistics.
2. Left/Right Split — left = problem / context / comparison, right = solution / transformation / proof. Use for before/after, brand vs. competitor, insight vs. action.
3. Collage Scatter — 4–8 overlapping real-world images or phone screens at angles, raw and candid, like content dumped on a table. Use for UGC, social proof, many simultaneous behaviors.
4. Column Grid — 3–5 equal vertical columns with hairline dividers, one category per column. Use for platform comparisons, competitor maps, multi-channel strategies.
5. Concentric Rings / Ecosystem Map — rings viewed from above at a slight isometric angle, core product at center, each ring a layer of value or defense. Use for loyalty ecosystems, defensibility arguments, platform architecture.
6. Isometric 3D World — a rendered environment (city grid, building cross-section, retail aisle, chessboard) at an isometric angle where the world itself tells the story. Use for distribution maps, ecosystem metaphors, competitive landscape.
7. Data Hero — one large professional (McKinsey-style) chart fills ~70% of the slide, minimal annotation, one bold callout. Use for business cases, growth stories, ROI arguments.
8. Orbiting Feature Map — a central hero (product, phone mockups) surrounded by feature pods (max 8) in a circular arrangement, everything connecting back to center. Use for full product/platform overviews.

PHOTOGRAPHIC REALISM
- Describe real moments, never stock photography: "a real cinematic photograph of…", "a real phone screen showing…" — never "a graphic of" or "an illustration of."
- Make it feel candid and unprompted: visible read receipts, timestamps, view counts, UI chrome, captions quoted verbatim word-for-word.
- Ground every photo in specific cultural context relevant to the audience — city, age group, platform (WhatsApp / TikTok / Instagram / Snapchat UI shown explicitly), clothing, social ritual, and a named emotional state ("deeply confused," "pure anticipation," "completely losing it," "abandoned all pretense of working").
- Use a single hero photograph when one moment carries the whole insight; use a collage when the point is "this is everywhere."

3D RENDERING (ecosystem maps, product renders, isometric architecture)
- Always specify all four: rendering quality ("Octane Render quality", "Unreal Engine 5 Lumen lighting", "4K photorealistic, Apple-keynote aesthetic"), materials ("frosted glass at 70% transparency", "polished marble", "soft metallic finish", "warm amber-gold"), lighting ("soft ambient from top", "dramatic rim lighting", "single pendant spotlight", "cool blue ambient fill on secondary elements"), and depth/camera ("each layer slightly elevated with soft shadows and clear z-axis separation", "isometric 30–45°", "top-down isometric", "cutaway/cross-section").
- Never write "3D render" without specifying material, lighting, AND camera angle — undefined specs produce undefined output.

CALLOUT BOXES & ANNOTATIONS
- Accent-colored callout box, top-right corner, bold white text inside — for "the thing nobody was told."
- Full-width bottom strip in the container color, one bold white centered line — the thesis / "so what."
- Secondary-accent annotation — a floating metric, category label, or proof point.
- Frosted-glass card (left or right of the main visual) — timeline, stat breakdown, or numbered list.
- Destination/prize card — one flag emoji + location + category, for aspirational or competitive slides.
- Every statistic needs a visual container (chart, pill, or callout box) AND a stated consequence — a floating number with no container disappears.

MOOD & EMOTIONAL REGISTER — name it, then build every element to serve it
- Electric / Urgent: pure black, hot pink accent, condensed ALL-CAPS, chaotic collage, neon light.
- Cinematic / Aspirational: dramatic warm photography, single large image, italic supporting copy.
- Strategic / Analytical: white background, professional chart, clean annotation, minimal 3D.
- Warm / Human / Emotional: natural photography, warm tones, white-gold palette, real human faces in context.
- Futuristic / Tech-forward: dark navy, electric green (#00FFA3), frosted glass, holographic UI, clean 3D.
- Raw / Cultural / Social: scattered phones, real screenshots, Gen Z platform UI, organic chaos.
- Premium / Exclusive: Apple aesthetic, white base, gold accents, frosted glass, minimal copy.
- Satirical / Attention-grabbing: clickbait aesthetics applied to real objects, in-joke formatting, self-aware captions.

SLIDE-TYPE → PATTERN MAPPING
- Cover / Title: dominant center or left-aligned hero, black or deep brand color, one large visual element, minimal text, bottom-strip thesis.
- Problem: black/dark for drama, "what is vs. what should be" contrast, real photography of the pain point, accent color on the most uncomfortable truth, callout isolating the tension.
- Insight / "Aha": the visual IS the insight — one dominant composition, single clear contrast, italic subtext carries the nuance, no charts.
- Market Opportunity: isometric world OR column grid, large stats in accent color on a dark background that gives them room to breathe, audience-insight pills (rounded rectangles with emoji).
- Product / Platform Overview: white Apple aesthetic, orbiting feature map or center phone mockups, max 8 feature pods, consistent color-coded icon style.
- Competitive Advantage / Moat: concentric rings on white, competitors as small figures bouncing off the rings, side info panels with timeline and proof points, bottom flow diagram showing the self-reinforcing engine.
- Social Proof / UGC: collage scatter of real phones/screenshots with platform UI visible (likes, read receipts), raw and overlapping like it's already happening, accent callout ("NONE OF THIS WAS DIRECTED"), bottom-strip culture-defining one-liner.
- Data / Business Case: McKinsey-style chart at ~70% of slide on white, annotation marker at the transformation point, bold callout bubble at the endpoint, three-column Decision / Method / Result strip below.
- Ecosystem Map: isometric 3D render (city, cross-section, or map), each zone color-coded and labeled, overhead callout annotations floating with arrows, full-width statements top and bottom.
- Activation / Campaign: black background, electric energy, show the mechanics visually (journey flow, card stack, QR codes in context), real-world photography of the activation in place, bottom-strip thesis on what this achieves at scale.
- Emotional / Cultural: warm background or pure photography, authentic human faces in real moments (not stock energy), 3D transformation elements where useful, copy that names what people feel rather than what they do.

PROMPT STRUCTURE — write every nano_banana_prompt in this sequence
[BACKGROUND]: color/texture/mood, and why that choice serves this slide.
[TYPOGRAPHY — TOP]: position, weight, case, color, and exact headline text; state which line carries the accent color; describe any italic subtext below it.
[MAIN VISUAL]: the composition pattern, the primary visual element, its position, lighting, camera angle, mood, and realistic details (timestamps, UI chrome, captions, read receipts) that make it feel real.
[SECONDARY ELEMENTS]: any additional elements — stacked cards, column grids, collage phones, feature pods — each with position, style, content, and color.
[CALLOUT BOX(ES)]: accent-colored, positioned, and worded verbatim.
[BOTTOM STRIP]: full-width strip color + text color + the thesis statement; optional smaller sub-line in the second accent color.
[MOOD/RENDER STYLE]: one closing line naming the aesthetic, rendering quality, and emotional register.

ANTI-PATTERNS — never write
- Generic stock-photo language: "business people in a meeting," "person using laptop," "team collaborating in office," "happy team in an office," "modern technology background," "handshake," "cityscape at night"
- Vague backgrounds: "a clean background" or "neutral tones" — always specify color/texture
- Unnamed colors: "a dark color" or "light accents" — use hex codes or precise names
- Floating statistics with no container or stated consequence
- Centered text + stock image + logo — "Canva template energy"
- Three or more accent colors on one slide
- Symmetric layouts without a reason (symmetry should be earned — concentric rings for ecosystems, columns for comparisons)
- "3D render" without material, lighting, and camera angle specified
- BANNED FOREVER: "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization"

CONTEXT INHERITANCE ACROSS THE DECK
- Accent color(s) established on slide 1 carry through every later slide.
- Background rhythm: alternate intentionally (e.g. black → white → black → white) for visual breathing room — don't repeat the same background on every slide.
- Typography treatment (case, weight, where the accent color lands) stays consistent deck-wide once established.
- The bottom-strip pattern, once established, becomes a design-system element — keep using it.
- Brand colors (if provided) map to the accent/container roles on every slide, including the cover — never revert to the default palette mid-deck.

FINAL CHECK before outputting each prompt
- Background is explicitly specified (color/texture + the reason it serves the mood)
- Typography specifies position, weight, case, color, and content — and one line carries the accent color
- Main visual has a composition pattern, lighting, camera angle, and named mood
- The slide's core argument reads from the image alone, even with no text
- A bottom strip or dominant callout carries the thesis line
- The mood/render style is named in the closing line
- No generic, vague, or stock-photo language anywhere in the prompt
- At least 3 sensory details; at least 1 verbatim on-screen text where phones/screens appear; at least 1 named human emotional state; culturally specific markers; every stat paired with a consequence`;

// Condensed version for single-slide / regeneration prompts where token budget is tighter.
export const ART_DIRECTION_COMPACT = `ART DIRECTION RULES — apply to this prompt:
- BACKGROUND: state the exact color/texture (hex when relevant) and why it serves the slide's mood. Black/near-black for bold/urgent/electric slides, white (with subtle gradient) for strategic/premium/3D slides, dark navy or brand color for flagship branded statements.
- TYPOGRAPHY: specify position, weight, case, color, and exact text. Bold white ALL-CAPS headline (2–3 lines), last line in the deck's primary accent color (max 1 accent per block), white italic subtext below.
- COMPOSITION: pick ONE pattern that fits the argument — dominant center hero, left/right split (problem vs. solution), collage scatter of real phones/photos, column grid, concentric rings/ecosystem map, isometric 3D world, data-hero chart, or orbiting feature map (max 8 pods). For 3D, specify material + lighting + camera angle.
- PHOTOGRAPHY: real cinematic photography or real phone screens, never illustrations or stock photos. Include verbatim on-screen text (captions, timestamps, read receipts) and a named human emotion ("pure anticipation," "deeply confused").
- CALLOUTS: accent-colored box, border, or pill — verbatim text, positioned, sized.
- BOTTOM STRIP: full-width container color with one bold white centered thesis line — the "so what."
- MOOD: name the aesthetic and emotional register in one closing line.
- COLOR: if brand colors are provided, brand primary = accent, brand secondary = container/strip color; otherwise default to hot pink (accent 1), neon green (accent 2), dark green (container), white (type). Max 2 accents.
- NEVER: vague backgrounds, unnamed colors, floating stats without consequence, 3+ accents, "3D render" without material/lighting/camera, or any of: "business people in a meeting", "person using laptop", "team collaborating in office", "cityscape at night", "handshake", "growth chart", "abstract gradient background", "glowing orbs", "geometric shapes floating", "neural network visualization".`;
