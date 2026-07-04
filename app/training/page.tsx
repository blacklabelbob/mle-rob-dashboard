import { promises as fs } from "fs";
import path from "path";
import { marked } from "marked";

export const dynamic = "force-dynamic";

// Training corner v1: renders the training corpus straight from docs/training/.
// Drop a new .md file there and it appears — no code change. The rep chat box
// (PRD 4.2) will ground on the same folder.
export default async function TrainingPage() {
  const dir = path.join(process.cwd(), "docs", "training");
  let files: string[] = [];
  try {
    files = (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch {
    // folder missing — show the empty state
  }

  const docs = await Promise.all(
    files.map(async (f) => ({
      name: f,
      html: marked.parse(await fs.readFile(path.join(dir, f), "utf8")) as string,
    }))
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Training corner</h1>
        <p className="mt-1 text-sm text-slate-400">
          What reps need to know before they pick up the phone. The rep chat box (ask questions
          instead of interrupting Rob) grounds on these documents — coming in Phase 4.
        </p>
      </div>

      {docs.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-sm text-slate-500">
          No training documents yet — drop markdown files in <code>docs/training/</code>.
        </div>
      ) : (
        docs.map((d) => (
          <article
            key={d.name}
            className="prose-custom rounded-xl border border-white/10 bg-white/5 p-6"
            dangerouslySetInnerHTML={{ __html: d.html }}
          />
        ))
      )}

      <style>{`
        .prose-custom { color: #cbd5e1; font-size: 0.9rem; line-height: 1.65; }
        .prose-custom h1 { color: #fff; font-size: 1.35rem; font-weight: 600; margin: 0 0 0.75rem; }
        .prose-custom h2 { color: #fff; font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.5rem; }
        .prose-custom h3 { color: #e2e8f0; font-size: 1rem; font-weight: 600; margin: 1.25rem 0 0.4rem; }
        .prose-custom p { margin: 0.6rem 0; }
        .prose-custom ul, .prose-custom ol { margin: 0.6rem 0 0.6rem 1.4rem; }
        .prose-custom ul { list-style: disc; }
        .prose-custom ol { list-style: decimal; }
        .prose-custom li { margin: 0.25rem 0; }
        .prose-custom strong { color: #f1f5f9; }
        .prose-custom code { background: rgba(0,0,0,0.4); padding: 0.1rem 0.35rem; border-radius: 4px; font-size: 0.82em; }
        .prose-custom hr { border-color: rgba(255,255,255,0.1); margin: 1.5rem 0; }
        .prose-custom a { color: #38bdf8; }
        .prose-custom table { border-collapse: collapse; margin: 0.75rem 0; }
        .prose-custom th, .prose-custom td { border: 1px solid rgba(255,255,255,0.12); padding: 0.35rem 0.6rem; }
      `}</style>
    </div>
  );
}
