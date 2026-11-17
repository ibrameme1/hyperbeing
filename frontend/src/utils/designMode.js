// Mirrors backend/config/credits.js DESIGN_IMAGE_* costs and limits.
// Keep these in sync with the backend — they're duplicated here purely for
// instant UI feedback (the backend is always the source of truth for billing).
export const DESIGN_CREDIT_COSTS = {
  own: 15,
  nova: 18,
};

export const DESIGN_MAX_IMAGES_PER_BATCH = 4;
export const DESIGN_MAX_PARALLEL_GENERATIONS = 8;

// Video pricing/limits are NOT duplicated here — the composer loads them from
// GET /api/design/video/options (backend config/credits.js) so they can't drift.
export function estimateVideoCredits(options, settings) {
  const model = options?.models?.find(m => m.key === settings.model);
  const perSecond = model?.creditsPerSecond?.[settings.resolution];
  return perSecond ? perSecond * settings.duration : null;
}

// Clamp settings to what the chosen model supports (after a model switch).
export function normalizeVideoSettings(options, settings) {
  const model = options?.models?.find(m => m.key === settings.model) || options?.models?.[0];
  if (!model) return settings;
  const resolution = model.resolutions.includes(settings.resolution)
    ? settings.resolution
    : (model.resolutions.includes('720p') ? '720p' : model.resolutions[model.resolutions.length - 1]);
  const duration = Math.min(model.maxDuration, Math.max(model.minDuration, settings.duration));
  return { ...settings, model: model.key, resolution, duration };
}

export const VIDEO_IMAGE_ROLE_LABELS = {
  reference: 'References',
  first_frame: 'Start frame',
  first_last: 'Start + end',
};
