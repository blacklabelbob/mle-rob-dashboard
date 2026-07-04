// Core data model for The Network.
// Every field Rob asked for on the people ledger lives on Person.

export type NodeStatus = "lit" | "warm" | "unlit";
// lit   = signed / paying / actively referring
// warm  = in conversation, quoted, or personally close
// unlit = known about, not yet activated

export type PhaseOneStatus = "not-started" | "in-progress" | "complete";

export type NodeType =
  | "client"
  | "connector"
  | "phone-attacker"
  | "social-butterfly"
  | "vertical-anchor"
  | "partner";
// How a node grows the network: clients pay, connectors open doors,
// phone-attackers/social-butterflies are rep archetypes, vertical-anchors
// (e.g. payment processing) touch every business in a territory.

export interface KeyDates {
  met?: string; // ISO dates
  quoted?: string;
  signed?: string;
  invoiced?: string;
  paid?: string;
  phaseOneComplete?: string;
}

export interface Estimate {
  estRevenue: number; // probable aggregate revenue ($) incl. doors they open
  estNewNodes: number; // probable new people/businesses they bring in
  probability: number; // 0..1 that the above materializes
  reasoning: string;
  source: "heuristic" | "claude";
  estimatedAt: string;
}

export interface Person {
  id: string;
  name: string;
  business?: string;
  role?: string;
  nodeType?: NodeType;
  verticalId: string;
  phone?: string;
  email?: string;
  website?: string;
  referredById?: string; // person who opened this door
  relationship?: string; // how referrer knows them ("best friend", "his rep", ...)
  status: NodeStatus;
  quotedAmount?: number; // $
  signed: boolean;
  meetingVideoUrl?: string;
  transcriptUrl?: string;
  estTimeToPaymentDays?: number;
  keyDates: KeyDates;
  phaseOne: PhaseOneStatus;
  description?: string; // free text Rob types; feeds the AI estimator
  estimate?: Estimate;
  notes?: string;
  assignedRep?: string; // Phase 6
}

export interface Edge {
  id: string;
  fromId: string; // referrer / connector
  toId: string;
  relationship?: string;
  suggested?: boolean; // AI-suggested connection (dashed in graph)
}

export interface Vertical {
  id: string;
  name: string;
  color: string; // cluster color in the graph
}

export type ProjectCategory = "revenue-system" | "product-build" | "internal";
export type CoreTheme =
  | "sign-the-agreement"
  | "get-paid-fast"
  | "reduce-all-friction";

export interface WillItem {
  item: string;
  due?: string;
  done: boolean;
}

export interface Project {
  id: string;
  name: string;
  category: ProjectCategory;
  theme: CoreTheme;
  completion: number; // 0..100
  owner: "Rob" | "Will" | "Max";
  summary?: string;
  link?: string;
  willItems?: WillItem[]; // things owed by Will → reminders
  updatedAt: string;
}

export interface NetworkData {
  people: Person[];
  edges: Edge[];
  verticals: Vertical[];
  projects: Project[];
}

// Derived, used across pages
export interface NetworkStats {
  totalPeople: number;
  litCount: number;
  warmCount: number;
  unlitCount: number;
  signedCount: number;
  pipelineQuoted: number; // sum of quoted, unsigned
  signedValue: number; // sum of quoted, signed
  estNetworkValue: number; // sum of probability-weighted estimates
}
