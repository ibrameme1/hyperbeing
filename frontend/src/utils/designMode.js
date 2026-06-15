// Mirrors backend/config/credits.js DESIGN_IMAGE_* costs and limits.
// Keep these in sync with the backend — they're duplicated here purely for
// instant UI feedback (the backend is always the source of truth for billing).
export const DESIGN_CREDIT_COSTS = {
  own: 15,
  nova: 18,
};

export const DESIGN_MAX_IMAGES_PER_BATCH = 4;
export const DESIGN_MAX_PARALLEL_GENERATIONS = 8;
