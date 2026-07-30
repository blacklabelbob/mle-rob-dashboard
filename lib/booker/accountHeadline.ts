/**
 * Q82 inc.3 — the headline a booker actually reads, reconciled with what the CRM can prove.
 *
 * `headlineFor` in `accountSignals.ts` states the RULE's finding: "no appointment booked ·
 * never called". That is correct about the rule and wrong on the screen, because inc.2 found
 * this CRM has no calendar and holds no logged call at all — so the row would assert a
 * discovered fact about the account while the badge beside it says "unknown". One row, two
 * voices, and the louder one is the wrong one.
 *
 * This is the reconciliation, kept pure and out of the component so it can be pinned by tests:
 * a signal whose SOURCE is missing is described as untracked, never as a finding about the
 * account. Same posture as `rm_invoices_ar.synced_at` (Q81) — an empty read and a missing
 * source must never render identically.
 */

import type { AccountState } from "./accountSignals";

export type SignalEvidence = {
  /** True when at least one future-dated meeting exists anywhere in the system. */
  appointment: boolean;
  /** True when at least one call has ever been logged anywhere in the system. */
  call: boolean;
};

export function displayHeadline(state: AccountState, evidence: SignalEvidence): string {
  // Phase 1+ needs no evidence beyond the phase itself, which the record carries directly.
  if (state.signals.includes("phase_1_plus")) return state.headline;

  const parts: string[] = [];
  if (state.signals.includes("no_upcoming_appointment")) {
    parts.push(evidence.appointment ? "no appointment booked" : "appointments not tracked yet");
  }
  if (state.signals.includes("cold_call")) {
    if (!evidence.call) {
      parts.push("no call log in this CRM");
    } else {
      parts.push(
        state.daysSinceLastCall === null
          ? "never called"
          : `no call in ${state.daysSinceLastCall} days`
      );
    }
  }
  return parts.length ? parts.join(" · ") : state.headline;
}
