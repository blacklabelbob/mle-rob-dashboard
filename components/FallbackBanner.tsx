import { servingFileData } from "@/lib/storage";

// Truth gate: never let file-store data pass for live Supabase silently.
// Renders nothing when the real store is serving.
export default function FallbackBanner() {
  const mode = servingFileData();
  if (!mode) return null;
  const message =
    mode === "configured"
      ? "File store active — this is snapshot data, not live Supabase."
      : "Supabase unreachable — serving fallback snapshot data. Edits are paused until it recovers.";
  return (
    <div className="border-b border-amber-400/30 bg-amber-400/10 px-4 py-1.5 text-center text-xs font-medium text-amber-300">
      ⚠ {message}
    </div>
  );
}
