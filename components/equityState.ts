import type { EquityState } from "@/lib/equity";

// Q41 inc.5 — the ONE place the four equity states are worded and coloured.
//
// These moved out of EquitySplits.tsx the moment a second surface (the record page)
// needed them. A copy would let "agreed verbally — nothing signed" become "verbal"
// on one screen and stay long-form on the other, and the whole point of Rob's 7/27
// correction is that signed-vs-verbal is a FACT, not a caption style.

export const EQUITY_STATE_LABEL: Record<EquityState, string> = {
  signed: "SIGNED",
  verbal: "agreed verbally — nothing signed",
  draft: "in draft at counsel",
  unknown: "state not recorded",
};

export const EQUITY_STATE_CLASS: Record<EquityState, string> = {
  signed: "text-emerald-400",
  verbal: "text-amber-400",
  draft: "text-sky-300",
  unknown: "text-slate-500",
};
