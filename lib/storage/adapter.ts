import type { NetworkData, Person, Project } from "@/lib/types";

// Every read/write in the app goes through this interface.
// Swapping the backing store must never touch UI code — see lib/storage/index.ts.
export interface StorageAdapter {
  readonly name: string;
  getNetwork(): Promise<NetworkData>;
  upsertPerson(person: Person): Promise<void>;
  upsertProject(project: Project): Promise<void>;
}
