// Q71 Phase 2 — what the banner at the top of every page is allowed to say
// about the rows underneath it.
//
// Pure by design (CR-3): the decision is data in / data out so it can be
// unit-tested over every combination, and the React component below it does
// nothing but render what this returns. Two independent facts feed it:
//
//   mode      — WHERE the rows came from (lib/storage: file store configured,
//               or the real store failed a read and the file store covered).
//   synthetic — WHAT the rows are (`__synthetic` on the served NetworkData,
//               set only by scripts/seed-synthetic.mjs).
//
// They are genuinely independent, and the pair that matters most is the one
// that only exists because of them BOTH: Supabase down *and* the fallback
// carrying generated demo rows means the dashboard is showing numbers that
// were never anyone's. That case gets the loudest wording, not the calmest.

export type ServingMode = "configured" | "fallback" | null;

export type DisclosureTone = "demo" | "warn" | "alarm";

export interface Disclosure {
  tone: DisclosureTone;
  /** Short lead-in, rendered emphasised. */
  label: string;
  /** The sentence that tells the reader what to do about it. */
  message: string;
}

/**
 * The banner to show, or null for "say nothing" — which is reserved for the
 * live store serving real rows, the only state that needs no disclaimer.
 */
export function dataDisclosure(
  mode: ServingMode,
  synthetic: boolean
): Disclosure | null {
  if (mode === null) return null;

  if (mode === "fallback") {
    return synthetic
      ? {
          tone: "alarm",
          label: "DEMO DATA — NOT YOUR RECORDS",
          message:
            "Supabase is unreachable and the fallback is generated sample data. Every name, number and dollar below is invented. Do not read or act on anything on this screen.",
        }
      : {
          tone: "warn",
          label: "Supabase unreachable",
          message:
            "Serving fallback snapshot data. Edits are paused until it recovers.",
        };
  }

  return synthetic
    ? {
        tone: "demo",
        label: "Demo mode",
        message:
          "Generated sample data — no real people, companies or dollar amounts. Set STORAGE_SOURCE=supabase for the live network.",
      }
    : {
        tone: "warn",
        label: "File store active",
        message: "This is snapshot data, not live Supabase.",
      };
}
