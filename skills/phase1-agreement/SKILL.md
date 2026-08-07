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

## Signatures land on the PAPER, not just the certificate (Rob, 2026-08-07)

Rob rejected a signed agreement whose own `Signature: ____ / Date: ____` rules were
blank: *"If the clients signed it that NEEDS to be present when I'm going to
countersign it."* The audit certificate is the evidence; the filled line is what makes
it read as executed. Both are required.

**How placement works** — `lib/esign/pdfText.ts` (pdf.js text positions) →
`lib/esign/signatureAnchors.ts` (pure locator) → `lib/esign/inkOnLine.ts` (drawer),
called from `sign/route.ts` (CLIENT rule) and `countersign/route.ts` (PROVIDER rule).
Ink is only ever placed at coordinates read off the page — never guessed.

### THE COUPLING THAT BITES: heading wording ↔ the locator

The locator finds the blocks by matching the `PROVIDER…` / `CLIENT…` headings.
**Change that wording in the engine and signatures silently stop appearing** — the
certificate still generates, the flow still returns 200, and nothing looks broken.
This nearly shipped on 2026-08-07 when the block moved from `PROVIDER — Name` to
`PROVIDER: Name`. If you touch the execution block in `agreementPdf.ts` or
`phase1_engine.py`, update `isHeading()` in `signatureAnchors.ts` in the same change.

### VERIFY IN PROD, NOT LOCALLY — the trap that cost two dry runs

Placement passed every local test and did nothing on Vercel: pdf.js needs browser
globals (`DOMMatrix`, `Path2D`, `ImageData`) its module body touches at import time,
and the failure was swallowed by a bare `catch {}`. Fixes: `ensurePdfJsGlobals()`
shims them, `serverExternalPackages: ["pdfjs-dist"]` keeps pdf.js out of the bundle,
and failures are now logged instead of hidden.

**Always confirm against production before telling Rob it works:**

```
GET /api/esign/documents?anchors=<documentId>
→ { pagesExtracted, textItems, extractionError, anchors, verdict }
```

`verdict: "OK — both signature lines located"` is the only acceptable answer. Anything
else means the signature will not appear. **A green local test is not evidence here.**

### Standing rules from the same session

- **Rob sees everything before the client does** — *"always send it to me FIRST not
  the client."* Naming the client's address is not permission to send there first.
- **Downloads are named after the document**, ASCII only. The name rides in a URL
  parameter, so em dashes and brackets come back as `%E2%80%94` / `%5B` noise.
  `downloadFilename()` in `lib/esign/storage.ts` — apply it to BOTH the emailed link
  and the dashboard View button (the View path was missed the first time).
- **Signing order is: counterparty signs, then MLE countersigns in the dashboard.**
  Do not build emailed provider-signing. Rob, 2026-08-07: *"I dont know if I want the
  reps siging off on their own agreements. I want them to be able to send them out."*
  Countersigning being a CRM action is what stops a rep executing their own deal.
- **Catch Rob's dictation slips** rather than shipping them (a missing comma in
  "Greenwood Management, LLC" reached a client draft).
- Deferred, with reasons: `contracts/docs/DEFERRED-2026-08-07.md` (Prepared-by line,
  Google Drive copy, short `/d/<token>` links, "Complete" in the completion subject).
