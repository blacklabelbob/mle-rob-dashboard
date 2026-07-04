"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface GNode {
  id: string;
  name: string;
  status: "lit" | "warm" | "unlit";
  verticalId: string;
  signed: boolean;
  quotedAmount: number;
  contribution: number;
  probability: number | null;
  estNewNodes: number | null;
  nodeType: string | null;
  role: string;
  relationship: string;
  referredById: string | null;
  // simulation state
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  color: string;
}

interface GEdge {
  id: string;
  fromId: string;
  toId: string;
  relationship?: string;
  suggested?: boolean;
}

interface Vertical {
  id: string;
  name: string;
  color: string;
}

interface Payload {
  nodes: Omit<GNode, "x" | "y" | "vx" | "vy" | "r" | "color">[];
  edges: GEdge[];
  verticals: Vertical[];
}

const W = 1600;
const H = 1100;

export default function NetworkGraph() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [selected, setSelected] = useState<GNode | null>(null);
  const [verticals, setVerticals] = useState<Vertical[]>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let nodes: GNode[] = [];
    let edges: GEdge[] = [];
    let anchors = new Map<string, { x: number; y: number }>();
    let alpha = 1;
    let raf = 0;
    let disposed = false;

    // view transform (world → screen): screen = world * k + t
    let k = 0.7;
    let tx = 0;
    let ty = 0;

    function fit() {
      const rect = canvas!.getBoundingClientRect();
      canvas!.width = rect.width * devicePixelRatio;
      canvas!.height = rect.height * devicePixelRatio;
      tx = (rect.width - W * k) / 2;
      ty = (rect.height - H * k) / 2;
    }

    async function load() {
      const res = await fetch("/api/network");
      const data = (await res.json()) as Payload;
      if (disposed) return;
      setVerticals(data.verticals);

      // cluster anchors on a ring; "core" pinned center
      const ring = data.verticals.filter((v) => v.id !== "core");
      anchors = new Map();
      anchors.set("core", { x: W / 2, y: H / 2 });
      ring.forEach((v, i) => {
        const a = (i / ring.length) * Math.PI * 2 - Math.PI / 2;
        anchors.set(v.id, {
          x: W / 2 + Math.cos(a) * 500,
          y: H / 2 + Math.sin(a) * 390,
        });
      });

      const colorOf = new Map(data.verticals.map((v) => [v.id, v.color]));
      nodes = data.nodes.map((n, i) => {
        const anchor = anchors.get(n.verticalId) ?? { x: W / 2, y: H / 2 };
        // deterministic spread (no Math.random — stable layout across loads)
        const a = i * 2.399963; // golden angle
        const d = 40 + (i % 7) * 22;
        return {
          ...n,
          x: anchor.x + Math.cos(a) * d,
          y: anchor.y + Math.sin(a) * d,
          vx: 0,
          vy: 0,
          r: 7 + Math.min(Math.sqrt(n.contribution) / 14, 26),
          color: colorOf.get(n.verticalId) ?? "#64748b",
        };
      });
      edges = data.edges;
      alpha = 1;
    }

    function tick() {
      if (alpha > 0.005) {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        // pairwise repulsion
        for (let i = 0; i < nodes.length; i++) {
          for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            let dx = b.x - a.x;
            let dy = b.y - a.y;
            let d2 = dx * dx + dy * dy;
            if (d2 < 1) {
              dx = (i - j) * 0.1;
              dy = 0.1;
              d2 = 0.02;
            }
            const f = (2600 / d2) * alpha;
            const d = Math.sqrt(d2);
            const fx = (dx / d) * f;
            const fy = (dy / d) * f;
            a.vx -= fx;
            a.vy -= fy;
            b.vx += fx;
            b.vy += fy;
          }
        }
        // edge springs
        for (const e of edges) {
          const a = byId.get(e.fromId);
          const b = byId.get(e.toId);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.max(Math.sqrt(dx * dx + dy * dy), 1);
          const target = a.r + b.r + 110;
          const f = (d - target) * 0.02 * alpha;
          const fx = (dx / d) * f;
          const fy = (dy / d) * f;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }
        // pull to vertical anchor
        for (const n of nodes) {
          const anchor = anchors.get(n.verticalId);
          if (!anchor) continue;
          n.vx += (anchor.x - n.x) * 0.012 * alpha;
          n.vy += (anchor.y - n.y) * 0.012 * alpha;
        }
        // integrate
        for (const n of nodes) {
          n.vx *= 0.82;
          n.vy *= 0.82;
          n.x += n.vx;
          n.y += n.vy;
        }
        alpha *= 0.985;
      }
      draw();
      raf = requestAnimationFrame(tick);
    }

    function draw() {
      const rect = canvas!.getBoundingClientRect();
      ctx!.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
      ctx!.clearRect(0, 0, rect.width, rect.height);
      ctx!.save();
      ctx!.translate(tx, ty);
      ctx!.scale(k, k);

      const byId = new Map(nodes.map((n) => [n.id, n]));

      // edges
      for (const e of edges) {
        const a = byId.get(e.fromId);
        const b = byId.get(e.toId);
        if (!a || !b) continue;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(b.x, b.y);
        ctx!.strokeStyle =
          a.status === "lit" && b.status === "lit"
            ? "rgba(251,191,36,0.35)"
            : "rgba(148,163,184,0.18)";
        ctx!.lineWidth = 1.5 / k;
        ctx!.setLineDash(e.suggested ? [6 / k, 5 / k] : []);
        ctx!.stroke();
        ctx!.setLineDash([]);
      }

      // nodes
      for (const n of nodes) {
        ctx!.beginPath();
        ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        if (n.status === "lit") {
          ctx!.shadowColor = n.color;
          ctx!.shadowBlur = 26;
          ctx!.fillStyle = n.color;
          ctx!.globalAlpha = 1;
        } else if (n.status === "warm") {
          ctx!.shadowBlur = 10;
          ctx!.shadowColor = n.color;
          ctx!.fillStyle = n.color;
          ctx!.globalAlpha = 0.55;
        } else {
          ctx!.shadowBlur = 0;
          ctx!.fillStyle = "#0b1220";
          ctx!.globalAlpha = 1;
        }
        ctx!.fill();
        ctx!.shadowBlur = 0;
        ctx!.globalAlpha = 1;
        ctx!.lineWidth = 1.5 / k;
        ctx!.strokeStyle = n.status === "unlit" ? n.color + "88" : n.color;
        ctx!.stroke();

        if (selectedRef.current?.id === n.id) {
          ctx!.beginPath();
          ctx!.arc(n.x, n.y, n.r + 6 / k, 0, Math.PI * 2);
          ctx!.strokeStyle = "#38bdf8";
          ctx!.lineWidth = 2 / k;
          ctx!.stroke();
        }

        if (k > 0.45) {
          ctx!.font = `${12 / k}px sans-serif`;
          ctx!.textAlign = "center";
          ctx!.fillStyle = n.status === "unlit" ? "rgba(148,163,184,0.7)" : "#e2e8f0";
          ctx!.fillText(n.name, n.x, n.y + n.r + 14 / k);
        }
      }
      ctx!.restore();
    }

    const selectedRef = { current: null as GNode | null };

    function toWorld(mx: number, my: number) {
      return { x: (mx - tx) / k, y: (my - ty) / k };
    }

    function hit(mx: number, my: number): GNode | null {
      const w = toWorld(mx, my);
      for (let i = nodes.length - 1; i >= 0; i--) {
        const n = nodes[i];
        const dx = w.x - n.x;
        const dy = w.y - n.y;
        if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
      }
      return null;
    }

    // Pointer Events: one code path for mouse, touch, and pen. Two active
    // pointers = pinch zoom (the "globe" gesture on a phone).
    const pointers = new Map<number, { x: number; y: number }>();
    let moved = false;
    let pinchDist = 0;

    function zoomAt(mx: number, my: number, factor: number) {
      const nk = Math.min(Math.max(k * factor, 0.15), 4);
      tx = mx - ((mx - tx) / k) * nk;
      ty = my - ((my - ty) / k) * nk;
      k = nk;
    }

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = canvas!.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, Math.exp(-e.deltaY * 0.0015));
    };
    const onDown = (e: PointerEvent) => {
      canvas!.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 1) moved = false;
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(b.x - a.x, b.y - a.y);
      }
    };
    const onMove = (e: PointerEvent) => {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (pointers.size === 1) {
        const dx = cur.x - prev.x;
        const dy = cur.y - prev.y;
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true;
        tx += dx;
        ty += dy;
      }
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(b.x - a.x, b.y - a.y);
        if (pinchDist > 0) {
          const rect = canvas!.getBoundingClientRect();
          const cx = (a.x + b.x) / 2 - rect.left;
          const cy = (a.y + b.y) / 2 - rect.top;
          zoomAt(cx, cy, d / pinchDist);
          moved = true;
        }
        pinchDist = d;
      }
    };
    const onUp = (e: PointerEvent) => {
      if (pointers.size === 1 && !moved) {
        const rect = canvas!.getBoundingClientRect();
        const n = hit(e.clientX - rect.left, e.clientY - rect.top);
        selectedRef.current = n;
        setSelected(n);
      }
      pointers.delete(e.pointerId);
      pinchDist = 0;
    };

    canvas.addEventListener("wheel", onWheel, { passive: false });
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);
    window.addEventListener("resize", fit);

    fit();
    load().then(() => tick());

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      canvas.removeEventListener("wheel", onWheel);
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      window.removeEventListener("resize", fit);
    };
  }, []);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        className="h-[72vh] w-full cursor-grab touch-none rounded-xl border border-white/10 bg-[#060a12] active:cursor-grabbing"
      />

      {/* legend */}
      <div className="pointer-events-none absolute left-3 top-3 rounded-lg bg-black/50 p-3 text-xs backdrop-blur">
        <div className="mb-1.5 font-medium text-slate-300">Clusters</div>
        {verticals.map((v) => (
          <div key={v.id} className="flex items-center gap-2 py-0.5 text-slate-400">
            <span className="h-2 w-2 rounded-full" style={{ background: v.color }} />
            {v.name}
          </div>
        ))}
        <div className="mt-2 border-t border-white/10 pt-1.5 text-slate-500">
          size = est. contribution · glow = lit
          <br />
          scroll to zoom · drag to pan · click a node
        </div>
      </div>

      {/* detail panel */}
      {selected && (
        <div className="absolute right-3 top-3 w-72 rounded-xl border border-white/10 bg-black/70 p-4 backdrop-blur">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                selected.status === "lit"
                  ? "bg-amber-400 shadow-[0_0_8px_2px_rgba(251,191,36,0.7)]"
                  : selected.status === "warm"
                    ? "bg-amber-700"
                    : "bg-slate-600"
              }`}
            />
            <div className="font-medium text-white">{selected.name}</div>
          </div>
          {selected.role && <p className="mt-1.5 text-xs text-slate-400">{selected.role}</p>}
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between">
              <dt className="text-slate-500">Est. contribution</dt>
              <dd className="font-medium text-sky-300">
                ${Math.round(selected.contribution / 1000)}k
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Quoted</dt>
              <dd className="text-slate-300">
                {selected.quotedAmount ? `$${Math.round(selected.quotedAmount / 1000)}k` : "—"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Signed</dt>
              <dd className={selected.signed ? "text-emerald-400" : "text-slate-500"}>
                {selected.signed ? "yes" : "not yet"}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Probability</dt>
              <dd className="text-emerald-300">
                {selected.probability != null
                  ? `${Math.round(selected.probability * 100)}%`
                  : "no estimate yet"}
              </dd>
            </div>
            {selected.estNewNodes != null && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Est. new nodes</dt>
                <dd className="text-amber-300">+{selected.estNewNodes}</dd>
              </div>
            )}
            {selected.nodeType && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Node type</dt>
                <dd className="text-slate-300">{selected.nodeType.replace("-", " ")}</dd>
              </div>
            )}
            {selected.relationship && (
              <div>
                <dt className="text-slate-500">Door</dt>
                <dd className="text-slate-300">{selected.relationship}</dd>
              </div>
            )}
          </dl>
          <Link
            href={`/people/${selected.id}`}
            className="mt-3 block rounded-lg bg-sky-500/90 px-3 py-1.5 text-center text-xs font-medium text-white hover:bg-sky-400"
          >
            open full record →
          </Link>
        </div>
      )}
    </div>
  );
}
