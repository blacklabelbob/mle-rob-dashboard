import type { StorageAdapter } from "./adapter";
import { fileStore } from "./fileStore";
import { airtableStore, sheetsStore } from "./stubs";
import { supabaseStore } from "./supabaseStore";

// THE one-line swap: set STORAGE_SOURCE in .env to change where data lives.
const SOURCE = process.env.STORAGE_SOURCE ?? "file";

const stores: Record<string, StorageAdapter> = {
  file: fileStore,
  sheets: sheetsStore,
  airtable: airtableStore,
  supabase: supabaseStore,
};

// The no-stall rule, enforced in code: if the chosen store fails a READ for any
// reason (not configured, credentials revoked, service down), fall back to the
// file store so the dashboard always renders. Writes do NOT silently fall back —
// writing to the wrong store would fork the data; they fail loudly instead.
// Sticky per-instance flag: true after any read fell back to the file store,
// cleared by the next successful primary read. Best-effort (per serverless
// instance), used only to warn in the UI — never for data decisions.
let fallbackServed = false;

// What the UI should disclose about where data comes from right now.
// "configured" = STORAGE_SOURCE is the file store itself; "fallback" = the
// real store failed a read and stale file data was served instead.
export function servingFileData(): "configured" | "fallback" | null {
  if (SOURCE === "file" || !stores[SOURCE]) return "configured";
  return fallbackServed ? "fallback" : null;
}

function withFallback(primary: StorageAdapter): StorageAdapter {
  if (primary === fileStore) return primary;
  // Same no-stall rule for every read; writes never fall back (data fork risk).
  function fallbackRead<A extends unknown[], R>(
    read: (store: StorageAdapter) => (...args: A) => Promise<R>
  ): (...args: A) => Promise<R> {
    return async (...args: A) => {
      try {
        const data = await read(primary)(...args);
        fallbackServed = false;
        return data;
      } catch (err) {
        console.error(
          `[storage] ${primary.name} read failed — serving file fallback (no-stall rule):`,
          err
        );
        fallbackServed = true;
        return read(fileStore)(...args);
      }
    };
  }
  return {
    name: `${primary.name}→file-fallback`,
    getNetwork: fallbackRead((s) => s.getNetwork.bind(s)),
    listDeals: fallbackRead((s) => s.listDeals.bind(s)),
    listActivities: fallbackRead((s) => s.listActivities.bind(s)),
    listTasks: fallbackRead((s) => s.listTasks.bind(s)),
    upsertPerson: (p) => primary.upsertPerson(p),
    upsertProject: (p) => primary.upsertProject(p),
    upsertDeal: (d) => primary.upsertDeal(d),
    upsertActivity: (a) => primary.upsertActivity(a),
    upsertTask: (t) => primary.upsertTask(t),
  };
}

export function getStore(): StorageAdapter {
  return withFallback(stores[SOURCE] ?? fileStore);
}
