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

### Emailed links are SHORT links, on our own domain

Every download in an agreement email is `/d/<documentId>/<hmac>` (`lib/esign/downloadLink.ts`
→ `app/d/[documentId]/[sig]/route.ts`), never a raw Supabase signed URL. Rob rejected the raw
one twice: ~600 characters, wrapped over five lines, tail full of `%255BDRY+RUN+3%255D`.

- Stateless — the path is the document id plus an HMAC of it. No table, no migration.
- Resolved at click time, so ONE link stays correct for the life of the agreement: mailed at
  signing, it returns the fully-executed copy once countersigned. Do not mail stage-specific
  URLs.
- The route is public (`/d/` is in `isPublicPath`) — counterparties have no dashboard creds.
- No key configured ⇒ `downloadLink()` returns null and callers fall back to the long signed
  URL. A missing env must never mail a dead link.
- **On the record: this link does not self-expire.** It is an unguessable bearer link to one
  agreement, refused once the document is voided or archived. If that ever needs to change,
  stamp an expiry into the payload — do not lengthen the signature.

Completion email subject leads with **Complete:** (Rob's wording). Do not revert it to
"Fully executed:".

### Email copy must state the ACTUAL state, never the hoped-for one

The signed-copy email said *"Download the completed agreement"* when only the counterparty had
signed. Rob: *"you should not say completed and all that other bullshit. Its incorrect if I
havent Countersigned it yet."* These emails go to the **other side of a contract**, so
overstating status is a misstatement to a counterparty, not a copy nit.

- Signer route email → the agreement is **signed, not executed**. Say countersignature is
  outstanding and what happens next.
- Countersign route email → the only one allowed to claim full execution. Subject leads with
  **Complete:**.
- A FUTURE reference ("will return the executed copy once countersigned") is fine and wanted;
  a present-tense claim is not. `lib/esign/__tests__/sender.test.ts` pins this — every mention
  of "fully executed" in the signed email must be qualified by *not yet / once / as soon as*.

### HARD RULE: every agreement routes through Rob (2026-08-08)

Rob: *"its really simple ALL agreements go through me, period."* No exception for seniority,
urgency, or deal size. A rep PREPARES and SENDS; only Rob executes on behalf of MLE.

- The provider signing link is minted to the **authorized signer on file (Rob)** and is never
  delivered to whoever clicked Send. A rep cannot receive, forward or self-issue one.
- The rep's identity goes on the paper instead, as **Prepared by: Name / Email / Phone**
  (typed at send time, printed offset in the execution block).
- Signing is ORDER-AGNOSTIC — either party may sign first. Rob, on why provider-first helps:
  *"sometimes, the provider signing it first gives them the reminder or impetus to be like
  'shoot they're waiting on me' and it helps speed up the process."*
- Rob must be able to sign **without CRM access** — SMS + email carry his link.

⚠️ **STATUS: THIS IS A REQUIREMENT, NOT A DESCRIPTION OF THE SHIPPED FLOW.** Read as of
2026-08-08 **none of the four bullets above is built**, and one of them contradicts what is
built and tested:

- The shipped flow is **sequential, counterparty-first, and enforced in code** — `planCountersign`
  (`lib/esign/countersign.ts`) *throws* on a document the other side has not signed, and the
  pre-send modal + signer screen both state that order to both parties. That answer was written
  down one day earlier for Rob's own question (Q93 DoD (c), `docs/plans/ESIGN-BUILD-LOG-2026-07-23.md`
  §"what ORDER do the two signatures happen in"). **Order-agnostic signing is a change to that,
  not a restatement of it** — do not implement it by loosening the guard until Rob confirms.
- There is no `prepared_by` anywhere in `lib/esign/**`, `contracts/**` or the PDF engine, and no
  SMS channel for the MLE-side link (Q5b Twilio creds are still outstanding).

**Provenance, stated plainly because it could not be verified from here:** these quotes were left
in the working tree by a session that was cut off, and they appear in **no** other record — not
prod `dev_chat` (newest is max #64), not `BUILD-QUEUE.md`, not `docs/`. They read as Rob's live
words from the 2026-08-08 interactive session, which is how Q93's verbatim reached the queue too,
but a driver run cannot confirm that. They are preserved **verbatim and unedited**; the work they
imply is queued as **Q94** and is flagged for Rob's confirmation before any code moves.
