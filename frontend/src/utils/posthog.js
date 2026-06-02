import posthog from 'posthog-js';

export function initPostHog() {
  const key = import.meta.env.VITE_POSTHOG_KEY;
  if (!key) return;
  posthog.init(key, {
    api_host: import.meta.env.VITE_POSTHOG_HOST || 'https://us.i.posthog.com',
    capture_pageview: false,
    capture_pageleave: false,
    session_recording: {
      maskAllInputs: false,
      maskTextSelector: '[data-ph-mask]',
    },
  });
}

export function identifyUser(user) {
  if (!user?.id) return;
  posthog.identify(String(user.id), { email: user.email, name: user.name });
}

export function resetPostHog() {
  posthog.reset();
}

export function capture(event, properties = {}) {
  posthog.capture(event, properties);
}
