import type { StorageAdapter } from "./adapter";

// Placeholders for the Phase 1 storage decision (docs/STORAGE-DECISION.md).
// Each becomes real by implementing the three methods — the app never changes.
function notConfigured(name: string): StorageAdapter {
  const fail = () =>
    Promise.reject(
      new Error(
        `${name} store not configured yet — see docs/STORAGE-DECISION.md. ` +
          `Set STORAGE_SOURCE=file to keep moving (no-stall rule).`
      )
    );
  return { name, getNetwork: fail, upsertPerson: fail, upsertProject: fail };
}

export const sheetsStore = notConfigured("google-sheets");
export const airtableStore = notConfigured("airtable");
// supabase graduated to a real adapter: lib/storage/supabaseStore.ts (Rob's 2026-07-04 call)
