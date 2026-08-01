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

import { readHostConfirmPayload, type HostConfirm } from "./hostConfirm";

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
  /** The control's own words. A link and a button do not say the same thing. */
  label: string;
  tooltip: string;
  /** Where a non-`here` control sends the reader. `null` on a `here` control — it writes. */
  href: string | null;
};

/**
 * The controls a row renders on the page it is being read on.
 *
 * @param payload the row's raw `flags.payload` — `unknown`, straight off jsonb. NULL on every
 *   prod row today (0035 is PENDING), which is why this returns `[]` and the ledger renders
 *   exactly as it does now until the push lands.
 * @param pageId the record id of the page being read, or `null` on the Overview digest, where
 *   there is no org page to be "on" and therefore no writable action.
 */
export function hostConfirmControls(payload: unknown, pageId: string | null): HostConfirmControl[] {
  const graded = readHostConfirmPayload(payload);
  if (!graded) return [];
  return graded.actions.map((a) => control(a, pageId));
}

function control(a: HostConfirm, pageId: string | null): HostConfirmControl {
  const here = !!pageId && pageId === a.orgId;
  if (here) {
    return {
      host: a.host,
      orgId: a.orgId,
      here: true,
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
    label: `${a.host} → ${a.orgId}`,
    // Says why it is a link and not a button, so a reader on the wrong page is not left
    // wondering where the control went.
    tooltip: `Confirm this on ${a.orgId}'s own page, where the Domain field it changes is on screen.`,
    href: `/companies/${a.orgId}`,
  };
}
