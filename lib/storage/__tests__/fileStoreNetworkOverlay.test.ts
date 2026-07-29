import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

// Q71 Phase 1, items 3+4. The committed data/network.json is scaffolding that
// ships in the bundle; data/network.local.json is the gitignored overlay that
// scripts/regen-fallback.mjs writes with real Supabase rows. These tests pin
// the seam in BOTH directions, because getting either one backwards is what put
// live customer phones into git in the first place:
//   - the overlay WINS on read when present (a pull takes effect immediately)
//   - the committed file is served when it is absent (prod, CI, fresh clone)
//   - every write lands in the overlay, so the committed file is never mutated
const tmpDir = path.join(os.tmpdir(), `mle-network-overlay-${process.pid}`);
const committed = path.join(tmpDir, "network.json");
const overlay = path.join(tmpDir, "network.local.json");

process.env.NETWORK_DATA_DIR = tmpDir;
const { fileStore } = await import("../fileStore");

function net(personId: string, name: string) {
  return {
    verticals: [{ id: "v1", name: "Vertical", color: "#000" }],
    people: [{ id: personId, name, verticalId: "v1" }],
    edges: [],
    projects: [],
  };
}

beforeEach(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  await fs.mkdir(tmpDir, { recursive: true });
  await fs.writeFile(committed, JSON.stringify(net("demo-1", "Scaffolding Person")), "utf8");
});

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.NETWORK_DATA_DIR;
});

describe("fileStore network overlay", () => {
  it("serves the committed scaffolding when no overlay exists", async () => {
    const people = (await fileStore.getNetwork()).people;
    expect(people.map((p) => p.name)).toEqual(["Scaffolding Person"]);
  });

  it("prefers the overlay over the committed file when both exist", async () => {
    await fs.writeFile(overlay, JSON.stringify(net("p-real", "Overlay Person")), "utf8");
    const people = (await fileStore.getNetwork()).people;
    expect(people.map((p) => p.name)).toEqual(["Overlay Person"]);
  });

  it("resolves the overlay per-call, not once at module load", async () => {
    expect((await fileStore.getNetwork()).people.map((p) => p.name)).toEqual(["Scaffolding Person"]);
    await fs.writeFile(overlay, JSON.stringify(net("p-real", "Overlay Person")), "utf8");
    expect((await fileStore.getNetwork()).people.map((p) => p.name)).toEqual(["Overlay Person"]);
    await fs.rm(overlay);
    expect((await fileStore.getNetwork()).people.map((p) => p.name)).toEqual(["Scaffolding Person"]);
  });

  it("writes to the overlay and leaves the committed file byte-identical", async () => {
    const before = await fs.readFile(committed, "utf8");
    await fileStore.upsertPerson({ id: "p-new", name: "Written Person", verticalId: "v1" });
    expect(await fs.readFile(committed, "utf8")).toBe(before);
    const written = JSON.parse(await fs.readFile(overlay, "utf8"));
    expect(written.people.map((p: { name: string }) => p.name)).toContain("Written Person");
  });

  it("fails loud on a corrupt overlay instead of silently serving the committed file", async () => {
    await fs.writeFile(overlay, "{ not json", "utf8");
    await expect(fileStore.getNetwork()).rejects.toThrow();
  });
});
