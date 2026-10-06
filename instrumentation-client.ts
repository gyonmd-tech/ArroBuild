import * as Sentry from "@sentry/nextjs";

// Next.js loads this file in the browser (replaces the legacy sentry.client.config.ts).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

Sentry.init({
  dsn,
  tracesSampleRate: 0.1,
  enabled: Boolean(dsn),
  environment: process.env.NODE_ENV,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
