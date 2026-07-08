export const SERVICE_PAGES = {
  'marketing-decks': {
    title: 'Marketing Decks',
    metaDescription: 'AI-generated marketing decks for campaign pitches, brand reviews, and quarterly reports. Built from your brief in 5-10 minutes.',
    intro: 'HyperBeing turns a marketing brief into a fully designed deck, so your team spends time on the campaign strategy instead of formatting slides.',
    whatItIs: [
      "A marketing deck from HyperBeing is generated from a written brief rather than a template. You describe the campaign, the brand, the audience, and the goal of the deck, and HyperBeing reads the full brief before building a slide plan.",
      "Each slide is produced as an art-directed image rather than text dropped into a fixed layout, so the visual style can shift with the brand instead of looking the same as every other deck built on the platform.",
      "A typical brief includes the campaign objective, target audience, key messaging, any performance data from a past campaign, and the tone of the brand. HyperBeing uses that context to decide how the deck should look, not just what it should say, so a consumer brand deck and a B2B SaaS deck come out visually distinct.",
    ],
    whoItsFor: {
      lead: 'Marketing decks on HyperBeing are built for people who pitch or report on marketing work, not for generic slide-making.',
      items: [
        'In-house marketers presenting a campaign plan to leadership',
        'Agencies pitching a campaign concept to a client',
        'Brand managers building quarterly performance reviews',
        'Growth and demand-gen teams presenting channel strategy',
      ],
    },
    pricing: [
      'Individual marketers and small teams typically use Basic ($25/month, or $20/month billed annually) or Pro ($65/month, or $52/month billed annually).',
      'Agencies and marketing teams producing decks for multiple clients or campaigns tend to use one of the four Ultra tiers ($149-$299/month, or $116-$209/month billed annually), which cover higher deck volume.',
    ],
    timing: 'A marketing deck typically takes 5 to 10 minutes to generate, from submitting the brief to a finished, exportable deck. Generation time scales with slide count and how detailed the brief is.',
    whatsIncluded: [
      'A slide plan you approve before visuals are generated, so structure is locked in before any image rendering happens',
      'Fully art-directed slide images generated per slide, not a shared template with swapped text',
      'Export to PowerPoint (.pptx), PDF, or a shareable link',
      'Style that adapts to your brand or industry rather than a single generic look',
    ],
    process: [
      'Write or paste your marketing brief: campaign goal, audience, brand context, and any data you want included.',
      'HyperBeing reads the full brief and proposes a slide-by-slide structure.',
      'You review and approve the structure before any visuals are generated.',
      'Each slide is generated as an art-directed image based on the approved structure.',
      'Export the finished deck as PowerPoint, PDF, or a shareable link.',
    ],
    faq: [
      {
        q: 'How much does a marketing deck cost to generate?',
        a: "Cost depends on your plan, not on a per-deck fee. Basic starts at $25/month ($20/month billed annually) and covers individual use; agencies producing higher volumes typically use an Ultra tier, which range from $149 to $299/month ($116-$209/month billed annually).",
      },
      {
        q: 'How long does it take to generate a marketing deck?',
        a: 'Most marketing decks take 5 to 10 minutes from brief to finished slides. Longer decks with more slides take longer than short ones.',
      },
      {
        q: 'What information should I include in a marketing brief?',
        a: 'Include the campaign goal, target audience, brand or product context, and any performance data you want shown. The more specific the brief, the more specific the resulting deck.',
      },
      {
        q: 'Can I use this for a client-facing agency pitch?',
        a: "Yes. Agencies use HyperBeing for client-facing marketing pitches. The deck's visual style adapts to the brand described in the brief instead of applying one fixed template.",
      },
      {
        q: 'What file formats can I export a marketing deck to?',
        a: 'Marketing decks export as PowerPoint (.pptx), PDF, or a shareable link, the same as every deck generated on HyperBeing.',
      },
      {
        q: 'Can I edit individual slides after the deck is generated?',
        a: 'Yes. Once a deck is generated you can regenerate or edit the prompt behind any individual slide without redoing the whole deck.',
      },
    ],
    related: ['consulting-decks'],
  },

  'consulting-decks': {
    title: 'Consulting Decks',
    metaDescription: 'AI-generated consulting decks for client engagements, strategy reviews, and pitch documents. Handles long, detailed briefs without losing the narrative.',
    intro: 'HyperBeing generates consulting decks from a full engagement brief, keeping the narrative and data intact instead of flattening it into a generic template.',
    whatItIs: [
      "Consulting work usually starts with a long, messy brief: client background, data points, frameworks, and a narrative argument that has to hold together across dozens of slides. HyperBeing reads that entire brief before generating a slide plan, instead of processing it in fragments.",
      'Each slide is generated as its own art-directed image, so a market-sizing slide, a framework slide, and a recommendation slide can each carry the specific visual treatment they need rather than sharing one static layout.',
      "A typical consulting brief includes the client's industry, the business question being answered, supporting data, and the recommendation you're building toward. HyperBeing uses that context to decide how much of the deck should be framework-driven versus data-driven, rather than forcing every consulting deck into the same slide sequence.",
    ],
    whoItsFor: {
      lead: 'Consulting decks on HyperBeing are built for people producing client-facing or internal strategy documents under time pressure.',
      items: [
        'Independent consultants building client deliverables',
        'Strategy teams inside corporates preparing board or leadership decks',
        'Case teams turning research and data into a client-ready narrative',
        'Analysts producing recurring strategy or performance reviews',
      ],
    },
    pricing: [
      'Individual consultants typically use Basic ($25/month, or $20/month billed annually) or Pro ($65/month, or $52/month billed annually).',
      'Consulting teams producing decks for multiple clients or engagements at once tend to use one of the four Ultra tiers ($149-$299/month, or $116-$209/month billed annually).',
    ],
    timing: 'A consulting deck typically takes 5 to 10 minutes to generate. Longer engagement decks with more slides and more source material take longer than a short internal update.',
    whatsIncluded: [
      'Large-context brief handling, so a long client brief keeps its detail instead of being condensed into a generic outline',
      'A slide plan you approve before any visuals are generated',
      'Fully art-directed slide images generated per slide',
      'Export to PowerPoint (.pptx), PDF, or a shareable link',
    ],
    process: [
      'Write or paste your engagement brief: client context, data, frameworks, and the argument you want the deck to make.',
      'HyperBeing reads the full brief and proposes a slide-by-slide structure.',
      'You review and approve the structure before any visuals are generated.',
      'Each slide is generated as an art-directed image based on the approved structure.',
      'Export the finished deck as PowerPoint, PDF, or a shareable link.',
    ],
    faq: [
      {
        q: 'How much does a consulting deck cost to generate?',
        a: 'Cost is based on your monthly or annual plan, not a per-deck fee. Basic starts at $25/month ($20/month billed annually); teams producing higher volumes across multiple engagements typically use an Ultra tier, from $149 to $299/month ($116-$209/month billed annually).',
      },
      {
        q: 'How long does it take to generate a consulting deck?',
        a: 'Most consulting decks take 5 to 10 minutes from brief to finished slides, depending on deck length and how much source material is in the brief.',
      },
      {
        q: 'Can HyperBeing handle a long, detailed client brief without losing information?',
        a: 'Yes. Large-context handling is the core feature: HyperBeing reads the entire brief before building a slide plan, so specific data points and structure from a long brief carry through instead of getting collapsed into a generic template.',
      },
      {
        q: 'Who typically uses HyperBeing for consulting decks?',
        a: 'Independent consultants, in-house strategy teams, case teams, and analysts producing client-facing or internal strategy decks under deadline.',
      },
      {
        q: 'What file formats can I export a consulting deck to?',
        a: 'Consulting decks export as PowerPoint (.pptx), PDF, or a shareable link, the same as every deck generated on HyperBeing.',
      },
      {
        q: 'Can I edit individual slides after the deck is generated?',
        a: 'Yes. Once a deck is generated you can regenerate or edit the prompt behind any individual slide without redoing the whole deck.',
      },
    ],
    related: ['marketing-decks'],
  },
};
