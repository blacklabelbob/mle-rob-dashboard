// Route-level skeleton. Every page here is force-dynamic and reads Supabase on the
// server, so without this the previous page sat frozen on screen until the new one
// finished — a dead click. See app/globals.css .skeleton.
export default function Loading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading">
      <div className="skeleton h-8 w-56" />
      <div className="space-y-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="skeleton h-11 w-full" style={{ opacity: 1 - i * 0.09 }} />
        ))}
      </div>
    </div>
  );
}
