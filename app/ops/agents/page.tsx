import AgentInventoryView from "@/components/ops/AgentInventoryView";
import inventory from "@/data/agent-skill-inventory.json";
import type { AssetRecord, AuditFinding } from "@/lib/agents/inventory";
import { cleanCount, rankAssets } from "@/lib/agents/inventoryView";

// Q79 half (c) — the surface. Halves (a) and (b) already generate the inventory and
// grade the instructions; this is the screen Rob can actually look at, because
// preference #9 says a markdown file is not a deliverable he reads.
//
// The committed JSON is imported, not read at request time: `npm run audit:agents`
// exits 2 when that file is stale, so the page can only ever show what the gate has
// already checked. A page that silently re-scanned at request time could disagree
// with the gate, and a surface that disagrees with its own gate is worse than none.

export const metadata = { title: "Agents & Skills — The Network" };

const data = inventory as unknown as {
  generatedAt: string;
  source: string;
  assets: AssetRecord[];
  findings: AuditFinding[];
  counts: {
    agents: number;
    skills: number;
    high: number;
    medium: number;
    reviewed: number;
    unexamined: number;
  };
};

export default function AgentsPage() {
  const rows = rankAssets(data.assets, data.findings, data.source);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Agents &amp; skills</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          Every agent and skill installed on this machine, worst-first. The point is not the
          list — it is the flags: an instruction that tells an agent something untrue about
          you (a job you left, a company you sold under) is findable here without reading{" "}
          {data.counts.agents + data.counts.skills} markdown files.
        </p>
      </div>
      <AgentInventoryView
        rows={rows}
        counts={data.counts}
        clean={cleanCount(rows)}
        generatedAt={data.generatedAt}
      />
    </div>
  );
}
