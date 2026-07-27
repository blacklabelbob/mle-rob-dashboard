import { createClient } from "@supabase/supabase-js";
import type { OrgProposalFlag, ProposalSink } from "./orgProposal";

// The one impure edge of Q69 inc.3: proposals land on the SAME `flags` table
// (0004) the ledger's "Things to Address" already renders, through the same
// shape /api/admin/flags POSTs. No new table, no second queue to look at.
//
// Returns null when Supabase env is absent (file-store dev, tests): the caller
// logs the proposal instead of pretending it queued. A silent write-nowhere is
// exactly the failure this item is fixing.
export function supabaseProposalSink(env: NodeJS.ProcessEnv = process.env): ProposalSink | null {
  const url = env.SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const db = createClient(url, key, { auth: { persistSession: false } });
  return {
    async existingTitles(titles: string[]): Promise<string[]> {
      const { data, error } = await db.from("flags").select("title").in("title", titles);
      // An unreadable ledger must not be read as "nothing queued yet" — that
      // turns one outage into a duplicate flag per email received during it.
      if (error) throw new Error(`org proposal dedupe failed: ${error.message}`);
      return (data ?? []).map((r) => r.title as string);
    },
    async insert(flags: OrgProposalFlag[]): Promise<void> {
      const { error } = await db.from("flags").insert(
        flags.map((f) => ({
          entity_id: f.entityId,
          entity_name: f.entityName,
          title: f.title,
          detail: f.detail,
          severity: f.severity,
        }))
      );
      if (error) throw new Error(`org proposal insert failed: ${error.message}`);
    },
  };
}
