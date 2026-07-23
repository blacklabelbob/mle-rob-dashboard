# Lead-Source Taxonomy + UTM Convention (Task MC.4)
**2026-07-23 · narrates `lib/leads/sourceTaxonomy.ts` — the CODE is canonical (CR-3). This doc never re-states a rule the module pins.**

## What this is
Channel-level attribution: which of five buckets a lead counts under. Per-lead detail ("what was said") is Task 1.15's `sourceContext.ts` — complementary, not overlapping. The taxonomy value rides alongside a `source_context` as `attribution` (extra keys are additive there by design).

## The taxonomy
Five values, exactly the base-PRD list — `LEAD_SOURCE_TAXONOMY` in the module carries label/definition/examples per value:

`cold_email · referral · lead_magnet · organic · direct_unknown`

**Deliberate call, on the record:** there is NO sixth "paid ads" bucket. Paid-vs-organic is a *dimension* carried by `utm_medium` (`cpc`/`paid_social` vs `social`/`organic`); an ad-driven lead classifies by what it responded to (a scorecard ad → `lead_magnet`). Widening the enum is a Rob decision, not a driver one.

`direct_unknown` is the honest bucket: no attribution evidence → no guessing into a prettier one (same truth-gate posture as MC.2's null-on-zero-denominator).

## UTM convention
`UTM_CONVENTION` pins one row per param (source = platform, medium = mechanism **and the classification driver**, campaign = kebab ref joining 1.15's `campaign_ref`/`creative_ref`, content = creative variant, term = paid-search keyword only). Lead-magnet campaigns are prefixed `lm-` (`LEAD_MAGNET_CAMPAIGN_PREFIX`).

## Classification
- `classifyUtm(params)` — deterministic 5-rung ladder (order test-pinned): coldemail+email → cold_email; medium=referral → referral; campaign `lm-*` → lead_magnet; any other UTM value → organic; nothing → direct_unknown.
- `classifyLeadSource({utm, intakeType})` — UTM evidence beats the intake-type default (`INTAKE_TYPE_DEFAULT_SOURCE`, total over 1.15's types — completeness gate-tested); no evidence → direct_unknown.
- `parseLeadSource(text)` — free-text normalizer for notes/CSV/human entry; returns `null` when unconfident, never a guess.

Worked examples: `TAXONOMY_WORKED_EXAMPLES`, test-pinned to the classifier (drift fails the suite); import them, don't copy snippets.

## Consumers
| Consumer | What it takes |
|---|---|
| MC.2 `source_close_rate` | this enum is the `(source, isClosedWon)` domain — the adapter MC.2 named; `deals.source` column itself is still future schema |
| MC.9 Cal.com ingestion | `classifyUtm` at ingestion time on passthrough params |
| MC.12 KPI Summary / MC.15 rollup | group-by domain |

## Remaining for the MC.4 tick (inc.2)
**Cal.com hidden-field/UTM passthrough spike** — yes/no verdict with evidence URLs (or a documented workaround). Until then the DoD is 2/3 met (taxonomy ✅, UTM convention ✅, verdict ⏳).

Tests: `lib/__tests__/sourceTaxonomy.test.ts` (7 pins incl. ladder order, enum freeze, 1.15 completeness, worked-example drift).
