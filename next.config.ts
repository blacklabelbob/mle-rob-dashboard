import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// The runtime SDK stays inert until NEXT_PUBLIC_SENTRY_DSN is set (see
// lib/observability/config.ts), and without SENTRY_AUTH_TOKEN this wrapper simply
// skips source-map upload — so an unconfigured build behaves exactly as it did
// before Sentry was added.
export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  // Browser error reports tunnel through our own origin. Ad blockers block
  // sentry.io outright, and they would silently swallow exactly the errors this
  // was added to catch.
  tunnelRoute: "/monitoring",
  // `disableLogger` was deprecated in @sentry/nextjs 10; this is its replacement.
  // Strips Sentry's own debug logging from the production bundle.
  webpack: { treeshake: { removeDebugLogging: true } },
});
