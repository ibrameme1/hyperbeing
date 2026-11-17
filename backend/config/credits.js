// ─── Single source of truth for the credit economy ─────────────────────────
// Every credit deduction anywhere in the codebase must reference these
// constants. Do not hardcode credit amounts elsewhere.

export const CREDIT_COSTS = {
  PER_SLIDE: 18,                  // generation: per final slide from Claude
  SLIDES_ADD_PER_SLIDE: 18,        // add-slides: per slide added
  SLIDE_EDIT_TIER_1: 5,            // slide edit, under monthly threshold
  SLIDE_EDIT_TIER_2: 15,           // slide edit, at/over monthly threshold
  REFERENCE_IMAGE_PER_SLIDE: 0,    // surcharge per slide with a reference image attached — disabled
  EXPORT: 0,                       // exporting a presentation is always free
  PROMPT_CHAT_MESSAGE: 0,          // prompt-generator conversational turn — disabled
  DESIGN_IMAGE_OWN_PROMPT: 15,     // design mode: per image when the user supplies their own prompt
  DESIGN_IMAGE_NOVA_PROMPT: 18,    // design mode: per image when Nova crafts the prompt
};

// Design mode (images AND video) is a Pro/Ultra feature. Basic and Free don't
// see it in the UI and every generation route refuses them (403 PLAN_REQUIRED).
// Admins always pass. The frontend reads this via the subscription payload
// (`can_use_design_mode`), never a copy of this list.
export const DESIGN_MODE_PLANS = ['pro', 'ultra1', 'ultra2', 'ultra3', 'ultra4'];
export const DESIGN_MODE_MIN_PLAN = 'pro';

export function canUseDesignMode(planKey) {
  return DESIGN_MODE_PLANS.includes(planKey);
}

// Design mode: maximum number of generations that can be in-flight
// (status pending/generating) at once for a single user.
export const DESIGN_MAX_PARALLEL_GENERATIONS = 8;

// Design mode: how many images a user can request per generation batch.
export const DESIGN_MAX_IMAGES_PER_BATCH = 4;

// Number of edits a user can make this month at TIER_1 pricing before
// every subsequent edit costs TIER_2. Keyed by plan.
export const EDIT_TIER_THRESHOLDS = {
  free:   0,
  basic:  20,
  pro:    80,
  ultra1: 200,
  ultra2: 300,
  ultra3: 400,
  ultra4: 450,
};

// Monthly credit allocation per plan.
export const PLAN_CREDITS = {
  free:   54,                     // 3 slides * PER_SLIDE — caps a new user's first deck at 3 slides
  basic:  1200,
  pro:    3200,
  ultra1: 8000,
  ultra2: 11200,
  ultra3: 14400,
  ultra4: 16000,
};

// Ordered ladder used to walk "up" from a plan to find the cheapest plan
// whose monthly allocation covers a given credit cost.
export const PLAN_LADDER = ['free', 'basic', 'pro', 'ultra1', 'ultra2', 'ultra3', 'ultra4'];

export function getEditTierThreshold(planKey) {
  return EDIT_TIER_THRESHOLDS[planKey] ?? EDIT_TIER_THRESHOLDS.free;
}

// Walk up the plan ladder from currentPlan and return the first plan whose
// monthly credit allocation covers creditsNeeded. Falls back to the top plan.
// NOTE: this deliberately compares the plan's FULL monthly allocation against
// the incremental shortfall (not the user's would-be remaining balance) — the
// upsell message is "this plan's monthly credits cover what you're missing",
// which is simple and always true at the next reset. Don't "fix" it to
// subtract current usage without also changing the upgrade copy.
export function suggestPlanForCost(currentPlan, creditsNeeded) {
  const startIdx = Math.max(PLAN_LADDER.indexOf(currentPlan), 0);
  for (let i = startIdx + 1; i < PLAN_LADDER.length; i++) {
    const planKey = PLAN_LADDER[i];
    if (PLAN_CREDITS[planKey] >= creditsNeeded) return planKey;
  }
  return PLAN_LADDER[PLAN_LADDER.length - 1];
}

// Standard 402 payload for any action blocked by insufficient credits.
// "Cute Nova" copy — shown by the frontend as an OutOfCreditsModal-style prompt.
export function novaInsufficientCredits({ creditsRemaining, creditsNeeded, actionType, currentPlan }) {
  return {
    error: "omg i can't do that right now — you're out of credits! upgrade your plan and i'll get right back to it 🥺",
    nova: true,
    code: 'INSUFFICIENT_CREDITS',
    credits_remaining: creditsRemaining,
    credits_needed: creditsNeeded,
    action_type: actionType,
    current_plan: currentPlan,
    suggested_plan: suggestPlanForCost(currentPlan, creditsNeeded),
    upgrade_url: '/pricing',
  };
}

// ─── Design mode: video (Seedance via BytePlus ModelArk) ───────────────────
// Video is billed PER SECOND OF OUTPUT, priced by model × resolution. The
// provider bills tokens = width × height × 24fps × seconds / 1024, so cost is
// linear in seconds and ~flat across aspect ratios at a given resolution.
//
// Credit prices target ≥2× gross margin at the CHEAPEST revenue per credit we
// sell (Ultra 4 annual: $209 / 16,000 ≈ $0.0131/credit), ≈3.2× on Basic
// monthly ($0.0208/credit). Provider $/s at 16:9 (BytePlus list, 2026-11):
//   Seedance 2.5        480p $0.104  720p $0.231  1080p $0.569
//   Seedance 2.5 Flash  480p $0.068  720p $0.151
//   Seedance 2.0        480p $0.068  720p $0.151  1080p $0.374
//   Seedance 2.0 Fast   480p $0.054  720p $0.121
//   Seedance 2.0 Mini   480p $0.034  720p $0.076
// Audio is not billed separately by the provider, so it costs no extra credits.
// If BytePlus changes prices, change these numbers — never the formula.
export const DESIGN_VIDEO_MODELS = {
  'seedance-2.5': {
    label: 'Seedance 2.5',
    description: 'Best quality, longest clips',
    creditsPerSecond: { '480p': 16, '720p': 36, '1080p': 88 },
    minDuration: 4, maxDuration: 30,
    maxReferenceImages: 4,
  },
  'seedance-2.5-flash': {
    label: 'Seedance 2.5 Flash',
    description: 'Fast drafts, up to 720p',
    creditsPerSecond: { '480p': 12, '720p': 24 },
    minDuration: 4, maxDuration: 30,
    maxReferenceImages: 4,
  },
  'seedance-2.0': {
    label: 'Seedance 2.0',
    description: 'High quality, up to 15s',
    creditsPerSecond: { '480p': 12, '720p': 24, '1080p': 58 },
    minDuration: 4, maxDuration: 15,
    maxReferenceImages: 4,
  },
  'seedance-2.0-fast': {
    label: 'Seedance 2.0 Fast',
    description: 'Quicker and cheaper, up to 720p',
    creditsPerSecond: { '480p': 9, '720p': 19 },
    minDuration: 4, maxDuration: 15,
    maxReferenceImages: 4,
  },
  'seedance-2.0-mini': {
    label: 'Seedance 2.0 Mini',
    description: 'Cheapest, good for previews',
    creditsPerSecond: { '480p': 6, '720p': 12 },
    minDuration: 4, maxDuration: 15,
    maxReferenceImages: 4,
  },
};

export const DESIGN_VIDEO_DEFAULT_MODEL = 'seedance-2.0';
export const DESIGN_VIDEO_RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', 'adaptive'];
// How attached images are used: start frame, start + end frames, or free
// references (Seedance "omni reference"). The provider refuses mixing them.
export const DESIGN_VIDEO_IMAGE_ROLES = ['first_frame', 'first_last', 'reference'];

// Videos take minutes, so they get their own (smaller) in-flight cap and do
// not consume the 8-image cap above.
export const DESIGN_MAX_PARALLEL_VIDEOS = 3;

// Credits for one clip, or null when the model/resolution combo doesn't exist.
export function videoCreditCost(modelKey, resolution, durationSeconds) {
  const perSecond = DESIGN_VIDEO_MODELS[modelKey]?.creditsPerSecond?.[resolution];
  if (!perSecond || !Number.isInteger(durationSeconds) || durationSeconds <= 0) return null;
  return perSecond * durationSeconds;
}
