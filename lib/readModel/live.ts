import { createClient } from "@supabase/supabase-js";
import { todayInET } from "../integrity/overdue";
import { fetchPanels, type PanelsPayload, type ViewReader } from "./source";

// PRD Task MC.12 — the ONE place the panels get real rows, shared by the
// /api/panels route and the /ops page so the two can never read the world
// differently. Everything about WHICH relations may be touched still lives in
// source.ts (MC.8 posture); this module only supplies the connection.

/** Config is missing, not broken — the caller renders that as its own state. */
export type PanelsUnconfigured = {
  ok: false;
  reason: string;
};

export type PanelsLoaded = { ok: true; payload: PanelsPayload };

export function supabaseViewReader(url: string, key: string): ViewReader {
  const client = createClient(url, key, { auth: { persistSession: false } });
  return async (view, columns) => {
    const res = await client.from(view).select(columns);
    return {
      // supabase-js types a dynamic column string as GenericStringError[];
      // the runtime value is the row array, hence the two-step cast.
      rows: (res.data ?? []) as unknown as Record<string, unknown>[],
      error: res.error ? res.error.message : null,
    };
  };
}

/** Read every panel from prod, or say why we couldn't even try. */
export async function loadLivePanels(
  now: Date = new Date()
): Promise<PanelsLoaded | PanelsUnconfigured> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.STORAGE_SOURCE !== "supabase" || !url || !key) {
    return {
      ok: false,
      reason:
        "read models live in Postgres — set STORAGE_SOURCE=supabase with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
    };
  }
  return {
    ok: true,
    payload: await fetchPanels(supabaseViewReader(url, key), todayInET(now)),
  };
}
