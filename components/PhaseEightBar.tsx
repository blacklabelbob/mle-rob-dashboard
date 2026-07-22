// In-call action bar — Proposal / Case studies / E-sign / Invoice. These are
// intentionally inert ghosts: the buttons a rep will actually click mid-call
// once Phase 8 (In-Call Action Buttons) ships. Shared by the cockpit queue
// and the account workspace so both surfaces promise the same thing.
export default function PhaseEightBar({ compact = false }: { compact?: boolean }) {
  return (
    <div
      className={`flex flex-wrap items-center gap-2 text-slate-600 ${
        compact ? "text-[11px]" : "text-xs"
      }`}
    >
      <span className="uppercase tracking-wide">on this call:</span>
      {["Proposal", "Case studies", "E-sign", "Invoice"].map((b) => (
        <span
          key={b}
          title="lands with Phase 8 — In-Call Action Buttons"
          className="cursor-not-allowed rounded-md border border-white/10 px-2 py-1 text-slate-600"
        >
          {b}
        </span>
      ))}
      <span className="text-slate-700">· Phase 8</span>
    </div>
  );
}
