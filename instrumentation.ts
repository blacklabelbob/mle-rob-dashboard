/**
 * Server + edge observability init. Next.js runs this once per runtime, before
 * anything else. Silent no-op when NEXT_PUBLIC_SENTRY_DSN is unset.
 */
import * as Sentry from "@sentry/nextjs";

import {
  ENVIRONMENT,
  RELEASE,
  SENTRY_DSN,
  SENTRY_ENABLED,
  TRACES_SAMPLE_RATE,
  scrub,
  scrubUrl,
} from "@/lib/observability/config";

export async function register() {
  if (!SENTRY_ENABLED) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    // The dashboard is public and unauthenticated by Rob's standing decision, so
    // there is no user to attach — and attaching request IPs to CRM errors would
    // create a record we do not want in a third-party tool.
    sendDefaultPii: false,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      if (event.request?.query_string) delete event.request.query_string;
      if (event.request?.data) event.request.data = scrub(event.request.data) as never;
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },
  });
}

/** Next.js calls this for uncaught server-side request errors. */
export const onRequestError = Sentry.captureRequestError;
