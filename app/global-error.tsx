"use client";

/**
 * Last-resort boundary. Next.js renders this when the root layout itself throws,
 * which is the one failure the app cannot otherwise report — the page is blank
 * and nothing else is mounted to tell anyone.
 */
import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

import { SENTRY_ENABLED } from "@/lib/observability/config";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (SENTRY_ENABLED) Sentry.captureException(error);
    // Keep the console path alive too — it is the only signal when Sentry is off.
    console.error("[global-error]", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          fontFamily: "system-ui, sans-serif",
          margin: 0,
          minHeight: "100vh",
          display: "grid",
          placeItems: "center",
          background: "#0f1319",
          color: "#e8e6e1",
        }}
      >
        <main style={{ maxWidth: "34rem", padding: "2rem", textAlign: "center" }}>
          <h1 style={{ fontSize: "1.35rem", margin: "0 0 .6rem" }}>
            The dashboard hit an error it could not recover from.
          </h1>
          <p style={{ color: "#a8b0b8", margin: "0 0 1.4rem", lineHeight: 1.55 }}>
            Nothing was lost — this is a display failure, not a data one. Reload to
            carry on.
            {error.digest ? (
              <>
                {" "}
                Reference <code>{error.digest}</code>.
              </>
            ) : null}
          </p>
          <button
            onClick={() => window.location.reload()}
            style={{
              font: "inherit",
              padding: ".6rem 1.3rem",
              borderRadius: 4,
              border: "1px solid #2a333d",
              background: "#161d26",
              color: "#e8e6e1",
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </main>
      </body>
    </html>
  );
}
