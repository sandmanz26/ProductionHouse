import { Button } from "@heroui/react";
import { Table2, Workflow } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import type { FlowGraph, FlowKind, FlowNode } from "@/domain";
import { formatIDR, formatIDRCompact } from "@/lib/format";
import { FLOW_KIND } from "@/lib/labels";

const COLOR: Record<FlowKind, string> = {
  bahan: "var(--flow-bahan)",
  produk: "var(--flow-produk)",
  sisa: "var(--flow-sisa)",
  biaya: "var(--flow-biaya)",
  proses: "var(--flow-netral)",
  stok: "var(--flow-netral)",
  rugi: "var(--flow-rugi)",
};

const NODE_W = 10;
const MIN_SLOT = 34;
const GAP = 12;
const PAD_Y = 8;
const MIN_WIDTH = 720;
const LABEL_W = 168;

interface Placed extends FlowNode {
  x: number;
  y: number;
  h: number;
  value: number;
  inOff: number;
  outOff: number;
}

interface Band {
  key: string;
  /** Top of the band at the source, and its thickness. */
  y0: number;
  th: number;
  source: Placed;
  target: Placed;
  value: number;
  estimated?: boolean;
  path: string;
  color: string;
}

/**
 * Column layout: node height ∝ value (Rp), nodes ordered by the barycentre of their neighbours to
 * cut crossings, then each band stacked in the order of the node it joins.
 */
function layout(graph: FlowGraph, width: number) {
  const columns = Math.max(1, ...graph.nodes.map((n) => n.column + 1));
  const inV = new Map<string, number>();
  const outV = new Map<string, number>();
  for (const l of graph.links) {
    outV.set(l.source, (outV.get(l.source) ?? 0) + l.value);
    inV.set(l.target, (inV.get(l.target) ?? 0) + l.value);
  }
  const value = (id: string) => Math.max(inV.get(id) ?? 0, outV.get(id) ?? 0);
  const byCol: FlowNode[][] = Array.from({ length: columns }, () => []);
  for (const n of graph.nodes) byCol[n.column]!.push(n);

  const usable = Math.max(...byCol.map((c) => c.length)) * MIN_SLOT;
  const height0 = Math.max(240, usable + PAD_Y * 2);
  const k = Math.min(
    ...byCol.filter((c) => c.length).map((c) => (height0 - PAD_Y * 2 - (c.length - 1) * GAP) / Math.max(1, c.reduce((a, n) => a + value(n.id), 0))),
  );
  // Every label sits right of its node; the last column keeps a label margin on the right.
  const xOf = (c: number) => (columns === 1 ? 0 : (c * (width - NODE_W - LABEL_W)) / (columns - 1));

  const placed = new Map<string, Placed>();
  const place = (col: FlowNode[], c: number) => {
    const hs = col.map((n) => Math.max(3, value(n.id) * k));
    const slots = hs.map((h) => Math.max(h, MIN_SLOT));
    const total = slots.reduce((a, s) => a + s, 0) + (col.length - 1) * GAP;
    let y = Math.max(PAD_Y, (height0 - total) / 2);
    col.forEach((n, i) => {
      placed.set(n.id, { ...n, x: xOf(c), y, h: hs[i]!, value: value(n.id), inOff: 0, outOff: 0 });
      y += slots[i]! + GAP;
    });
  };
  byCol.forEach(place);
  // Two barycentre sweeps: forward by sources, backward by targets.
  const centre = (id: string) => {
    const p = placed.get(id);
    return p ? p.y + p.h / 2 : 0;
  };
  const sweep = (c: number, side: "in" | "out") => {
    const col = byCol[c]!;
    const bary = (n: FlowNode) => {
      const ls = graph.links.filter((l) => (side === "in" ? l.target === n.id : l.source === n.id));
      const w = ls.reduce((a, l) => a + l.value, 0);
      if (!w) return centre(n.id);
      return ls.reduce((a, l) => a + l.value * centre(side === "in" ? l.source : l.target), 0) / w;
    };
    const order = col.map((n, i) => ({ n, i, b: bary(n) }));
    order.sort((a, b) => a.b - b.b || a.i - b.i);
    byCol[c] = order.map((o) => o.n);
    place(byCol[c]!, c);
  };
  for (let c = 1; c < columns; c++) sweep(c, "in");
  for (let c = columns - 2; c >= 0; c--) sweep(c, "out");

  const height = Math.max(height0, ...[...placed.values()].map((p) => p.y + Math.max(p.h, MIN_SLOT) + PAD_Y));
  const links = [...graph.links].sort((a, b) => centre(a.target) - centre(b.target) || centre(a.source) - centre(b.source));
  const bands: Band[] = [];
  for (const l of links) {
    const s = placed.get(l.source);
    const t = placed.get(l.target);
    if (!s || !t) continue;
    const th = Math.max(1, l.value * k);
    const y0 = s.y + s.outOff;
    s.outOff += th;
    // Bands leaving a process take the colour of what they become.
    const color = COLOR[s.kind === "proses" ? t.kind : s.kind];
    bands.push({ key: `${l.source}→${l.target}`, source: s, target: t, value: l.value, estimated: l.estimated, path: "", color, y0, th });
  }
  for (const t of placed.values()) {
    const incoming = bands.filter((b) => b.target.id === t.id).sort((a, b) => centre(a.source.id) - centre(b.source.id));
    for (const b of incoming) {
      const y1 = t.y + t.inOff;
      t.inOff += b.th;
      const x0 = b.source.x + NODE_W;
      const x1 = t.x;
      const xm = (x0 + x1) / 2;
      b.path = `M${x0},${b.y0} C${xm},${b.y0} ${xm},${y1} ${x1},${y1} L${x1},${y1 + b.th} C${xm},${y1 + b.th} ${xm},${b.y0 + b.th} ${x0},${b.y0 + b.th} Z`;
    }
  }
  return { nodes: [...placed.values()], bands, height, columns };
}

/**
 * Sankey-style process map. Width is money; colour is what the money is (material, product,
 * offcut, labour). Hover a band or a node for the numbers; every value is also in the table view.
 */
export function FlowDiagram({ graph, label, empty = "Belum ada aliran untuk digambar." }: { graph: FlowGraph; label: string; empty?: string }) {
  const navigate = useNavigate();
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(MIN_WIDTH);
  const [narrow, setNarrow] = useState(false);
  const [hover, setHover] = useState<{ key: string; x: number; y: number } | null>(null);
  const [asTable, setAsTable] = useState(false);
  const hasFlow = graph.links.length > 0;

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.floor(e!.contentRect.width);
      setWidth(Math.max(MIN_WIDTH, w));
      setNarrow(w < MIN_WIDTH);
    });
    ro.observe(el);
    return () => ro.disconnect();
    // The wrapper only exists when there is something to draw; re-attach when it appears.
  }, [asTable, hasFlow]);

  const { nodes, bands, height, columns } = useMemo(() => layout(graph, width), [graph, width]);
  const kinds = [...new Set(nodes.map((n) => n.kind))];
  const hasEstimate = graph.links.some((l) => l.estimated);
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  if (!graph.links.length) {
    return (
      <div className="flex flex-col items-center gap-2 px-4 py-10 text-center text-sm text-muted">
        <Workflow className="size-5" />
        {empty}
      </div>
    );
  }

  const active = hover ? (bands.find((b) => b.key === hover.key) ?? null) : null;
  const activeNode = hover && !active ? nodeById.get(hover.key) : undefined;
  const lit = (b: Band) => !hover || b.key === hover.key || b.source.id === hover.key || b.target.id === hover.key;
  const track = (key: string) => (e: MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ key, x: e.clientX - r.left + (wrap.current?.scrollLeft ?? 0), y: e.clientY - r.top });
  };
  const open = (n: Placed) => n.to && navigate(n.to);
  const onKey = (n: Placed) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      open(n);
    }
  };

  return (
    <figure className="m-0" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Keterangan warna">
          {kinds.map((k) => (
            <li key={k} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: COLOR[k], backgroundImage: k === "rugi" ? HATCH_CSS : undefined }} />
              {FLOW_KIND[k]}
            </li>
          ))}
          {hasEstimate && (
            <li className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-0 w-4 border-t border-dashed border-current" />
              perkiraan / standar
            </li>
          )}
        </ul>
        {narrow && !asTable && <span className="text-xs text-muted">Geser ke samping →</span>}
        <Button size="sm" variant="ghost" onPress={() => setAsTable((v) => !v)} aria-pressed={asTable}>
          {asTable ? <Workflow className="size-4" /> : <Table2 className="size-4" />}
          {asTable ? "Diagram" : "Tabel"}
        </Button>
      </div>

      {asTable ? (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="mt-2 w-full text-[13px]">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-[var(--rule)] text-left text-xs text-muted">
                <th className="py-2 font-medium">Dari</th>
                <th className="py-2 font-medium">Ke</th>
                <th className="py-2 text-right font-medium">Nilai</th>
              </tr>
            </thead>
            <tbody>
              {bands.map((b) => (
                <tr key={b.key} className="border-b border-[var(--rule)] last:border-0">
                  <td className="py-1.5">{b.source.label}</td>
                  <td className="py-1.5">{b.target.label}</td>
                  <td className="num py-1.5 text-right">
                    {formatIDR(b.value)}
                    {b.estimated && <span className="text-muted"> · perkiraan</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative overflow-x-auto px-4 pb-3" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${columns} tahap, ${bands.length} aliran`} className="block">
            <defs>
              <pattern id="flow-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="6" stroke="var(--background)" strokeWidth="2" strokeOpacity="0.55" />
              </pattern>
            </defs>
            <g>
              {bands.map((b) => (
                <path
                  key={b.key}
                  d={b.path}
                  fill={b.color}
                  fillOpacity={lit(b) ? (hover ? 0.55 : 0.32) : 0.08}
                  stroke={b.estimated ? b.color : "none"}
                  strokeOpacity={0.7}
                  strokeDasharray={b.estimated ? "4 3" : undefined}
                  onMouseMove={track(b.key)}
                  className="transition-[fill-opacity] duration-150"
                />
              ))}
            </g>
            <g>
              {nodes.map((n) => {
                const tx = n.x + NODE_W + 8;
                const cy = n.y + Math.max(n.h, 3) / 2;
                const detail = [formatIDRCompact(n.value), n.sub].filter(Boolean).join(" · ");
                return (
                  <g
                    key={n.id}
                    onMouseMove={track(n.id)}
                    onClick={() => open(n)}
                    onKeyDown={onKey(n)}
                    tabIndex={n.to ? 0 : undefined}
                    role={n.to ? "link" : undefined}
                    aria-label={`${n.label}, ${formatIDR(n.value)}`}
                    className={n.to ? "cursor-pointer outline-none focus-visible:[&>rect]:stroke-[var(--focus)]" : undefined}
                  >
                    <rect x={n.x} y={n.y} width={NODE_W} height={Math.max(n.h, 3)} rx={2} fill={COLOR[n.kind]} stroke="transparent" strokeWidth={2} />
                    {n.kind === "rugi" && <rect x={n.x} y={n.y} width={NODE_W} height={Math.max(n.h, 3)} rx={2} fill="url(#flow-hatch)" />}
                    <text x={tx} y={cy - 7} dominantBaseline="middle" className="fill-foreground text-[12px] font-medium" style={HALO}>
                      {clip(n.label, 26)}
                    </text>
                    <text x={tx} y={cy + 8} dominantBaseline="middle" className="fill-muted text-[11px]" style={HALO}>
                      {clip(detail, 34)}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>
          {hover && (active || activeNode) && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 max-w-72 rounded-sm border border-[var(--rule)] bg-surface px-3 py-2 text-xs shadow-[var(--overlay-shadow)]"
              style={{ left: Math.min(hover.x + 14, width - 240), top: hover.y + 14 }}
            >
              {active ? (
                <>
                  <p className="font-medium">
                    {active.source.label} → {active.target.label}
                  </p>
                  <p className="num mt-0.5">{formatIDR(active.value)}</p>
                  <p className="mt-0.5 text-muted">
                    {Math.round((active.value / Math.max(1, active.source.value)) * 100)}% dari {active.source.label}
                    {active.estimated ? " · perkiraan" : ""}
                  </p>
                </>
              ) : activeNode ? (
                <>
                  <p className="font-medium">{activeNode.label}</p>
                  {activeNode.sub && <p className="text-muted">{activeNode.sub}</p>}
                  <p className="num mt-0.5">{formatIDR(activeNode.value)}</p>
                  {activeNode.to && <p className="mt-0.5 text-muted">Klik untuk membuka</p>}
                </>
              ) : null}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

const HALO = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4, strokeLinejoin: "round" } as const;
const HATCH_CSS = "repeating-linear-gradient(45deg, transparent 0 2px, rgba(255,255,255,.55) 2px 3px)";
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
