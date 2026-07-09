import { getStore } from "@/lib/storage";
import type { CoreTheme, Project } from "@/lib/types";

export const dynamic = "force-dynamic";

const themeLabel: Record<CoreTheme, { label: string; cls: string }> = {
  "sign-the-agreement": {
    label: "sign the agreement",
    cls: "border-sky-400/30 bg-sky-400/10 text-sky-300",
  },
  "get-paid-fast": {
    label: "get paid fast",
    cls: "border-emerald-400/30 bg-emerald-400/10 text-emerald-300",
  },
  "reduce-all-friction": {
    label: "reduce all friction",
    cls: "border-purple-400/30 bg-purple-400/10 text-purple-300",
  },
};

const categoryLabel: Record<Project["category"], string> = {
  "revenue-system": "Revenue system",
  "product-build": "Product build",
  internal: "Internal",
};

function ProjectCard({ project }: { project: Project }) {
  const theme = themeLabel[project.theme];
  const openWill = (project.willItems ?? []).filter((i) => !i.done);
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-medium text-white">
            {project.link ? (
              <a href={project.link} className="hover:underline" target="_blank" rel="noreferrer">
                {project.name} ↗
              </a>
            ) : (
              project.name
            )}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {categoryLabel[project.category]} · owner: {project.owner} · updated {project.updatedAt}
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs ${theme.cls}`}>
          {theme.label}
        </span>
      </div>

      {project.summary && <p className="mt-3 text-sm text-slate-400">{project.summary}</p>}

      <div className="mt-4">
        <div className="flex justify-between text-xs text-slate-500">
          <span>completion</span>
          <span className="text-slate-300">{project.completion}%</span>
        </div>
        <div className="mt-1 h-2 rounded-full bg-black/40">
          <div
            className={`h-2 rounded-full ${
              project.completion >= 70
                ? "bg-emerald-400"
                : project.completion >= 40
                  ? "bg-amber-400"
                  : "bg-slate-500"
            }`}
            style={{ width: `${project.completion}%` }}
          />
        </div>
      </div>

      {(project.resources ?? []).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {project.resources!.map((r) => (
            <a
              key={r.url}
              href={r.url}
              target="_blank"
              rel="noreferrer"
              className="rounded-full border border-sky-400/30 bg-sky-400/10 px-2.5 py-0.5 text-xs text-sky-300 hover:bg-sky-400/20"
            >
              {r.label} ↗
            </a>
          ))}
        </div>
      )}

      {openWill.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-400/25 bg-amber-400/5 p-3">
          <div className="text-xs font-medium text-amber-300">⚑ Will owes</div>
          <ul className="mt-1.5 space-y-1 text-xs text-slate-300">
            {openWill.map((i) => (
              <li key={i.item}>
                {i.item}
                {i.due && <span className="text-slate-500"> · due {i.due}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function ProjectsPage() {
  const data = await getStore().getNetwork();
  const products = data.projects.filter((p) => p.category === "product-build");
  const systems = data.projects.filter((p) => p.category !== "product-build");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-white">Projects</h1>
        <p className="mt-1 text-sm text-slate-400">
          Every project carries one of the three themes. If it doesn&apos;t serve a theme, why are we
          doing it?
        </p>
      </div>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Revenue systems & internal
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {systems.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">
          Product builds <span className="normal-case text-slate-600">— same treatment, different shelf</span>
        </h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <ProjectCard key={p.id} project={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
