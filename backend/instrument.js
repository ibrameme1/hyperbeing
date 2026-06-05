import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: 'https://25dc5be5131f54430a492eba1aa3e2fc@o4511511665836032.ingest.us.sentry.io/4511511675142144',
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.1 : 1.0,
  environment: process.env.NODE_ENV || 'development',
});
