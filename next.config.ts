import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  /* config options here */
};

// Sentry's wrapper is safe to apply unconditionally: without SENTRY_AUTH_TOKEN it
// simply skips source-map upload. The runtime SDK stays inert until a DSN is set
// (see lib/observability/config.ts), so an unconfigured build behaves exactly as
// it did before this was added.
export default withSentryConfig(nextConfig, {
  silent: !process.env.CI,
  // Route browser error reports through our own origin so ad blockers — which
  // block sentry.io outright — cannot silently swallow the errors we added this
  // for in the first place.
  tunnelRoute: "/monitoring",
  disableLogger: true,
  widenClientFileUpload: true,
});
