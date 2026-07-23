# E-Sign Consumer Disclosure Spec — §7001(c) flow (business vs consumer signers)
**Date:** 2026-07-23 · **Status:** build-ready, **CONSUMER FLOW GATED UNTIL COUNSEL REVIEW** · **Owner:** Max
**Sources:** github-tool-scout session transcript (recovered 2026-07-23, session `0af19db1`) · [15 U.S.C. §7001](https://www.law.cornell.edu/uscode/text/15/7001) · [§7006 definitions](https://www.law.cornell.edu/uscode/text/15/7006) · [FDIC Consumer Compliance Examination Manual X-3 (E-Sign Act)](https://www.fdic.gov/consumer-compliance-examination-manual/x-3-electronic-signatures-global-and-national-commerce-act-e)
**Reconciles:** `docs/research/esign-mit-scout-2026-07-23.md` · `docs/plans/esign-flow-walkthrough-2026-07-23.html` · `lib/esign/consent.ts` (B2B baseline) · `docs/plans/ESIGN-BUILD-LOG-2026-07-23.md`
**Not legal advice. The consumer disclosure language below ships nowhere until counsel signs off.**

---

## 1. Legal scope — who triggers the stricter regime (verified from statute)

**Answer: ANY consumer, not just homeowners/residential-property matters.** §7001(c) is keyed to the
*person and purpose*, not the property type. "Consumer" = "an individual who obtains, through a
transaction, products or services which are used **primarily for personal, family, or household
purposes**" ([§7006(1)](https://www.law.cornell.edu/uscode/text/15/7006)). A homeowner buying a roof is
a consumer because roofing their own house is a household purpose — but so is any individual buying any
personal/family/household product or service. The FDIC manual confirms the regime applies broadly to
consumer transactions "in or affecting interstate or foreign commerce — not limited to residential
property" ([FDIC X-3](https://www.fdic.gov/consumer-compliance-examination-manual/x-3-electronic-signatures-global-and-national-commerce-act-e)).

**Precise trigger (worth knowing, then designing past):** §7001(c) literally activates when *another*
"statute, regulation, or other rule of law requires that information relating to a transaction … be
provided or made available to a consumer **in writing**" ([§7001(c)(1)](https://www.law.cornell.edu/uscode/text/15/7001)).
Home-improvement/roofing contracts with homeowners routinely carry exactly such writing requirements
(state home-improvement contract statutes, 3-day right-to-cancel notices), so the safe engineering rule is:

> **Policy: every signer marked `consumer` gets the full §7001(c) flow, regardless of document type.**
> Guessing per-document which state writing requirement applies is counsel work, not runtime work.

**Business signers are untouched:** §7001(c) does not apply to B2B; the existing simple consent
checkbox (`lib/esign/consent.ts`, `b2b-2026-07-23`) remains the whole flow.

### What §7001(c) requires the flow to show BEFORE the consumer consents (statute-sourced checklist)

| # | Requirement | Statute |
|---|---|---|
| 1 | Right to have the record on **paper**/non-electronic form, and how to request a paper copy + **any fee** | §7001(c)(1)(B)(i), (B)(iii) |
| 2 | Right to **withdraw** consent + any **conditions, consequences, or fees** of withdrawal | §7001(c)(1)(B)(i) |
| 3 | **Scope** of consent — this transaction only, or identified categories of records | §7001(c)(1)(B)(ii) |
| 4 | **Procedures** to withdraw consent and to **update contact information** | §7001(c)(1)(B)(iii) |
| 5 | **Hardware and software requirements** for access and retention of the records | §7001(c)(1)(C)(i) |
| 6 | Consent given/confirmed **electronically, in a manner that reasonably demonstrates the consumer can access** the electronic form used | §7001(c)(1)(C)(ii) |
| 7 | *Post-consent duty:* if hardware/software requirements change with material risk of lost access → notice of revised requirements + restated fee-free withdrawal right + fresh (C)(ii)-style consent | §7001(c)(1)(D) |

All must be in "a clear and conspicuous statement" **prior to consent** (§7001(c)(1)(B)).

---

## 2. What the scout session actually proposed (recovered from transcript)

Rob asked (verbatim): *"so you're saying its not legal for honeowners to sign any of these?"* — the
scout answered:

> "Homeowners can absolutely e-sign, and it's fully binding. … The difference is **one extra step, not a
> prohibition**. When the signer is a **consumer** (homeowner) instead of a business, ESIGN §7001(c)
> requires the system to show a **consent disclosure screen before signing**."

The scout's proposed screen (each item "one sentence"): paper-copy right + fee · withdrawal right ·
hardware/software statement ("a device that opens PDFs") · and for the demonstrable-access element:

> "Checkbox on the same screen — **clicking it in a browser that just rendered the PDF *is* the
> demonstration**."

> "So it's a **~30-second disclosure page in front of the signature** … If we build the thin flow, we
> build **two consent screens: B2B (simple checkbox) and consumer (§7001(c) disclosures + checkbox) —
> pick per recipient.** Trivial to include from day one."

Reconciliation vs the statute checklist: the scout's four-row screen covers items 1, 2, 5, 6 but
compresses/omits **3 (scope of consent), 4 (withdrawal + contact-update procedures), and 7 (change
notices)**, and omits withdrawal *consequences/fees* wording. This spec closes those gaps.

---

## 3. Build spec

### 3.1 Signer-type selection (pre-send check popup)

Add one field to the existing pre-send check modal (walkthrough Step 2):

- **Signer type** — `business | consumer` — required, no silent default from thin data. Pre-fill:
  `business` when the lead is an org-anchored deal, `consumer` when the signer is an individual
  homeowner; rep must confirm like every other pre-send field. Helper text: *"Consumer = an individual
  signing for personal/family/household purposes (e.g. a homeowner). Business = signing for a company."*
- Stored in `signature_requests.presend_answers.signer_type` (jsonb — no migration needed) **and**
  echoed into the consent event meta + audit certificate.
- While the consumer flow is counsel-gated: choosing `consumer` blocks send with *"Consumer signing is
  not enabled yet — pending counsel review (ESIGN-CONSUMER-DISCLOSURE-SPEC.md)."* Flag:
  `ESIGN_CONSUMER_ENABLED` (env, default off).

### 3.2 Business-signer flow — UNCHANGED

Signing page exactly as built: review PDF → single consent checkbox (`ESIGN_CONSENT_TEXT`, version
`b2b-2026-07-23`) → sign. No disclosure screen.

### 3.3 Consumer-signer flow — pre-consent disclosure screen

Signing page gains **one screen in front of the existing consent + signature step** (the scout's
"~30-second disclosure page"), with a demonstrable-access mechanic:

1. **Order of operations:** link opens → PDF renders in-browser (react-pdf) → **disclosure screen**
   (full text §3.5) → consumer checks the consent box → signature step unlocks. The consent checkbox is
   **disabled until the PDF has successfully rendered** in this session — that render + the electronic
   click is the §7001(c)(1)(C)(ii) "reasonably demonstrates" evidence, per the scout's mechanism,
   hardened: we log `pdf_rendered_at` (+ UA, viewport) in the consent event meta instead of merely
   assuming it. Render failure → checkbox stays locked, page shows the paper-copy option.
2. **New consent constant:** `ESIGN_CONSUMER_DISCLOSURE_TEXT` + `ESIGN_CONSUMER_CONSENT_TEXT` in
   `lib/esign/consent.ts`, version `consumer-2026-07-23-DRAFT-counsel-pending` — single-sourced for the
   screen AND the audit certificate (same discipline as B2B; tests assert all seven checklist elements
   appear, mirroring the existing §7001-elements tests).
3. **Consent event** (`signature_events`, existing enum type `consent`): meta gains
   `{ consent_version, signer_type: "consumer", pdf_rendered_at, disclosure_shown_at }`.
4. **Copy delivery unchanged** (download + email-me-my-copy already required for SMS signers) — it
   doubles as the retention backbone the disclosures promise.

### 3.4 Audit-certificate additions (consumer signings only)

The appended certificate page (completion job) additionally reproduces:
- the **full disclosure text + version** the consumer saw (not a reference — the text);
- the demonstrable-access evidence line: *"Consumer consented electronically after the agreement PDF
  rendered in their browser session (rendered {ts}, consented {ts}, {UA}) — 15 U.S.C.
  §7001(c)(1)(C)(ii)."*;
- signer type, and the copy-delivery event (channel + destination).

### 3.5 Disclosure language — DRAFT, ⚠️ COUNSEL REVIEW BEFORE FIRST CONSUMER USE

> **Going electronic — please read before you agree**
>
> **Your right to paper.** You can get this agreement (and any related documents) on paper instead, at
> no charge. To request a paper copy — before or after signing — email {SENDER_EMAIL} or tell your
> {COMPANY} representative. *(scope-of-consent)* Your agreement to sign electronically applies **only to
> this transaction and its related documents** — not to anything else.
>
> **Your right to withdraw.** You may withdraw your consent to receive documents electronically at any
> time, at no charge and with no penalty, by emailing {SENDER_EMAIL}. Withdrawing does not undo anything
> you have already signed; it means future documents for this transaction will be provided on paper.
>
> **Updating your contact info.** To update the email address or mobile number we use to send you
> documents, email {SENDER_EMAIL} or tell your {COMPANY} representative.
>
> **What you need.** To access and keep these documents you need a device with an internet connection
> and a current web browser able to display PDF files, and either a printer or storage (such as your
> device or email) to retain your copy. If these requirements ever change in a way that could prevent
> you from accessing your documents, we will notify you of the new requirements and you may withdraw
> your consent at that time, free of any fee or condition.
>
> **Your copy.** After signing you will be able to download the signed agreement immediately, and we
> will send a copy to the email address you provide.
>
> ☐ **I consent to receive and sign documents for this transaction electronically.** By checking this
> box in the browser in which this agreement is displayed, I confirm that I can access documents in this
> electronic (PDF) form, and I agree that my electronic signature is the legal equivalent of my
> handwritten signature and will be associated with this document and its audit record.

Placeholders `{SENDER_EMAIL}`/`{COMPANY}` resolve at render from the sending identity (aivoicetech.io
side per the email-identity rule).

### 3.6 Post-consent operational duties (small, but real)

- **Withdrawal handling:** a withdrawal email → void open signing links for that signer
  (`voided` event, reason `consent_withdrawn`), future docs for that transaction go paper. Manual
  process is acceptable at current volume; log it.
- **Change notices (§7001(c)(1)(D)):** if we ever change the required tech (e.g. drop PDF for another
  format), consumers with open transactions get the revised-requirements notice + fresh consent. Design
  note only — no code now.
- **§7003 exclusions unchanged:** never route wills/family-law/court docs, foreclosure-eviction
  notices, or notarized deed/closing docs through this system (scout doc, unchanged).

### 3.7 Effort

~1 dev-day on top of the existing build: consent.ts constants + tests · signer_type field in the
pre-send modal + gate flag · disclosure screen + render-unlock wiring on `app/sign/[token]` · consumer
lines on the certificate. No migration.

---

## 4. Definition of done

- [ ] Counsel has reviewed §3.5 (and the withdrawal-handling note) — version bumped to drop `DRAFT-counsel-pending`
- [ ] `ESIGN_CONSUMER_ENABLED` flipped on only after the above
- [ ] Tests: all 7 checklist elements asserted present in `ESIGN_CONSUMER_DISCLOSURE_TEXT`; consent checkbox unreachable without a rendered PDF; certificate reproduces disclosure text verbatim
- [ ] Walkthrough HTML Step 5 bullet updated to link this spec (currently says only "consumer version with §7001(c) disclosures if the signer is a homeowner" — scope is any consumer, per §1)
