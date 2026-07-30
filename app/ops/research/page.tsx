import ResearchDigestView from "@/components/ops/ResearchDigestView";
import digest from "@/data/research-digest.json";
import { askCount, type ResearchDigest } from "@/lib/research/digest";

// Q80 half 2 — the surface the DoD asks for. Two research docs were written as
// `.md`, gated seven build items for a week, and Rob's verdict was "I never saw
// them": preference #9 says markdown is not a deliverable he reads. This page is
// those two docs in the form he does read, generated from the files themselves.
//
// Like /ops/agents it renders the COMMITTED json — `npm run audit:research` exits
// 2 when a source doc has moved on, so the page can never quietly show a stale
// version of a document someone is being asked to act on.

export const metadata = { title: "Research — The Network" };

const data = digest as unknown as { docs: (ResearchDigest & { blurb?: string })[] };

export default function ResearchPage() {
  const asks = askCount(data.docs);
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-lg font-semibold text-white">Research</h1>
        <p className="mt-1 max-w-3xl text-xs text-slate-500">
          The design and research work behind the master view and the rep cockpit — decisions
          first, and the {asks} question{asks === 1 ? "" : "s"} still pointed at you pulled to the
          top of each. Generated from the source documents, so nothing here is a summary that can
          drift from what was actually written.
        </p>
      </div>
      <ResearchDigestView docs={data.docs} />
    </div>
  );
}
