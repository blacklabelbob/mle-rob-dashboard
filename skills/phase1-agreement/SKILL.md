---
name: phase1-agreement
description: Use when generating, re-generating, or previewing a MyLocalEverything Phase I Services Agreement PDF for a customer — "make the agreement for X", "generate Phase 1 paperwork", "render the agreement", "re-issue v2 of the agreement", or when a client JSON in contracts/clients/ needs to become a document. Runs the same engine the dashboard uses, and REFUSES to generate until the three intake questions are answered — never invent scope numbers.
---

# Phase I Agreement engine

One engine, two surfaces. Both call `lib/esign/agreementPdf.ts` (pure JSON-in →
PDF-bytes-out, no Next/Supabase imports) and both enforce the same intake gate.

| I need… | Use |
|---|---|
| a PDF on disk (drafting, review, re-render) | the CLI below |
| a document in the CRM (bucket + `documents` row, then Send/e-sign) | `POST /api/esign/generate` on the dashboard |

## CLI

```bash
# from the MLE ROB Dashboard repo root (Node >= 22.18 — no build step)
node scripts/esign/render-agreement.mjs ../contracts/clients/<client>.json
node scripts/esign/render-agreement.mjs <config.json> --out /tmp/preview.pdf
```

Prints the output path, page count, byte length, and sha256. Defaults the output
to the config's own `output_filename`, resolved relative to the config. It will
**not** overwrite an existing file without `--force` — executed paper is never
clobbered by a re-render.

## The intake gate — the part that matters

`checkIntake()` refuses generation unless the config's `intake` block is
complete AND self-consistent, and the CLI/API print that refusal **verbatim**
because the refusal text is the fix-it list. Required keys:

`confirmed_by` · `date` · `entities_count` · `second_brains_total` · `other_adjustments`

It also cross-checks: `entities_count` must equal `entities[].length`, and
`second_brains_total` must equal one per entity plus one per agent carrying a
second brain. A mismatch is a refusal, not a warning — reconcile with Rob/Will.

**Standing rule (Q57, 2026-07-23): never invent scope numbers to get past the
gate.** If Rob hasn't answered the three intake questions for that customer,
leave the block incomplete, leave `scope_status` marked TBC, and let the engine
refuse. `contracts/clients/the_title_base.json` is the live example of a config
deliberately parked in that state.

## Config shape

`{ client, entities[], intake, fee?, provider?, additional_scope?, output_filename? }`
— identical to the `contracts/clients/*.json` contract; `gulf_coast.json` is the
reference complete config (renders 4 pages). `provider` defaults to
MyLocalEverything (`DEFAULT_PROVIDER`); override only for a white-label send.

## Where things live

- engine + intake gate + scope grammar — `lib/esign/agreementPdf.ts`
- CLI wrapper — `scripts/esign/render-agreement.mjs`
- CRM route — `app/api/esign/generate/route.ts`
- send / sign / countersign flow — `lib/esign/**`, `app/sign/**`, `app/api/esign/**`
- build log + decisions — `docs/plans/ESIGN-BUILD-LOG.md`
