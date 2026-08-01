// Q84 inc.79 — the ONE spelling of "how long the unattended close can take".
//
// inc.78 gave the ledger's heading a number for the wait it was already promising. The CONTROL
// two lines below it promises the same wait — *"The next archive check drops this control."* —
// and says nothing about when, so the same reader gets a dated sentence in the paragraph and an
// open-ended one on the button that produced it. Two readers, two spellings of one fact, and a
// number that lives in the plist can only be right in one place at a time.
//
// WHY ITS OWN MODULE AND NOT AN IMPORT BETWEEN THE TWO. `hostConfirmProse` already imports from
// `hostConfirmView` (the key + the control type); pointing the view back at the prose for this
// constant would close a cycle for a single integer. This module imports nothing, so both sides
// can read it and neither depends on the other.
//
// Pure per CR-3: no clock, no network, no React.

/**
 * How long the promised unattended close can take, at the OUTSIDE.
 *
 * Provenance, because a number invented here would be a lie with a decimal point:
 * `com.aivoicetech.meeting-intake.plist` fires `meeting-intake.sh` on `StartInterval 1800`,
 * which calls `scripts/meeting-archive-sync.sh`, which runs `notion-crm-check --flag` — the
 * only thing that re-mints these rows. Half an hour is the gap between ticks, so it is a
 * CEILING and never a countdown: nothing on this path has a clock (CR-3) and cannot know how
 * long ago the last tick ran.
 */
export const ARCHIVE_CHECK_CEILING_MINUTES = 30;

/**
 * The wait itself, spelled once.
 *
 * A ceiling reads as a ceiling only if the word survives the copy — "in 30 minutes" is a
 * countdown and would be wrong the moment a tick lands sooner, which is most of the time.
 * Both readers append this to their own sentence rather than composing their own.
 */
export const WITHIN_ARCHIVE_CHECK = `within ${ARCHIVE_CHECK_CEILING_MINUTES} minutes`;
