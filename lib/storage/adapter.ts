import type {
  Activity,
  Deal,
  NetworkData,
  Person,
  Project,
  Task,
  TaskStatus,
} from "@/lib/types";

// Anchor filter for activity reads: any combination narrows (AND semantics).
export interface ActivityFilter {
  personId?: string;
  orgId?: string;
  dealId?: string;
}

export interface TaskFilter {
  status?: TaskStatus;
}

// Every read/write in the app goes through this interface.
// Swapping the backing store must never touch UI code — see lib/storage/index.ts.
// Both implementations must pass the identical contract suite
// (lib/storage/__tests__/adapter.contract.test.ts — Task 2.3 DoD).
export interface StorageAdapter {
  readonly name: string;
  getNetwork(): Promise<NetworkData>;
  upsertPerson(person: Person): Promise<void>;
  upsertProject(project: Project): Promise<void>;
  // CRM core (0005): deals ordered by createdAt, activities by occurredAt,
  // tasks by createdAt — all ascending, so timelines render oldest-first.
  listDeals(): Promise<Deal[]>;
  upsertDeal(deal: Deal): Promise<void>;
  listActivities(filter?: ActivityFilter): Promise<Activity[]>;
  upsertActivity(activity: Activity): Promise<void>;
  listTasks(filter?: TaskFilter): Promise<Task[]>;
  upsertTask(task: Task): Promise<void>;
}
