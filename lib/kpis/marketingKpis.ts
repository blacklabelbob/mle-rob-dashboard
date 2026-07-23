// PRD Task MC.2 (base 7.3): the 4 marketing KPIs — formulas as CODE per CR-3
// (docs/plans/MARKETING-KPI-SPEC.md narrates; it never re-states a formula).
// Definitions + pure compute functions only — dashboard consumption is MC.12's
// KPI Summary panel. Same honest-coverage posture as MC.3's rule table: where
// the input source system isn't wired yet (Cal.com bookings → MC.9, channel
// taxonomy → MC.4, ad spend → manual entry), the KPI says so instead of
// pretending the number is computable today.
//
// Ratio guard: a zero denominator returns null — never a fake 0 or Infinity.
// Consumers render null as "no data", not as a metric.

export type MarketingKpiId =
  | "cost_per_booked_call"
  | "lead_magnet_conversion"
  | "source_close_rate"
  | "booking_volume_by_channel";

export type KpiCoverage =
  | "computable_today" // every input has a live source in this repo
  | "manual_input_needed" // formula ready; one input is human-entered (no system emits it)
  | "blocked_on_ingestion"; // source data not in the CRM yet (MC.4 / MC.9)

export type KpiInput = {
  name: string;
  sourceSystem: string; // the NAMED source system the base PRD demands
  detail: string;
};

export type MarketingKpi = {
  id: MarketingKpiId;
  label: string;
  formula: string; // human-readable; the compute fn below is canonical
  inputs: KpiInput[];
  coverage: KpiCoverage;
  coverageNote: string;
};

export const MARKETING_KPIS: readonly MarketingKpi[] = [
  {
    id: "cost_per_booked_call",
    label: "Cost per Booked Call",
    formula: "ad/channel spend in period ÷ discovery calls booked in period",
    inputs: [
      {
        name: "spend",
        sourceSystem: "ad platforms (Meta/Google) — manual entry until an ads integration exists",
        detail: "total marketing spend for the period, per channel or blended",
      },
      {
        name: "bookedCalls",
        sourceSystem: "Cal.com (via MC.9 booking ingestion; no bookings table yet)",
        detail: "count of discovery calls booked in the same period",
      },
    ],
    coverage: "blocked_on_ingestion",
    coverageNote:
      "Formula ready; bookings land with MC.9's Cal.com workflow, spend is manual entry either way (no ads integration planned).",
  },
  {
    id: "lead_magnet_conversion",
    label: "Lead-Magnet Conversion",
    formula: "lead-magnet submissions in period ÷ unique lead-magnet visitors in period",
    inputs: [
      {
        name: "submissions",
        sourceSystem:
          "n8n web-form capture → activities.sourceContext web_form (lib/leads/sourceContext.ts, Task 1.15)",
        detail: "form submissions attributed to a lead-magnet asset",
      },
      {
        name: "visitors",
        sourceSystem: "Vercel Web Analytics on the lead-magnet page (outside the CRM)",
        detail: "unique visitors to the same asset in the same period",
      },
    ],
    coverage: "manual_input_needed",
    coverageNote:
      "Submissions are countable from the activities lake today; the visitor denominator lives in Vercel analytics and is read manually until anyone automates it.",
  },
  {
    id: "source_close_rate",
    label: "Source → Close Rate",
    formula: "per source channel: deals reaching signed(+later) ÷ deals created from that source",
    inputs: [
      {
        name: "dealSource",
        sourceSystem:
          "MC.4 lead-source taxonomy (not defined yet) — nearest live seam is activities.sourceContext.source_type (Task 1.15, per-lead detail not channel taxonomy)",
        detail: "the channel each deal is attributed to (Cold Email, Referral, Lead Magnet, Organic, Direct/Unknown)",
      },
      {
        name: "dealStage",
        sourceSystem: "CRM deals.stage (lib/types.ts stage ladder; signed/invoiced/paid = closed-won)",
        detail: "whether the deal closed",
      },
    ],
    coverage: "blocked_on_ingestion",
    coverageNote:
      "deals has NO source column and the channel taxonomy is MC.4's deliverable — computable the moment MC.4 lands a source field; the compute fn takes (source, isClosedWon) pairs so it doesn't change when it does.",
  },
  {
    id: "booking_volume_by_channel",
    label: "Booking Volume by Channel",
    formula: "count of discovery calls booked in period, grouped by UTM/source channel",
    inputs: [
      {
        name: "bookings",
        sourceSystem:
          "Cal.com bookings + UTM passthrough (MC.4 spike + MC.9 ingestion; neither exists yet)",
        detail: "each booking with its attributed channel (Direct/Unknown when UTM absent)",
      },
    ],
    coverage: "blocked_on_ingestion",
    coverageNote:
      "Pure count-group — trivially computable once MC.9 writes bookings with MC.4's UTM channel attached.",
  },
];

// ---- canonical compute functions (pure, deterministic, no clock) ----

/** spend ÷ booked calls; null when no calls were booked (never Infinity). */
export function costPerBookedCall(spend: number, bookedCalls: number): number | null {
  if (bookedCalls <= 0) return null;
  return spend / bookedCalls;
}

/** submissions ÷ unique visitors, as a 0–1 rate; null when no visitors. */
export function leadMagnetConversion(submissions: number, visitors: number): number | null {
  if (visitors <= 0) return null;
  return submissions / visitors;
}

export type SourcedDeal = { source: string; isClosedWon: boolean };

/** Per-source close rate (0–1) + volume; sources with zero deals simply absent. */
export function sourceCloseRate(
  deals: readonly SourcedDeal[],
): Record<string, { total: number; won: number; rate: number }> {
  const out: Record<string, { total: number; won: number; rate: number }> = {};
  for (const d of deals) {
    const row = (out[d.source] ??= { total: 0, won: 0, rate: 0 });
    row.total += 1;
    if (d.isClosedWon) row.won += 1;
  }
  for (const row of Object.values(out)) row.rate = row.won / row.total;
  return out;
}

/** Booking counts grouped by channel; missing/empty channel → "direct_unknown" (MC.4 taxonomy floor). */
export function bookingVolumeByChannel(
  bookings: readonly { channel?: string }[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const b of bookings) {
    const channel = b.channel?.trim() || "direct_unknown";
    out[channel] = (out[channel] ?? 0) + 1;
  }
  return out;
}

// ---- worked examples (base-PRD DoD: one per KPI, test-pinned so the ----
// ---- formula and its example can never drift apart)                 ----

export const MARKETING_KPI_WORKED_EXAMPLES = {
  cost_per_booked_call: {
    narrative: "$600 Meta spend in June produced 4 booked discovery calls → $150/call.",
    inputs: { spend: 600, bookedCalls: 4 },
    expected: 150,
  },
  lead_magnet_conversion: {
    narrative: "Growth Scan page: 12 submissions from 200 unique visitors → 6% conversion.",
    inputs: { submissions: 12, visitors: 200 },
    expected: 0.06,
  },
  source_close_rate: {
    narrative:
      "Referral: 4 deals, 2 signed → 50%. Cold Email: 5 deals, 1 signed → 20%.",
    inputs: [
      { source: "referral", isClosedWon: true },
      { source: "referral", isClosedWon: true },
      { source: "referral", isClosedWon: false },
      { source: "referral", isClosedWon: false },
      { source: "cold_email", isClosedWon: true },
      { source: "cold_email", isClosedWon: false },
      { source: "cold_email", isClosedWon: false },
      { source: "cold_email", isClosedWon: false },
      { source: "cold_email", isClosedWon: false },
    ] as SourcedDeal[],
    expected: {
      referral: { total: 4, won: 2, rate: 0.5 },
      cold_email: { total: 5, won: 1, rate: 0.2 },
    },
  },
  booking_volume_by_channel: {
    narrative:
      "Week of bookings: 3 from lead_magnet, 2 from referral, 1 with no UTM → direct_unknown.",
    inputs: [
      { channel: "lead_magnet" },
      { channel: "lead_magnet" },
      { channel: "lead_magnet" },
      { channel: "referral" },
      { channel: "referral" },
      {},
    ],
    expected: { lead_magnet: 3, referral: 2, direct_unknown: 1 },
  },
} as const;
