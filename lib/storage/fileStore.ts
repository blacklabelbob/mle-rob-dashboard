import { promises as fs } from "fs";
import path from "path";
import type { NetworkData, Person, Project } from "@/lib/types";
import type { StorageAdapter } from "./adapter";

const DATA_PATH = path.join(process.cwd(), "data", "network.json");

async function read(): Promise<NetworkData> {
  const raw = await fs.readFile(DATA_PATH, "utf8");
  return JSON.parse(raw) as NetworkData;
}

async function write(data: NetworkData): Promise<void> {
  await fs.writeFile(DATA_PATH, JSON.stringify(data, null, 2), "utf8");
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
};
