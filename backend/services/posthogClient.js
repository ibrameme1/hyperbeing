import { PostHog } from 'posthog-node';

let _client = null;

export function getPostHog() {
  if (!_client && process.env.POSTHOG_API_KEY) {
    _client = new PostHog(process.env.POSTHOG_API_KEY, {
      host: process.env.POSTHOG_HOST || 'https://us.i.posthog.com',
    });
  }
  return _client;
}
