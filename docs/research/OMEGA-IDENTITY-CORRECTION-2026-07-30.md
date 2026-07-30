# Omega — the CRM has the WRONG company on Rob's relationship

**Date:** 2026-07-30 · **Trigger:** Rob, 2026-07-29 — *"the Omega guys started talking about other companies they
own that our services could work for. YOu CANNOT miss that stuff man."*
**Status:** identity resolved from public sources. **Record correction proposed, NOT auto-applied** — an org identity
swap is not something to do silently.

---

## The finding

`data/network.local.json` **C-2019 "Omega Title (FL)"** describes **Omega Title Holdings Group** (Naples).
The person who actually sat in the 2026-07-28 meeting is from **Omega National Title Agency** — a **different,
unrelated company.** The record already carried an open doubt about this and nobody collected the answer:

> *"Likely = Omega Title Holdings Group (Naples HQ, 3411 Tamiami Trail N; SW-FL origin — fits Alex).
> CONFIRM w/ Alex it's Scott Dascani's shop (name-collides with Omega Title LLC of Fort Myers +
> Omega National Tit…"*

**The 7/28 calendar invite answered it, and the answer is the one the note feared.**

## The two companies, separated

| | **Omega National Title Agency** ← *the 7/28 meeting* | **Omega Title Holdings Group** ← *what C-2019 records* |
|---|---|---|
| Domain | omeganationaltitle.com | omegatitlegroup.com |
| Leadership | **Mike Stiber II — President** | **Scott Dascani — CEO**; David Cochran CFO; **Angela Stavros — COO** |
| HQ | 6265 Old Water Oak Rd, Ste 204, Tallahassee FL 32312 | 3411 Tamiami Trail N, Naples FL 34103 |
| Offices | Orlando, Panama City Beach, Jacksonville | Naples HQ + Ft. Lauderdale, Pembroke Pines, Stuart, Gulf Breeze |
| Scale | 11–50 employees, ~$5.5M revenue, 75+ yrs combined staff experience | 6,000+ closings, ops across 24 states |
| FL DFS license | W058864 | — |

**`Stiber` does not appear anywhere on omegatitlegroup.com's leadership page.** The C-2019 note's claim that
*"Stiber II (Pres. East Coast)"* belongs to Omega Title Holdings Group is **wrong** — he is President of the
*other* Omega. That single wrong sentence is what welded two companies into one record.

**Consequence:** the 2026-07-22 enrichment on C-2019 (phone [phone redacted], Naples HQ, Dascani identification,
`[email redacted @omegatitlegroup.com]` — who is Angela **Stavros, COO of the Naples company**) describes a business Rob may
never have met. Any outreach off that record goes to the wrong company.

## What the 7/28 invite proves (evidence, not inference)

Calendar: **"Meeting with Mike @ Omega"**, Tue 2026-07-28 09:00–10:00 EDT, **in person**, 3384 Woods Edge Cir #103,
Bonita Springs FL. Organizer **[email redacted @gulfregroup.com]** (Alex Greenwood, `P-1022` — the referrer).

| Attendee | Read |
|---|---|
| `[email redacted @omeganationaltitle.com]` | **Mike Stiber II, President, Omega National Title Agency** — the "Mike @ Omega" of the title |
| `[email redacted @gulfregroup.com]` | Alex Greenwood, Gulf Coast RE — **P-1022**, the door |
| `[email redacted @estatestitlefl.com]` | Trent Brands — **already in CRM** as org `the-title-base`. Match, do not duplicate |
| `[email redacted @gmail.com]` | Will DeVito — Rob's MLE partner (free-mail: do NOT infer an employer) |
| `[email redacted @gmail.com]` | Chris Acheson (free-mail: do NOT infer an employer) |
| `[email redacted @gmail.com]` | **Unidentified.** Mailbox reads as a SW-Florida handle (the local part is redacted here — the live address is on the 7/28 calendar invite). Needs Rob |
| `rob@aivoicetech.io` | Rob |

**`[email redacted @fireflies.ai]` was NOT invited.** In-person, no notetaker, no Zoom recording — **no transcript exists.**

## Proposed correction (needs Rob's yes — identity swaps are not silent)

1. **Create** `Omega National Title Agency` as its own org (domain `omeganationaltitle.com`), with Mike Stiber II
   as President. **Key on domain, never on the spoken name "Omega"** — that is what caused this.
2. **Attach Rob's actual relationship** (Alex's introduction, the 7/28 meeting) to the NEW org.
3. **Keep C-2019** as Omega Title Holdings Group, but **strip the false "Stiber II (Pres. East Coast)" sentence**
   and demote it to a lead Rob has not met, not a live relationship.
4. **Attribution edge:** Rob → Alex Greenwood (`P-1022`) → Omega National Title. `suggested: false` — Alex
   organised the meeting on the record, so this introduction is stated, not inferred.
5. **Open question for Rob:** was Alex's original 2026-07-09 "door" to *this* Omega all along (making the whole
   C-2019 enrichment a research error), or does he genuinely have both? **Do not guess — ask Alex.**

## ⚠️ The part that CANNOT be recovered

Rob: *"the Omega guys started talking about other companies they own that our services could work for… Why
wouldn't those have been created into their own companies in the company view, then looked up and researched,
showed the attribution from me all the way to the omega guys."*

**Those company names are not in any system.** The meeting was in person with no recorder, so there is no
transcript to mine — the names exist only in Rob's memory. Everything above was reconstructed from a calendar
invite and public records; **the subsidiaries cannot be.**

**The moment Rob names them, the chain completes automatically:** `company-catcher` creates each org,
`lead-enricher` researches it, `person-resolver` attaches the people, `attribution-keeper` draws
Rob → Alex → Omega → each subsidiary. **The only missing input is the list of names.**

**Prevention already shipped 2026-07-30:** `meeting-scribe` flags any calendar event whose attendees lack a
notetaker *before* the meeting, so an in-person conversation can never again be the only copy.

---

**Sources:** [ZoomInfo — Omega National Title Agency](https://www.zoominfo.com/c/omega-national-title-agency/449780410) ·
[LinkedIn — Mike Stiber II, President](https://www.linkedin.com/in/mike-stiber-ii-6b02b128/) ·
[FL DFS licensee W058864](https://licenseesearch.fldfs.com/Licensee/1834985) ·
[omeganationaltitle.com](https://www.omeganationaltitle.com/) ·
[Omega Title Holdings Group leadership](https://omegatitlegroup.com/about) ·
[Omega Title Florida — BBB](https://www.bbb.org/us/fl/naples/profile/title-companies/omega-title-florida-llc-0653-90126448) ·
[Yelp — Omega National Title, Orlando](https://www.yelp.com/biz/omega-national-title-agency-orlando)
