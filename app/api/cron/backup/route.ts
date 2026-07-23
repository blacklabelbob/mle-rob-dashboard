import { NextRequest, NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { verifyCronAuth } from "@/lib/dedup/detector";
import {
  BACKUP_TABLES,
  BACKUP_ORDER_KEY,
  BACKUP_BUCKET,
  BACKUP_FAIL_TITLE,
  backupFailDetail,
  backupObjectName,
  buildSnapshot,
  verifySnapshot,
} from "@/lib/integrity/backup";

// Nightly backup with verification (PRD Task MC.16, absorbs base Task 1.6).
// Same bearer contract as the other n8n-fired crons (Vercel Hobby's 2-cron cap):
// CRON_SECRET unset → 503 inert, wrong bearer → 401. Flow: page every table's
// rows → snapshot JSON → upload dated object + latest.json to the private
// `backups` storage bucket → re-download the dated object → verify against
// INDEPENDENT head-counts (lib/integrity/backup.ts, CR-3). Verification
// failure files ONE high flag (deduped on open title) — findings protocol.
// Read-only against all data tables; writes touch only storage + flags.

export const dynamic = "force-dynamic";

const PAGE = 1000; // Supabase per-request row cap; page until a short page.

async function fetchAll(client: SupabaseClient, table: (typeof BACKUP_TABLES)[number]) {
  const rows: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client
      .from(table)
      .select("*")
      .order(BACKUP_ORDER_KEY[table], { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data ?? []));
    if ((data ?? []).length < PAGE) return rows;
  }
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "cron disabled: CRON_SECRET not set" },
      { status: 503 }
    );
  }
  if (!verifyCronAuth(req.headers.get("authorization"), secret)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "supabase env not set" }, { status: 503 });
  }
  const client = createClient(url, key, { auth: { persistSession: false } });

  const takenAt = new Date().toISOString();
  const problems: string[] = [];
  let objectName = "";
  let counts: Record<string, number> = {};

  try {
    // 1) Row fetch (paged) for the snapshot body.
    const tables: Record<string, unknown[]> = {};
    for (const t of BACKUP_TABLES) tables[t] = await fetchAll(client, t);
    const snapshot = buildSnapshot(tables, takenAt);
    counts = snapshot.counts;

    // 2) Upload dated object + latest.json restore pointer.
    objectName = backupObjectName(takenAt);
    const body = JSON.stringify(snapshot);
    for (const name of [objectName, "latest.json"]) {
      const { error } = await client.storage
        .from(BACKUP_BUCKET)
        .upload(name, body, { contentType: "application/json", upsert: true });
      if (error) throw new Error(`upload ${name}: ${error.message}`);
    }

    // 3) Independent head-counts (not derived from the row fetch).
    const liveCounts: Record<string, number> = {};
    for (const t of BACKUP_TABLES) {
      const { count, error } = await client
        .from(t)
        .select("*", { count: "exact", head: true });
      if (error) throw new Error(`count ${t}: ${error.message}`);
      liveCounts[t] = count ?? 0;
    }

    // 4) Re-download what we stored and verify THAT copy.
    const { data: blob, error: dlErr } = await client.storage
      .from(BACKUP_BUCKET)
      .download(objectName);
    if (dlErr || !blob) throw new Error(`download: ${dlErr?.message ?? "no data"}`);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await blob.text());
    } catch {
      parsed = null; // verifySnapshot reports the shape problem
    }
    const verdict = verifySnapshot(parsed, liveCounts);
    problems.push(...verdict.problems);
  } catch (e) {
    problems.push(e instanceof Error ? e.message : String(e));
  }

  if (problems.length > 0) {
    // Findings protocol: one high flag, deduped on the open title so a broken
    // night doesn't spam the ledger on retries.
    const { data: existing } = await client
      .from("flags")
      .select("id")
      .eq("title", BACKUP_FAIL_TITLE)
      .eq("status", "open")
      .limit(1);
    if (!existing || existing.length === 0) {
      await client.from("flags").insert({
        entity_id: null,
        entity_name: "CRM backup",
        title: BACKUP_FAIL_TITLE,
        detail: backupFailDetail(problems, takenAt),
        severity: "high",
      });
    }
    return NextResponse.json(
      { ok: false, takenAt, objectName: objectName || null, problems },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true, takenAt, objectName, verified: true, counts });
}
