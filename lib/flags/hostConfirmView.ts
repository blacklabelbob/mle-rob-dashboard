// Q84 inc.73 — the READER. inc.71 built the channel and inc.72 proved its shape against the
// row it exists for; both ends now exist and agree, and only the rendering sat between them.
//
// WHAT THIS DECIDES, AND WHY IT IS NOT INSIDE THE COMPONENT. A payload can carry an action for
// an org that is not the page being read. #133 is ONE finding filed against no record, sitting
// on BOTH `/companies/C-2017` and `/companies/C-2018` (inc.26/inc.28), and it carries an action
// for each. So "render a Confirm button per action" is wrong on its face: on C-2017's page the
// C-2018 action must not offer a write, because inc.69's whole answer was that the undo belongs
// where the field is on screen — a button on C-2017 that edits C-2018 is exactly the write to a
// record that is not even rendered which inc.69 refused.
//
// THE RULE, one sentence: an action writes only on its OWN org's page; everywhere else it is a
// way to GET to that page. Same finding, same two actions, different affordance per page — and
// the affordance is decided here, in a pure module, so the ledger cannot grow a second opinion.
//
// Pure per CR-3: no clock, no network, no Supabase, no React.

import { WITHIN_ARCHIVE_CHECK } from "@/lib/meetings/archiveCadence";
import { readHostConfirmPayload, type HostConfirm } from "./hostConfirm";
import { scopeHostConfirmPayload } from "./payloadScope";

/**
 * One rendered control.
 *
 * @property here `true` when this page IS the org the action writes to — the only state that
 *   may render a button. `false` renders a link to the org's page and nothing else.
 */
export type HostConfirmControl = {
  host: string;
  orgId: string;
  here: boolean;
  /**
   * Q84 inc.75 — this exact write already succeeded, so the control is a STATEMENT, not an
   * offer. `true` only ever on a `here` control: a link is navigation and cannot have written
   * anything. Never renders as a button — see `hostConfirmControls`.
   */
  done: boolean;
  /** The control's own words. A link, a button and a done state do not say the same thing. */
  label: string;
  tooltip: string;
  /** Where a non-`here` control sends the reader. `null` on a `here` control — it writes. */
  href: string | null;
};

/**
 * Q84 inc.75 — the ONE spelling of "this action" that the view and its caller share.
 *
 * The component records what it wrote and this module decides what that means; if they spelled
 * the pair differently the done state would silently never match, and the failure would look
 * exactly like the bug it fixes. Host and org are both already graded by the codec, so this is
 * a join, not a normaliser.
 */
export function hostConfirmKey(host: string, orgId: string): string {
  // A space cannot occur in either half — org ids are `C-<digits>` and `extractHost` never
  // returns whitespace — so the join is unambiguous without escaping.
  return [orgId, host].join(" ");
}

/**
 * Q84 inc.102 — the row a payload is being read OFF, for scope.
 *
 * The same three fields `scopeHostConfirmPayload` grades against at the POST, in the same
 * order, because they are the same question asked at the other end of the seam.
 */
export type HostConfirmRow = {
  title?: string | null;
  detail?: string | null;
  /** The record the row is FILED on — `entity_id`, not the page being read. */
  entityId?: string | null;
};

/**
 * The controls a row renders on the page it is being read on.
 *
 * @param payload the row's raw `flags.payload` — `unknown`, straight off jsonb. NULL on every
 *   prod row today (0035 is PENDING), which is why this returns `[]` and the ledger renders
 *   exactly as it does now until the push lands.
 * @param pageId the record id of the page being read, or `null` on the Overview digest, where
 *   there is no org page to be "on" and therefore no writable action.
 * @param written Q84 inc.75 — `hostConfirmKey` for every action whose write the caller has
 *   SEEN succeed. Omit it and every control behaves exactly as it did in inc.73.
 * @param row Q84 inc.102 — the row's own title/detail/`entity_id`, so an action pointing at an
 *   org this finding cannot reach is dropped HERE too, not only at the POST that inc.101 gated.
 *   Omit it and every control behaves exactly as it did in inc.73 — the reader is unchanged for
 *   any caller that has not been taught the row.
 */
export function hostConfirmControls(
  payload: unknown,
  pageId: string | null,
  written: readonly string[] = [],
  row?: HostConfirmRow,
): HostConfirmControl[] {
  // Q84 inc.102 — inc.101 put the scope rule on ONE door: `POST /api/admin/flags`. Two paths
  // reach a stored payload without ever passing it: the ~133 rows written before that rule
  // existed, and any other writer of the column. On both, an out-of-scope action survives to
  // here — and by inc.73's rule it can never be `here` (a row reaches a page only by being
  // filed on it or naming it, inc.26), so it renders as a LINK into a page where the finding
  // Rob clicked from does not appear. inc.37/inc.81's dead end, one door further in.
  //
  // The same function the POST calls, never a second copy of the ladder (inc.4/inc.5) — the
  // two ends of the seam cannot drift into two opinions about what a row reaches. Dropping,
  // not refusing, for inc.101's reason: the pinned failure direction is "Rob sees the finding
  // without the shortcut", never "Rob loses the finding", and what is dropped here was only
  // ever an unclickable link.
  const scoped = row
    ? scopeHostConfirmPayload(row.title, row.detail, row.entityId, payload).payload
    : payload;
  const graded = readHostConfirmPayload(scoped);
  if (!graded) return [];
  const done = new Set(written);
  return graded.actions.map((a) => control(a, pageId, done));
}

function control(a: HostConfirm, pageId: string | null, written: ReadonlySet<string>): HostConfirmControl {
  const here = !!pageId && pageId === a.orgId;
  if (here) {
    // Q84 inc.75 — the write already landed. The payload cannot know that (it is re-minted by
    // the next `check:archive` run, up to `ARCHIVE_CHECK_CEILING_MINUTES` away), so the caller's observation is the
    // only evidence there is, and it is only ever about the page it is on.
    if (written.has(hostConfirmKey(a.host, a.orgId))) {
      return {
        host: a.host,
        orgId: a.orgId,
        here: true,
        done: true,
        label: `Domain set to ${a.host}`,
        // Says the two things a reader would otherwise have to guess: the finding is still
        // open because closing it is Rob's call (inc.73), and the control goes away on its own.
        //
        // Q84 inc.79 — "goes away on its own" now says WHEN. The paragraph above this control
        // has carried the ceiling since inc.78; the control that produced the write did not, so
        // one reader got a dated promise and an open-ended one about the same 30 minutes. Same
        // refusals as inc.78: a CEILING, never a countdown, and never a clock time — this module
        // has no clock (CR-3), and the number is the plist's, read from one place.
        tooltip:
          `Written — this company's Domain is ${a.host}. The finding stays open on purpose: ` +
          "whether it is settled is your call on Resolve. The next archive check drops this " +
          `control, ${WITHIN_ARCHIVE_CHECK}.`,
        href: null,
      };
    }
    return {
      host: a.host,
      orgId: a.orgId,
      here: true,
      done: false,
      // Names the field it fills, because the point of confirming HERE is that the field is on
      // screen with its old value one click away (inc.69).
      label: `Set Domain to ${a.host}`,
      tooltip:
        `Writes ${a.host} into this company's Domain field. The server re-checks that no other ` +
        "record already resolves by it and refuses if one does — nothing is overwritten.",
      href: null,
    };
  }
  return {
    host: a.host,
    orgId: a.orgId,
    here: false,
    // A link wrote nothing, so it can never claim it did — whatever the caller passed in.
    done: false,
    label: `${a.host} → ${a.orgId}`,
    // Says why it is a link and not a button, so a reader on the wrong page is not left
    // wondering where the control went.
    tooltip: `Confirm this on ${a.orgId}'s own page, where the Domain field it changes is on screen.`,
    href: `/companies/${a.orgId}`,
  };
}
