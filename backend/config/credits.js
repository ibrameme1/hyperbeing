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
};

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
