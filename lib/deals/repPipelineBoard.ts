// Q46 R3 (rep cockpit wiring, research §5) — the pure seam that turns the
// company's deal list into ONE REP'S pipeline board, with each card carrying
// the stage age it is tinted by.
//
// ONE CLOCK, ONE OWNERSHIP RULE, BORROWED — NEVER RE-DERIVED. The tint reads
// `stageAgeOf` (the same function `stage_aging` fires on, extracted in this
// increment) and the owner reads `ownerOf` (R2's rule). A board with its own
// copy of either would eventually call a deal healthy on the day the Today
// band demands a touch, or hand a rep an account their band says is someone
// else's — and nothing on either screen could say which was right.
//
// THE TINT HAS THREE STATES, NEVER TWO. `over` and `within` are judgements the
// threshold table actually made; `untimed` is a stage nobody ever set a limit
// for (new_lead, meeting_held, signed …). Rendering `untimed` as green invents
// an all-clear out of an absent rule — the same defect R2's `repBandState`
// exists to prevent one layer up.
//
// A TINT MUST NEVER IMPLY A QUEUE ITEM THAT WILL NOT APPEAR. `whoDoITouchToday`
// drops every `demo-*` row (Q4 precedent) while this cockpit runs on Jake
// Torres (DEMO), so an `over` demo card is real aging that the Today band will
// never list. That divergence is recorded per card as `surfacedInToday`, so
// the surface can say so rather than leave a rep hunting a band row that does
// not exist.

import type { Deal, DealStage, Org, Person } from "../types";
import { ownerOf, normalizeRep } from "../tasks/repTodayBand";
import { stageAgeOf, type StageAge } from "../tasks/todayRules";
import type { Activity } from "../types";

/**
 * The columns a rep works. Deliberately the OPEN ladder only: `paid`,
 * `invoiced`, `delivering`, `stalled` and `lost` are outcomes, not pipeline,
 * and a board that mixed them would let closed money inflate an open-pipeline
 * total. Nothing is dropped silently — everything of the rep's that is off the
 * board is counted in `offBoard`.
 */
export const REP_PIPELINE_STAGES = [
  "new_lead",
  "contacted",
  "meeting_booked",
  "meeting_held",
  "quote_sent",
  "negotiating",
  "signed",
] as const satisfies readonly DealStage[];

export type RepPipelineStage = (typeof REP_PIPELINE_STAGES)[number];

/** `untimed` = the stage carries no threshold. NOT a synonym for healthy. */
export type StageTint = "over" | "within" | "untimed";

export interface RepPipelineCard {
  deal: Deal;
  /** Undefined exactly when `tint === "untimed"`. */
  age?: StageAge;
  tint: StageTint;
  /** True when this deal is provably the rep's; false = recorded to nobody. */
  mine: boolean;
  /**
   * False when the Today engine excludes this row (`demo-*`), so an `over`
   * tint here will never have a matching band item. Stated, never hidden.
   */
  surfacedInToday: boolean;
}

export interface RepPipelineColumn {
  stage: RepPipelineStage;
  cards: RepPipelineCard[];
  /** Cards at or past their limit. Never includes `untimed`. */
  overCount: number;
  /** Sum of `deal.value` for this column. Deals with no value add nothing. */
  value: number;
  /** How many cards carry no `value` — so a total is never read as complete. */
  valueUnknownCount: number;
}

export interface RepPipelineBoard {
  columns: RepPipelineColumn[];
  /** Deals proven to belong to a different rep. A count, never their rows. */
  othersCount: number;
  /** The rep's (or nobody's) deals sitting in a stage this board omits. */
  offBoardCount: number;
  /** Cards anchored only to rows recording no rep, across all columns. */
  unattributableCount: number;
}

const isDemoRow = (id: string | undefined) => !!id && id.startsWith("demo-");

/** Mirrors `stageAgingItems`' exclusion exactly — same three anchors. */
function reachesTodayEngine(deal: Deal): boolean {
  return !isDemoRow(deal.id) && !isDemoRow(deal.personId) && !isDemoRow(deal.orgId);
}

/**
 * Build one rep's pipeline board.
 *
 * Unowned deals are KEPT and flagged (`mine: false`), for R2's reason: work
 * recorded to nobody is real, and a board that hides it is why it never gets
 * worked. Another rep's deals are counted only. A blank `rep` matches nothing
 * rather than everything unassigned — a missing rep name is not a rep.
 *
 * Column order is the ladder above; within a column, oldest-in-stage first
 * (untimed cards last, since they have no age to rank by), then deal id, so
 * two runs on the same input match exactly.
 */
export function repPipelineBoard(
  deals: Deal[],
  rep: string,
  today: string,
  book: { people?: Person[]; orgs?: Org[]; activities?: Activity[] } = {}
): RepPipelineBoard {
  const me = normalizeRep(rep);
  const people = new Map((book.people ?? []).map((p) => [p.id, p]));
  const orgs = new Map((book.orgs ?? []).map((o) => [o.id, o]));
  const activities = book.activities ?? [];

  const onBoard = new Set<string>(REP_PIPELINE_STAGES);
  const byStage = new Map<RepPipelineStage, RepPipelineCard[]>(
    REP_PIPELINE_STAGES.map((s) => [s, []])
  );

  let othersCount = 0;
  let offBoardCount = 0;
  let unattributableCount = 0;

  for (const deal of deals) {
    const owner = ownerOf(deal, people, orgs);
    if (owner !== "unowned" && owner.rep !== me) {
      othersCount += 1;
      continue;
    }
    // A blank `rep` needs no separate branch: `owner.rep` is non-empty by
    // construction, so every owned deal fails `owner.rep !== me` above and
    // nothing reaches `mine` — a missing rep name is not a rep.
    if (!onBoard.has(deal.stage)) {
      offBoardCount += 1;
      continue;
    }
    const age = stageAgeOf(deal, today, activities);
    const card: RepPipelineCard = {
      deal,
      ...(age ? { age } : {}),
      tint: age ? (age.over ? "over" : "within") : "untimed",
      mine: owner !== "unowned",
      surfacedInToday: reachesTodayEngine(deal),
    };
    if (!card.mine) unattributableCount += 1;
    byStage.get(deal.stage as RepPipelineStage)!.push(card);
  }

  const columns: RepPipelineColumn[] = REP_PIPELINE_STAGES.map((stage) => {
    const cards = byStage.get(stage)!;
    cards.sort(
      (a, b) =>
        (b.age?.days ?? -Infinity) - (a.age?.days ?? -Infinity) ||
        a.deal.id.localeCompare(b.deal.id)
    );
    return {
      stage,
      cards,
      overCount: cards.filter((c) => c.tint === "over").length,
      value: cards.reduce((sum, c) => sum + (c.deal.value ?? 0), 0),
      valueUnknownCount: cards.filter((c) => c.deal.value == null).length,
    };
  });

  return { columns, othersCount, offBoardCount, unattributableCount };
}
