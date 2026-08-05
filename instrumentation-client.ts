/**
 * Browser observability init — Sentry for errors, PostHog for product analytics.
 * Both silent no-ops until their key is present.
 */
import * as Sentry from "@sentry/nextjs";
import posthog from "posthog-js";

import {
  ENVIRONMENT,
  POSTHOG_ENABLED,
  POSTHOG_HOST,
  POSTHOG_KEY,
  RELEASE,
  SENTRY_DSN,
  SENTRY_ENABLED,
  TRACES_SAMPLE_RATE,
  scrub,
  scrubUrl,
} from "@/lib/observability/config";

if (SENTRY_ENABLED) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: ENVIRONMENT,
    release: RELEASE,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    sendDefaultPii: false,
    // Session Replay deliberately OFF: it would record real client names, phone
    // numbers and deal values off the screen and store them with a third party.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend(event) {
      if (event.request?.url) event.request.url = scrubUrl(event.request.url);
      if (event.extra) event.extra = scrub(event.extra) as Record<string, unknown>;
      return event;
    },
  });
}

if (POSTHOG_ENABLED) {
  posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    // Which SCREENS get used, never what is on them. Autocapture would hoover up
    // the text of every element it sees — on this app that is the client list.
    autocapture: false,
    capture_pageview: true,
    capture_pageleave: true,
    disable_session_recording: true,
    person_profiles: "never",
    sanitize_properties: (props) => scrub(props) as Record<string, unknown>,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
