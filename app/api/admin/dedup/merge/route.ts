import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  planPersonMerge,
  type MergeEdge,
  type MergeMembership,
  type MergePerson,
} from "@/lib/dedup/merge";
import {
  countOrphans,
  runMergePlan,
  type MergeDb,
  type OrphanDb,
} from "@/lib/dedup/executor";

// Person-merge executor endpoint (PRD Task 4.2). POST { survivorId,
// duplicateId, dryRun? } — loads the pair + every row referencing either,
// plans via the pure planner (lib/dedup/merge.ts), and runs the ops in order.
// dryRun returns the plan without touching anything. Blockers (money-carrying
// duplicate, demo rows, same id) come back 409 — the planner refuses, this
// route never overrides it. Merging is ALWAYS an explicit call; nothing here
// is invoked by crons or the detector.

export const dynamic = "force-dynamic";

function db() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("merge api: supabase env not set");
  return createClient(url, key, { auth: { persistSession: false } });
}

export async function POST(req: NextRequest) {
  let body: { survivorId?: unknown; duplicateId?: unknown; dryRun?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON body" }, { status: 400 });
  }
  const { survivorId, duplicateId } = body;
  if (
    typeof survivorId !== "string" ||
    !survivorId.trim() ||
    typeof duplicateId !== "string" ||
    !duplicateId.trim()
  ) {
    return NextResponse.json(
      { error: "need { survivorId, duplicateId, dryRun? }" },
      { status: 400 }
    );
  }

  const client = db();
  const { data: people, error: pErr } = await client
    .from("people")
    .select("*")
    .in("id", [survivorId, duplicateId]);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  const survivor = (people ?? []).find((p) => p.id === survivorId) as MergePerson | undefined;
  const duplicate = (people ?? []).find((p) => p.id === duplicateId) as MergePerson | undefined;
  const missing = [!survivor && survivorId, !duplicate && duplicateId].filter(Boolean);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `person not found: ${missing.join(", ")}` },
      { status: 404 }
    );
  }

  const idList = `(${survivorId},${duplicateId})`;
  const [edgesRes, membershipsRes] = await Promise.all([
    client
      .from("edges")
      .select("id,from_id,to_id")
      .or(`from_id.in.${idList},to_id.in.${idList}`),
    client
      .from("org_memberships")
      .select("person_id,org_id")
      .in("person_id", [survivorId, duplicateId]),
  ]);
  if (edgesRes.error)
    return NextResponse.json({ error: edgesRes.error.message }, { status: 500 });
  if (membershipsRes.error)
    return NextResponse.json({ error: membershipsRes.error.message }, { status: 500 });

  const plan = planPersonMerge({
    survivor: survivor!,
    duplicate: duplicate!,
    edges: (edgesRes.data ?? []) as MergeEdge[],
    memberships: (membershipsRes.data ?? []) as MergeMembership[],
    now: new Date().toISOString(),
  });
  if (!plan.ok) {
    return NextResponse.json({ ok: false, blockers: plan.blockers }, { status: 409 });
  }
  if (body.dryRun === true) {
    return NextResponse.json({ ok: true, dryRun: true, ops: plan.ops, folds: plan.folds });
  }

  // Structural casts: the supabase client satisfies these slices, but its
  // deep generics blow TS's instantiation limit if checked directly.
  const run = await runMergePlan(client as unknown as MergeDb, plan.ops);
  if (!run.ok) {
    // Partial state surfaced honestly; the plan's op ordering makes a re-POST
    // of the same pair the recovery path (see lib/dedup/executor.ts).
    return NextResponse.json(
      { ok: false, completed: run.completed, failedOp: run.failedOp, error: run.error },
      { status: 500 }
    );
  }

  const orphans = await countOrphans(client as unknown as OrphanDb, duplicateId);
  return NextResponse.json({
    ok: true,
    merged: { survivorId, duplicateId },
    completed: run.completed,
    folds: plan.folds,
    orphans, // total must be 0 — the Task 4.2 zero-orphan DoD gate, live
  });
}
