// Content for the landing page. Kept apart from the component so the page,
// its FAQ structured data and the prerender all read one source of truth.
//
// Slide images live in /public/landing/{slides,thumbs}/sNN.webp. Every frame is
// a real HyperBeing slide. s19 and s36 were removed on purpose (a real
// competitor brand, and a co-branded beauty concept); s20 was re-rendered
// with a fictional competitor ("Kestrel") and new numbers. Don't bring the
// originals back.

export const thumb = (id) => `/landing/thumbs/${id}.webp`;
export const full = (id) => `/landing/slides/${id}.webp`;

// Descriptive alt text: these images carry most of the page's meaning, so
// crawlers and screen readers get a sentence for each.
export const SLIDE_ALT = {
  s01: "Strategy slide: Pakistanis don't lack fuel stations, they lack a reason to come back",
  s02: 'Isometric city map of fuel stations with market share callouts',
  s03: 'Isometric cutaway of a fuel station reimagined as a community stop',
  s04: 'Five-layer loyalty program drawn as a building cutaway',
  s05: 'Cultural insight slide: every rider fuels more than a vehicle',
  s06: 'Campaign slide: launched at 30,000 feet, passengers celebrating on a flight',
  s07: 'Campaign slide: visa officers came to you, with phone story frames',
  s08: 'Retail activation slide: queues forming in a supermarket aisle',
  s09: 'Campaign slide: limited flavor nationalities app mockup',
  s10: 'Broadcast takeover slide: the whole country watches cricket',
  s11: 'Concept slide: sky interventions with phone video mockups',
  s12: 'Creator challenge slide: two strips, one blindfold',
  s13: 'Campus pop-up slide: students around a vending machine',
  s14: 'Creator series slide: an Italian chef reacts on camera',
  s15: 'Product key visual: passengers celebrating with noodle packs',
  s16: 'Cinematic slide: awareness without access is just a missed sale at scale',
  s17: 'Cinematic slide: a strategist in front of a wall map, same routes 2015 to 2024',
  s18: 'Isometric before and after slide: same team, different outcome',
  s20: 'Data slide: Kestrel is outreaching us town by town, with map, bar chart and retail photos',
  s21: 'Cinematic slide: the average professional spends 4 hours building one deck',
  s22: 'Bar chart slide: AI has eaten every productivity category except one',
  s23: 'Product slide: the HyperBeing studio building an investor deck',
  s24: 'Metaphor slide: every category has fallen, one has not',
  s25: 'Heatmap slide: the enterprise stack is cold, presentations still burning',
  s26: "Area chart slide: the gap doesn't close itself",
  s27: 'Newspaper slide: every disruption has been reported except this one',
  s28: 'Three phone screens: place, participation, proof',
  s29: 'Press coverage slide: magazine covers and campaign reach numbers',
  s30: 'Case study slide: the sauce brand that became a noodle brand',
  s31: 'Teaser slide: a split-flap board reading September',
  s32: 'Product hero slide: hot gochujang noodles',
  s33: 'Retail key visual: four destinations, one aisle, as boarding passes',
  s34: 'Product key visual: global flavors, back bigger',
  s35: "Culture slide: don't chase the culture, be in it",
  s37: 'Street campaign slide: the flavor challenge in a busy market',
  s38: 'Comparison slide: Gen Z creators versus traditional fuel',
  s39: 'Cinematic slide: distribution trucks, every month of delay is a month they embed',
  s40: 'UGC slide: what about the other 150 people on the flight',
  s41: 'Storyboard slide: 25 seconds, three beats',
};

export const ALL = Object.keys(SLIDE_ALT);

export const WALL = ['s16', 's09', 's33', 's04', 's18', 's29', 's10', 's37', 's40', 's32', 's03', 's31', 's07', 's25', 's38', 's12', 's27', 's05', 's20', 's34', 's14', 's28', 's01', 's39', 's30'];

export const CASE = [
  ['s06', 'The launch'], ['s09', 'Scarcity mechanic'], ['s07', 'Field activation'], ['s08', 'Retail moment'],
  ['s14', 'Creator series'], ['s13', 'Campus pop-up'], ['s41', 'On-flight UGC'], ['s10', 'Broadcast takeover'],
  ['s28', 'Three-screen strategy'], ['s29', 'Press coverage'], ['s33', 'Retail key visual'], ['s32', 'Product hero'],
];

export const RANGE = {
  'Campaign storytelling': { ids: ['s07', 's06', 's11', 's12', 's39', 's40', 's10'], note: 'Campaign pitches with characters, UGC mockups, phone frames and press layouts, composed for each slide.' },
  'Strategy & data': { ids: ['s20', 's18', 's22', 's26', 's25', 's27', 's23'], note: 'Board and consulting decks where charts, maps and callouts are drawn to the numbers in your brief.' },
  'Systems & explainers': { ids: ['s04', 's03', 's02', 's01', 's05', 's38', 's28'], note: 'Isometric cutaways and illustrated systems that turn a five-layer strategy into something people remember.' },
  'Product & launch': { ids: ['s32', 's33', 's37', 's30', 's15', 's29', 's35'], note: 'Key visuals, packaging and launch slides with the polish of a print ad.' },
  'Cinematic metaphor': { ids: ['s16', 's31', 's17', 's21', 's24', 's34', 's18'], note: 'Single-image argument slides. One frame, one idea, no bullet points.' },
};

export const STUDIO_SLIDES = [
  ['s21', 'The 4-hour deck'], ['s22', 'AI ate every category'], ['s24', 'Except one'],
  ['s25', 'The cold stack'], ['s26', 'The gap'], ['s23', 'The product'],
];

// Mirrors Pricing.jsx (the checkout page) and backend config/credits.js.
// 18 credits per slide, so a five-slide deck is 90 credits.
export const CREDITS_PER_DECK = 90;
export const FREE_CREDITS = 54;

export const PLANS = [
  {
    key: 'basic', name: 'Basic', for: 'For first-time AI presentation makers',
    monthly: 25, discount: 0.2, credits: 1200,
    features: ['Standard speed', '3 slides in parallel', 'PowerPoint, PDF & PNG export', 'Add slides & reference image uploads', 'Email support'],
  },
  {
    key: 'pro', name: 'Pro', for: 'For people who present every week', popular: true,
    monthly: 65, discount: 0.2, credits: 3200,
    features: ['Everything in Basic', 'Fast generation', '6 slides in parallel', 'Design Mode: AI images & video', 'Early feature access', 'Priority support'],
  },
];

export const ULTRA_TIERS = [
  { credits: 8000, price: 149, annualDiscount: 0.22 },
  { credits: 11200, price: 209, annualDiscount: 0.25 },
  { credits: 14400, price: 269, annualDiscount: 0.28 },
  { credits: 16000, price: 299, annualDiscount: 0.30 },
];

export const ULTRA_FEATURES = ['Everything in Pro', 'Fastest generation', 'Unlimited parallel generation', 'Custom brand kits', 'Team workspace (soon)', 'Dedicated support'];

// Visible FAQ and FAQPage JSON-LD are generated from this list, so they can
// never drift apart.
export const FAQ = [
  {
    q: 'What does HyperBeing do?',
    a: 'HyperBeing is an AI presentation maker that builds fully designed decks from a written brief. Nova, its AI art director, reads the entire brief, proposes a slide plan, then composes every slide from scratch: generated imagery plus real, editable text, charts and shapes, instead of filling in a template.',
  },
  {
    q: 'How is it different from Gamma or Canva?',
    a: "It holds large context. You can hand it a long, messy brief, PDFs, spreadsheets or an old deck, and it keeps the full thread instead of collapsing it into a generic layout. It also adapts the deck's style to your industry and audience, so a fintech board update and a fashion launch don't come out looking the same.",
  },
  {
    q: 'How much does HyperBeing cost?',
    a: 'Plans range from $25/month (Basic) to $299/month (Ultra 4) on monthly billing. Annual billing lowers the cost, from $20/month for Basic to $209/month for Ultra 4. New accounts get 54 free credits, enough for a first 3-slide deck, with no card required.',
  },
  {
    q: 'How long does a deck take?',
    a: 'A typical deck takes 5 to 10 minutes from brief to finished slides, depending on length and detail. None of that time is manual design work.',
  },
  {
    q: "What's the difference between Ultra 1 and Ultra 4?",
    a: 'Only the monthly credits: 8,000, 11,200, 14,400 or 16,000. The bigger the credit level, the bigger the annual discount, from 22% up to 30%.',
  },
  {
    q: 'What can I export to?',
    a: 'PowerPoint (.pptx) with native, editable text boxes, charts and pictures, plus PDF and PNG. Exporting is always free.',
  },
  {
    q: 'Can I edit the slides after they are generated?',
    a: 'Yes. Text, shapes, charts and icons are real objects you can edit directly in HyperBeing or in PowerPoint after export. You can also ask Nova to change a slide in plain language.',
  },
  {
    q: 'Do I need design experience?',
    a: 'No. You write or paste the brief, Nova builds the deck.',
  },
  {
    q: 'Do you serve companies outside the United States?',
    a: 'Yes. HyperBeing is a web app available worldwide, with no location restrictions.',
  },
];

// What Nova says as the visitor scrolls. Keys match data-nova on sections.
export const NOVA_LINES = {
  hero: "Hi, I'm <b>Nova</b>. I turn messy briefs into decks people remember.",
  marquee: 'Every frame here is a real slide I made. <b>Tap one</b> to see it big.',
  wall: 'No clip art, no templates. I compose <b>every slide from scratch</b>.',
  studio: 'Watch me work: brief, plan, slides, <b>export</b>.',
  work: 'A whole campaign, told in pictures. <b>Keep scrolling</b>.',
  range: 'Board update or launch party? I change <b>register</b> to fit.',
  compare: '<b>Drag the line.</b> Same facts, very different slide.',
  numbers: 'Four hours a deck? <b>Not on my watch.</b>',
  features: 'Text, charts and shapes stay <b>editable</b> after I am done.',
  pricing: `Start free: <b>${FREE_CREDITS} credits</b> covers your first 3 slides, on me.`,
  faq: 'Anything else? The answers are right here.',
  cta: "Ready? Let's make your <b>first deck</b> together.",
};
