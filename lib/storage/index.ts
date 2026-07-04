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

export function getStore(): StorageAdapter {
  return stores[SOURCE] ?? fileStore;
}
