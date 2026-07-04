import type { StorageAdapter } from "./adapter";
import { fileStore } from "./fileStore";
import { airtableStore, sheetsStore, supabaseStore } from "./stubs";

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
function withFallback(primary: StorageAdapter): StorageAdapter {
  if (primary === fileStore) return primary;
  return {
    name: `${primary.name}→file-fallback`,
    async getNetwork() {
      try {
        return await primary.getNetwork();
      } catch (err) {
        console.error(
          `[storage] ${primary.name} read failed — serving file fallback (no-stall rule):`,
          err
        );
        return fileStore.getNetwork();
      }
    },
    upsertPerson: (p) => primary.upsertPerson(p),
    upsertProject: (p) => primary.upsertProject(p),
  };
}

export function getStore(): StorageAdapter {
  return withFallback(stores[SOURCE] ?? fileStore);
}
