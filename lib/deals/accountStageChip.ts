// Q46 R5 (rep cockpit wiring, research §5 Δ5) — the pure seam behind the deal
// stage chip on the rep's account workspace.
//
// The workspace is anchored on a PERSON; a stage belongs to a DEAL. Resolving
// one from the other is the whole job here, and every way of getting it wrong
// writes to a money-bearing row, so the resolution is a decision this module
// makes once rather than a `deals.find(...)` written at the call site.
//
// FOUR RULES, EACH OF THEM A REFUSAL:
//
//  1. THE ANCHOR IS `personId`, AND NOTHING ELSE. A deal reached only through
//     the person's org is the ORG's deal — on a page titled with one person's
//     name, adopting it would put a colleague's pipeline under this rep's hand.
//     Those deals are counted (`orgOnlyCount`) so the surface can say they
//     exist without claiming them.
//
//  2. NO DEAL ROW MEANS NO CHIP — NEVER A DERIVED ONE. `app/rep/accounts/[id]`
//     already synthesises `stage: person.signed ? "signed" : "quote_sent"` to
//     feed `buildBlueprint`. That value is a projection of two key dates, not a
//     stage anybody set, and drawing it in a chip beside a real one would make
//     a guess indistinguishable from a record — and then offer to WRITE from
//     it. `no-deal` renders as itself.
//
//  3. TWO DEALS ARE NOT A DEAL. Picking the first, the newest, or the biggest
//     means a rep moves a deal they were not looking at. `ambiguous` carries
//     every match so the surface can list them and move none.
//
//  4. A CLOSED-MONEY STAGE IS READ-ONLY HERE. The ladder offered is exactly
//     `REP_PIPELINE_STAGES` — the rep board's open ladder — so `paid`,
//     `invoiced`, `delivering`, `stalled` and `lost` are unreachable by
//     construction rather than by a check someone can forget. A deal already
//     sitting in one of those shows its stage and says why it cannot be moved
//     from here: dragging `paid` back to `negotiating` from a rep screen is a
//     money edit wearing a pipeline costume.

import type { Deal, DealStage, Person } from "../types";
import { REP_PIPELINE_STAGES, type RepPipelineStage } from "./repPipelineBoard";

/** A stage a rep may move a deal INTO from this surface. */
export function isRepMovableStage(stage: DealStage): stage is RepPipelineStage {
  return (REP_PIPELINE_STAGES as readonly DealStage[]).includes(stage);
}

/** The minimum a surface needs to name a deal it is deliberately NOT touching. */
export interface StageChipDealRef {
  id: string;
  name: string;
  stage: DealStage;
}

export type AccountStageChip =
  | {
      kind: "no-deal";
      /** Deals reached only through the person's org — named, never adopted. */
      orgOnlyCount: number;
    }
  | {
      kind: "ambiguous";
      deals: StageChipDealRef[];
      orgOnlyCount: number;
    }
  | {
      kind: "one";
      deal: StageChipDealRef;
      /** `false` for closed-money / outcome stages — rule 4. */
      movable: boolean;
      /** Present exactly when `movable` is false. Rendered, never swallowed. */
      frozenReason?: string;
      /** The ONLY stages this surface may write. Empty when not movable. */
      ladder: readonly RepPipelineStage[];
      orgOnlyCount: number;
    };

/**
 * Resolve the stage chip for one person's account workspace.
 *
 * Pure: no clock, no store, no env (CR-3). `deals` is the whole book; the
 * filtering rule lives here so both halves of rule 1 (what is claimed, what is
 * merely counted) are decided in one place.
 */
export function accountStageChip(
  person: Pick<Person, "id" | "orgId">,
  deals: Deal[],
): AccountStageChip {
  const mine = deals.filter((d) => d.personId === person.id);

  // Counted, never claimed. A deal anchored to the org this person belongs to
  // is real work — the surface says it exists rather than pretending it does
  // not, and rule 1 keeps it out of this rep's hand.
  const orgOnlyCount = person.orgId
    ? deals.filter((d) => d.personId !== person.id && d.orgId === person.orgId)
        .length
    : 0;

  if (mine.length === 0) return { kind: "no-deal", orgOnlyCount };

  if (mine.length > 1) {
    return {
      kind: "ambiguous",
      deals: mine.map(toRef),
      orgOnlyCount,
    };
  }

  const deal = mine[0];
  const movable = isRepMovableStage(deal.stage);
  return {
    kind: "one",
    deal: toRef(deal),
    movable,
    ...(movable
      ? {}
      : {
          frozenReason:
            "Closed or outcome stage — it moves from the deals page, not from a rep account.",
        }),
    ladder: movable ? REP_PIPELINE_STAGES : [],
    orgOnlyCount,
  };
}

function toRef(d: Deal): StageChipDealRef {
  return { id: d.id, name: d.name, stage: d.stage };
}
