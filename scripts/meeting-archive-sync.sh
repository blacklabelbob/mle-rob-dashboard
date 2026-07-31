#!/bin/bash
# meeting-archive-sync.sh — keep the Notion "📞 Master Meetings Database" complete WITHOUT a human.
#
# WHY THIS FILE EXISTS (2026-07-30, Q84 inc.7):
#   Q84 inc.1 filled the archive and proved the sync idempotent (a second run plans 0/0/0).
#   But it was proved by ME typing `npm run sync:meetings -- --apply`. The Fireflies PULL is on a
#   30-minute launchd timer (com.aivoicetech.meeting-intake); the ARCHIVE half was scheduled
#   nowhere. So the DoD sentence "the live database carrying every recorded meeting" was true at
#   the moment it was written and false the moment Rob's next call ended. That is the exact
#   failure meeting-intake.sh was itself written against: "a script nobody runs is
#   indistinguishable from a script nobody wrote."
#
# CR-3: the guaranteed step is CODE on a timer, not prose asking someone to remember.
#
# WHY A PENDING MARKER AND NOT "run it when a new transcript lands":
#   If the sync is only attempted on the run that pulls a new body, ONE failed attempt (Notion 5xx,
#   laptop asleep mid-write, expired key) strands that meeting out of the archive forever — the
#   next run sees zero new bodies and skips. The marker survives the failure, so the retry happens
#   on the next tick and every tick after until the write actually lands. Cleared only on success.
#
# WHAT IT WILL NOT DO: it passes --apply, and the sync itself is additive only — it never
#   overwrites a title a human chose, never invents a topic, never deletes a row, and touches no
#   money/signed/quoted/paid field. Nothing here writes to Supabase or the CRM.
#
# Usage:  meeting-archive-sync.sh            # sync only if the marker says work is pending
#         meeting-archive-sync.sh --force    # sync regardless (manual catch-up)

set -uo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MARKER="$REPO/MLE Internal Meetings/.notion-archive-pending"
# Overridable so the FAILURE path can be exercised for real without writing to Rob's actual
# inbox. An untested failure path is the one that fails.
LOG="${MEETING_INTAKE_LOG:-/Users/robertacheson/.claude/memory/meeting-intake.log}"
PINGS="${MEETING_INTAKE_PINGS:-/Users/robertacheson/.claude/memory/PING-INBOX.md}"
STAMP="$(date '+%Y-%m-%d %H:%M:%S')"

cd "$REPO" || { echo "[$STAMP] archive-sync FATAL: repo missing at $REPO" >> "$LOG"; exit 1; }

# The ledger half runs on EVERY tick, marker or not (Q84 inc.12). The count on Rob's row
# goes stale in BOTH directions: a new recording arrives (marker set), but also a human
# fills a row in the CRM and one of the 23 becomes explained — and that leaves no marker
# behind. Gating the check on the marker would only ever catch the first case.
#
# Safe to run every 30 minutes because an unchanged run now writes NOTHING: the route
# compares what this run says against what the row already says and declines the write,
# so `notified_at` no longer moves on a timer. See lib/flags/supersede.ts.
check_ledger() {
  local out rc
  out=$(node --import ./scripts/ts-loader.mjs scripts/notion-crm-check.mjs --flag 2>&1)
  rc=$?
  if [ $rc -ne 0 ]; then
    # Quiet on purpose: the archive itself is intact, only the count on the ledger is
    # older than it should be. That is a log line, not a 3am ping.
    echo "[$STAMP] archive-check FAILED rc=$rc — ledger count may be stale, retrying next tick" >> "$LOG"
    echo "$out" | tail -10 >> "$LOG"
    return 0
  fi
  echo "[$STAMP] archive-check ok — $(echo "$out" | grep -E '^--flag:' | tail -1)" >> "$LOG"
}

if [ "${1:-}" != "--force" ] && [ ! -f "$MARKER" ]; then
  check_ledger
  exit 0   # nothing pulled since the last successful archive write; no sync needed.
fi

OUT=$(node --import ./scripts/ts-loader.mjs scripts/notion-meetings-sync.mjs --apply 2>&1)
RC=$?

if [ $RC -ne 0 ]; then
  # Keep the marker. A failed archive write must be retried, not forgotten.
  echo "[$STAMP] archive-sync FAILED rc=$RC — marker kept, will retry next tick" >> "$LOG"
  echo "$OUT" | tail -20 >> "$LOG"
  echo "- 🔴 NOTION ARCHIVE SYNC FAILED $STAMP (rc=$RC) — recorded meetings are on disk but NOT in the Master Meetings Database. Retrying every 30 min. See ~/.claude/memory/meeting-intake.log" \
    >> "$PINGS"
  exit $RC
fi

rm -f "$MARKER"
APPLIED=$(echo "$OUT" | grep -E '^Applied:' | tail -1)
echo "[$STAMP] archive-sync ok — ${APPLIED:-no writes needed}" >> "$LOG"

# The archive just grew, so the "only a human who was in the room can close this" count is
# the one number most likely to have moved. Check AFTER the sync, never before.
check_ledger
exit 0
