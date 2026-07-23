# E-Signature Scout — Free + MIT + Legally Binding (US)
**Date:** 2026-07-23 · **Owner:** Max · **Method:** github-tool-scout, 2 parallel agents (MIT-platform hunt / US-legality + building blocks). 25+ repos checked; every license read from the in-repo LICENSE file via `gh api`; all legal claims sourced.
**Feeds:** CRM-PRD R10 agreement lane (`PRD-mle-crm-evolution-v1.md`); follows `oss-crm-landscape-2026-07-22.md`.

## Headline

**A mature MIT full e-signature platform does not exist on GitHub.** The good platforms (DocuSeal 18,075★, Documenso 14,097★, OpenSign 6,704★, LibreSign 781★) are all AGPL — re-verified from LICENSE files 2026-07-23. The permissive space = two young full apps + mature components. **But US legal validity comes from the PROCESS (ESIGN/UETA), not the software license or a certificate — so a thin MIT-built flow in the dashboard is 100% legally binding and 100% free.**

## US legality (sourced)

An e-signature is binding when 4 elements hold ([15 U.S.C. §7001](https://www.law.cornell.edu/uscode/text/15/7001), [§7006(5) definition](https://www.law.cornell.edu/definitions/uscode.php?def_id=15-USC-280536084-686090514&term_src=title%3A15%3Achapter%3A96%3Asubchapter%3AI%3Asection%3A7001), UETA in 49 states — [NY is the sole non-adopter](https://www.nycbar.org/issues-policy/advocacy-campaigns/ueta-esra-new-york-electronic-transactions-law/), ESIGN preempts):
1. **Intent to sign** (deliberate act: draw/type/click)
2. **Consent to transact electronically** (B2B: simple checkbox; consumers → stricter §7001(c) disclosures — matters if a doc ever goes to a homeowner)
3. **Association of signature with record**
4. **Record retention/reproducibility**

Typed/drawn signatures are as valid as certificates in the US — cryptographic QES is an [EU eIDAS tier](https://en.wikipedia.org/wiki/Qualified_electronic_signature), not a US requirement ([Adobe US law summary](https://helpx.adobe.com/legal/esignatures/regulations/united-states.html)). What wins the court fight is the **evidence record**: audit trail w/ IP+timestamps ([Fenwick on audit trails](https://www.fenwick.com/insights/publications/using-e-signatures-in-court-the-value-of-an-audit-trail), *Schrock v. Nomac Drilling* W.D. Pa. 2016), email-link signer auth baseline, document hash, copy delivery.
**Exceptions** ([§7003](https://www.law.cornell.edu/uscode/text/15/7003)): wills, family law, court docs, foreclosure/eviction notices on primary residences, most UCC. **Real-estate nuance:** service/consulting/purchase contracts e-sign fine; **deeds/mortgages need notarization + county recording** (RON territory — [deeds.com](https://www.deeds.com/articles/remote-notarization-of-real-estate-deeds/)). Never position a self-built tool for notarized closing docs.

## The options (all licenses verified from LICENSE files)

| # | Option | License | Stars | Health | Legally-binding kit | Free? |
|---|--------|---------|-------|--------|--------------------|-------|
| 1 | **Thin build into The Network** — signature_pad + @cantoo/pdf-lib + react-pdf (+optional @signpdf seal) | **All MIT** | 11,985 / 342 / 11,129 / 893 | All active (pushed Jul 2026) | You build it: consent checkbox, append-only audit table, SHA-256 at send+sign, audit-cert page, copy emails — hits all 4 elements + all court expectations | ✅ $0 forever |
| 2 | [salocin93/freesign](https://github.com/salocin93/freesign) — MIT full app in EXACT stack (React/TS/Supabase/shadcn) | **MIT** | 8 | Solo dev, dormant 8 mo, partly Lovable-built | Partial: client-info capture + signature hash util; no formal event log, no completion cert | ✅ |
| 3 | [kychee-com/kysigned](https://github.com/kychee-com/kysigned) — DKIM-based signing, offline-verifiable evidence bundles | **Apache-2.0** (whole repo) | 35 | **16 days old**, single vendor, run402 platform lock-in | Best evidence chain in permissive space: DKIM signer auth, RFC-3161 + OpenTimestamps dual timestamping, tamper fixtures | ✅ |
| 4 | [docusealco/docuseal](https://github.com/docusealco/docuseal) self-hosted + [MIT React embed](https://github.com/docusealco/docuseal-react) | **AGPL server** / MIT embed | 18,075 | Excellent (active company) | Full: audit trail, templates UI, completion certs, webhooks | ✅ self-hosted, unmodified |
| 5 | Sealing components: [open-pdf-sign](https://github.com/open-pdf-sign/open-pdf-sign) (Apache, PAdES B/T/LT/LTA), [zerodha/jpdfsigner](https://github.com/zerodha/jpdfsigner) (MIT, Zerodha-backed), [digitorus/pdfsign](https://github.com/digitorus/pdfsign) (BSD-2) | permissive | 945 / 68 / 159 | Active | Cryptographic tamper-evidence layer only — no signer workflow | ✅ |

**Rejected on record:** Documenso (AGPL), OpenSign (AGPL w/ carve-outs — an [esign.ai article](https://www.esign.ai/blog/best-opensource-digital-signature-software) claiming MIT is wrong per LICENSE file), LibreSign (AGPL + Nextcloud lock-in), DottedSign self-hosted (dual AGPL/commercial), Open eSignForms (dead 2019, AGPL), PactMaker (MIT but dead 2022 — pattern salvage only), lifted-sign (AGPL, 6 days old), supasign/document_signer (no license = all rights reserved), DocuSign/HelloSign SDKs (clients for paid SaaS), esig/dss + SignServer (LGPL Java libs, not platforms).

## Recommendation

**Primary: Option 1 — build the thin flow into The Network (~4–7 dev-days), using freesign (#2) as a read-first reference in the identical stack.** Rationale: it's the only path that is simultaneously $0, pure-MIT, legally binding by design, and consistent with Tuesday's CRM decision (agreements/receivables surface inside the dashboard; R10 lane). Architecture: `documents` (sha256_at_upload) + `signature_requests` (single-use expiring token, consent_at, sha256_at_sign) + `signature_events` append-only audit log w/ insert-only RLS → signer page (react-pdf preview + consent checkbox + signature_pad) → server stamps PDF via @cantoo/pdf-lib + appends audit-certificate page + emails copies. Optional +1 day: @signpdf cryptographic seal for tamper-evidence beyond hashes.

**Interim/fallback: Option 4 — DocuSeal sidecar** if Rob wants templates UI + polish this week: free self-hosted, AGPL contained behind its API exactly per the 2026-07-22 blueprint; MIT embed keeps the dashboard clean.

**What the build doesn't give (honest):** template/field-placement designer (pdfme, MIT, 4,717★ can close this later), bulk send, SOC-2-style attestations (irrelevant for signing your own clients), battle-tested weird-PDF handling, and the marginal evidentiary weight of a neutral third party's logs (mitigated by append-only RLS + hashes + optional seal).

**Not legal advice; for the consumer-facing (§7001(c)) and notarization edge cases, confirm with counsel.**
