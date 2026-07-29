import { promises as fs } from "fs";
import path from "path";
import type { Activity, Deal, NetworkData, Person, Project, Task } from "@/lib/types";
import type { ActivityFilter, StorageAdapter, TaskFilter } from "./adapter";

// Two network files, one seam (Q71 Phase 1). `network.json` is the COMMITTED
// scaffolding — it ships in the bundle and must stay free of real customer
// rows. `network.local.json` is gitignored, is what `scripts/regen-fallback.mjs`
// writes, and holds whatever real data a dev pulled down. Local wins on read
// when it exists; every write lands in local so the committed file is never
// mutated back into a PII carrier. Prod never has the local file (gitignored,
// so not bundled), so its read path is exactly what it was before.
// Dir is overridable for tests; all of it resolved per-call, not at module load.
function dataDir(): string {
  return process.env.NETWORK_DATA_DIR ?? path.join(process.cwd(), "data");
}

function committedNetworkPath(): string {
  return path.join(dataDir(), "network.json");
}

function localNetworkPath(): string {
  return path.join(dataDir(), "network.local.json");
}

// CRM rows live in their own file so network.json (and regen-fallback.mjs)
// keep their exact shape. Overridable so the contract test can point at a
// temp file; resolved per-call, not at module load.
//
// Q71 Phase 2 item 5: the SAME two-file seam as the network above, for the same
// reason. `crm.json` is committed synthetic scaffolding so a fresh clone gets a
// populated pipeline instead of an empty one that is indistinguishable from a
// broken adapter; `crm.local.json` is gitignored, wins on read, and is where
// every write lands — so no write path can turn the committed file back into a
// PII carrier. The local name is derived from the committed one rather than
// configured separately: two env vars that could point at different directories
// are two env vars that can disagree.
function crmPath(): string {
  return process.env.CRM_DATA_PATH ?? path.join(dataDir(), "crm.json");
}

// Exported so callers ASK where a write lands instead of re-deriving the
// ".local.json" rule — a second copy of that rule is a second thing that can
// drift out of step with the store it describes (the contract tests reset and
// read back through this).
export function localCrmPath(): string {
  return crmPath().replace(/\.json$/, ".local.json");
}

interface CrmData {
  deals: Deal[];
  activities: Activity[];
  tasks: Task[];
}

function shapeCrm(raw: string): CrmData {
  const parsed = JSON.parse(raw);
  return {
    deals: parsed.deals ?? [],
    activities: parsed.activities ?? [],
    tasks: parsed.tasks ?? [],
  };
}

async function readCrm(): Promise<CrmData> {
  for (const p of [localCrmPath(), crmPath()]) {
    try {
      return shapeCrm(await fs.readFile(p, "utf8"));
    } catch (err: unknown) {
      // Missing file = try the next one down. Anything else (bad JSON, perms)
      // is a real error: a half-written local overlay must fail loud, never
      // silently fall through to the committed demo rows and read as live data.
      if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
    }
  }
  // Neither file present = no CRM rows yet. Unchanged from before the seam.
  return { deals: [], activities: [], tasks: [] };
}

async function writeCrm(data: CrmData): Promise<void> {
  try {
    await fs.writeFile(localCrmPath(), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    // Same loud-fail rule as write() below: never a silent "saved".
    throw new Error(
      `file store is not writable here (read-only deploy?). ` +
        `Set STORAGE_SOURCE to a real store (docs/plans/sources/STORAGE-DECISION.md). Cause: ${
          err instanceof Error ? err.message : String(err)
        }`
    );
  }
}

function upsertById<T extends { id: string }>(arr: T[], item: T): void {
  const i = arr.findIndex((x) => x.id === item.id);
  if (i >= 0) arr[i] = item;
  else arr.push(item);
}

async function read(): Promise<NetworkData> {
  try {
    const raw = await fs.readFile(localNetworkPath(), "utf8");
    return JSON.parse(raw) as NetworkData;
  } catch (err: unknown) {
    // No local pull yet = serve the committed scaffolding. Anything else (bad
    // JSON, perms) is a real error and must not be masked by the fallback —
    // a half-written local file should fail loud, not silently serve stale data.
    if ((err as NodeJS.ErrnoException)?.code !== "ENOENT") throw err;
  }
  const raw = await fs.readFile(committedNetworkPath(), "utf8");
  return JSON.parse(raw) as NetworkData;
}

async function write(data: NetworkData): Promise<void> {
  try {
    await fs.writeFile(localNetworkPath(), JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    // Vercel's filesystem is read-only outside /tmp. Fail LOUD, never silent —
    // the caller must surface "not saved" to the user (see /api/estimate).
    throw new Error(
      `file store is not writable here (read-only deploy?). ` +
        `Set STORAGE_SOURCE to a real store (docs/plans/sources/STORAGE-DECISION.md). Cause: ${
          err instanceof Error ? err.message : String(err)
        }`
    );
  }
}

// Day-1 store: a JSON file in the repo. Read-only on Vercel (writes work locally),
// which is fine until the Phase 1 storage decision lands.
export const fileStore: StorageAdapter = {
  name: "file",
  getNetwork: read,
  async upsertPerson(person: Person) {
    const data = await read();
    const i = data.people.findIndex((p) => p.id === person.id);
    if (i >= 0) data.people[i] = person;
    else data.people.push(person);
    await write(data);
  },
  async upsertProject(project: Project) {
    const data = await read();
    const i = data.projects.findIndex((p) => p.id === project.id);
    if (i >= 0) data.projects[i] = project;
    else data.projects.push(project);
    await write(data);
  },
  async listDeals() {
    const { deals } = await readCrm();
    return deals.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async upsertDeal(deal: Deal) {
    const data = await readCrm();
    upsertById(data.deals, deal);
    await writeCrm(data);
  },
  async listActivities(filter?: ActivityFilter) {
    const { activities } = await readCrm();
    return activities
      .filter(
        (a) =>
          (!filter?.personId || a.personId === filter.personId) &&
          (!filter?.orgId || a.orgId === filter.orgId) &&
          (!filter?.dealId || a.dealId === filter.dealId)
      )
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  },
  async upsertActivity(activity: Activity) {
    const data = await readCrm();
    upsertById(data.activities, activity);
    await writeCrm(data);
  },
  async listTasks(filter?: TaskFilter) {
    const { tasks } = await readCrm();
    return tasks
      .filter((t) => !filter?.status || t.status === filter.status)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  },
  async upsertTask(task: Task) {
    const data = await readCrm();
    upsertById(data.tasks, task);
    await writeCrm(data);
  },
};
