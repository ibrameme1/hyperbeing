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
