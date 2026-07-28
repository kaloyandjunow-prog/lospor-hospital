import * as Sentry from "@sentry/nextjs"

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  // Sample 10% of traces in production; adjust up as load is understood.
  tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
  // Send errors always; reduce to < 1.0 once stable.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
  enabled: process.env.NODE_ENV === "production",
})
