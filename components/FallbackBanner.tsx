import { getStore, servingFileData } from "@/lib/storage";
import { dataDisclosure, type DisclosureTone } from "@/lib/ui/dataDisclosure";

// Truth gate: never let file-store data pass for live Supabase silently, and
// never let GENERATED data pass for either one (Q71 Phase 2).
//
// The `__synthetic` read is deliberately behind the mode check: when the real
// store is serving, this returns before any I/O, so live Supabase pays nothing
// for a banner it never shows. When the file store IS serving, the page below
// is already reading the same file, so the read costs nothing in practice.
const toneClass: Record<DisclosureTone, string> = {
  demo: "border-violet-400/30 bg-violet-400/10 text-violet-200",
  warn: "border-amber-400/30 bg-amber-400/10 text-amber-300",
  alarm: "border-rose-400/40 bg-rose-500/15 text-rose-200",
};

const toneIcon: Record<DisclosureTone, string> = {
  demo: "🧪",
  warn: "⚠",
  alarm: "⛔",
};

export default async function FallbackBanner() {
  const mode = servingFileData();
  if (!mode) return null;

  let synthetic = false;
  try {
    synthetic = (await getStore().getNetwork()).__synthetic === true;
  } catch {
    // A banner may never be the thing that takes the page down. Unreadable
    // data still gets the mode-only disclosure, which is the honest fallback:
    // we know where the rows came from, we just could not confirm what they are.
    synthetic = false;
  }

  const disclosure = dataDisclosure(mode, synthetic);
  if (!disclosure) return null;

  return (
    <div
      data-testid="data-disclosure"
      data-tone={disclosure.tone}
      className={`border-b px-4 py-1.5 text-center text-xs font-medium ${
        toneClass[disclosure.tone]
      }`}
    >
      {toneIcon[disclosure.tone]}{" "}
      <span className="font-semibold">{disclosure.label}</span> —{" "}
      {disclosure.message}
    </div>
  );
}
