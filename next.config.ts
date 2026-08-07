import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // pdf.js must be require()d from node_modules at runtime, not pulled through
  // the bundler. Bundling it drops the assets its legacy build resolves
  // relatively, so `import("pdfjs-dist/legacy/build/pdf.mjs")` throws inside a
  // Vercel function while working fine locally — which is exactly how the
  // signature-placement step passed every local test and then silently did
  // nothing in production (2026-08-07).
  serverExternalPackages: ["pdfjs-dist"],
  // pdf.js loads its worker by dynamic path at runtime, so Vercel's file tracer
  // cannot see the dependency and ships the function without pdf.worker.mjs
  // ("Cannot find module .../pdf.worker.mjs", measured in prod 2026-08-07).
  // Naming it here forces it into the bundle for the e-sign routes that read
  // signature-line coordinates.
  outputFileTracingIncludes: {
    "/api/esign/**": ["./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"],
  },
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
