import { Button } from "@heroui/react";
import { Table2, Workflow } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from "react";
import { useNavigate } from "react-router";
import type { RouteGraph, RouteGraphNode, RouteKind } from "@/domain";
import { ROUTE_TAG } from "@/lib/route-tag";
import { formatIDRCompact, formatQty, UOM_LABEL } from "@/lib/format";
import { useLookups } from "@/store/db-store";

const COL_W = 256;
const ITEM_W = 188;
const ROUTE_W = 176;
const H = { item: 64, route: 52, cycle: 40 } as const;
const GAP = 14;
const PAD = 12;


interface Box extends RouteGraphNode {
  x: number;
  y: number;
  w: number;
  h: number;
}

function layout(g: RouteGraph) {
  const size = (n: RouteGraphNode) => ({ w: n.type === "route" ? ROUTE_W : ITEM_W, h: H[n.type] });
  const targets = new Map<string, string[]>();
  for (const e of g.edges) targets.set(e.from, [...(targets.get(e.from) ?? []), e.to]);
  const boxes = new Map<string, Box>();
  const byLevel: RouteGraphNode[][] = Array.from({ length: g.maxLevel + 1 }, () => []);
  for (const n of g.nodes) byLevel[n.level]!.push(n);

  // Right to left: each column orders its nodes by where the nodes they feed sit.
  byLevel.forEach((col, level) => {
    const x = PAD + (g.maxLevel - level) * COL_W + (COL_W - ITEM_W) / 2;
    const wanted = col.map((n, i) => {
      const ts = (targets.get(n.id) ?? []).map((t) => boxes.get(t)).filter((b): b is Box => !!b);
      const ideal = ts.length ? ts.reduce((a, b) => a + b.y + b.h / 2, 0) / ts.length : 0;
      return { n, i, ideal };
    });
    wanted.sort((a, b) => a.ideal - b.ideal || a.i - b.i);
    let bottom = -Infinity;
    for (const { n, ideal } of wanted) {
      const { w, h } = size(n);
      const y = Math.max(ideal - h / 2, bottom + GAP);
      boxes.set(n.id, { ...n, x: x + (ITEM_W - w) / 2, y, w, h });
      bottom = y + h;
    }
  });
  const top = Math.min(...[...boxes.values()].map((b) => b.y));
  for (const b of boxes.values()) b.y += PAD - top;
  const height = Math.max(...[...boxes.values()].map((b) => b.y + b.h)) + PAD;
  const width = PAD * 2 + (g.maxLevel + 1) * COL_W;
  return { boxes, width, height };
}

/**
 * Left to right: raw materials → the routes that turn them into things → the item you clicked.
 * Several routes into one item are alternatives ("or"). Click any item to re-centre on it.
 */
export function RouteMap({ graph, rootId, label }: { graph: RouteGraph; rootId: string; label: string }) {
  const navigate = useNavigate();
  const { item, stock } = useLookups();
  const wrap = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  const [hover, setHover] = useState<{ id: string; x: number; y: number } | null>(null);
  const [asTable, setAsTable] = useState(false);
  const { boxes, width, height } = useMemo(() => layout(graph), [graph]);

  useLayoutEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setNarrow(e!.contentRect.width < width));
    ro.observe(el);
    return () => ro.disconnect();
  }, [width, asTable]);

  // The item asked about sits on the right edge; start there and let people scroll back upstream.
  useLayoutEffect(() => {
    const el = wrap.current;
    if (el) el.scrollLeft = el.scrollWidth;
  }, [graph, asTable]);

  // Everything upstream and downstream of the hovered node stays lit.
  const lit = useMemo(() => {
    if (!hover) return null;
    const set = new Set([hover.id]);
    const walk = (start: string, dir: "up" | "down") => {
      const stack = [start];
      while (stack.length) {
        const id = stack.pop()!;
        for (const e of graph.edges) {
          const next = dir === "up" ? (e.to === id ? e.from : null) : e.from === id ? e.to : null;
          if (next && !set.has(next)) {
            set.add(next);
            stack.push(next);
          }
        }
      }
    };
    walk(hover.id, "up");
    walk(hover.id, "down");
    return set;
  }, [hover, graph.edges]);

  const kinds = [...new Set(graph.nodes.flatMap((n) => [n.route?.kind, n.buyOnly ? "beli" : undefined]).filter((k): k is RouteKind => !!k))];
  const legend = [...new Map(kinds.map((k) => [ROUTE_TAG[k].legend, ROUTE_TAG[k].color])).entries()];

  const incoming = new Map<string, string[]>();
  for (const e of graph.edges) incoming.set(e.to, [...(incoming.get(e.to) ?? []), e.from]);
  const sortedIncoming = (id: string) => (incoming.get(id) ?? []).slice().sort((a, b) => (boxes.get(a)?.y ?? 0) - (boxes.get(b)?.y ?? 0));

  const go = (n: Box) => {
    if (n.type === "item" && n.itemId && n.id !== rootId) navigate(`/routes/${n.itemId}`);
    else if (n.type === "cycle" && n.itemId) navigate(`/routes/${n.itemId}`);
    else if (n.type === "route" && n.route?.recipeId) navigate(`/recipes/${n.route.recipeId}`);
  };
  const clickable = (n: Box) => (n.type === "item" && n.id !== rootId) || n.type === "cycle" || !!n.route?.recipeId;
  const onKey = (n: Box) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      go(n);
    }
  };
  const track = (id: string) => (e: MouseEvent) => {
    const r = wrap.current?.getBoundingClientRect();
    if (r) setHover({ id, x: e.clientX - r.left + (wrap.current?.scrollLeft ?? 0), y: e.clientY - r.top });
  };

  const name = (id?: string) => (id ? (item(id)?.name ?? "?") : "?");
  const uom = (id?: string) => (id ? UOM_LABEL[item(id)?.uom ?? "pcs"] : "");
  const hovered = hover ? boxes.get(hover.id) : undefined;
  // Quantities on every line crowd a busy map; there they appear for the hovered chain only.
  const crowded = graph.edges.filter((e) => e.qty !== undefined).length > 8;

  return (
    <figure className="m-0" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 pt-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted" aria-label="Route key">
          {legend.map(([text, color]) => (
            <li key={text} className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-[2px]" style={{ background: color }} />
              {text}
            </li>
          ))}
          <li className="inline-flex items-center gap-1.5">
            <span aria-hidden>↺</span> loops back to a downstream item (cycle)
          </li>
        </ul>
        <div className="flex items-center gap-3">
          {narrow && !asTable && <span className="text-xs text-muted">← Scroll to see materials further upstream</span>}
          <Button size="sm" variant="ghost" onPress={() => setAsTable((v) => !v)} aria-pressed={asTable}>
            {asTable ? <Workflow className="size-4" /> : <Table2 className="size-4" />}
            {asTable ? "Map" : "Table"}
          </Button>
        </div>
      </div>

      {asTable ? (
        <div className="overflow-x-auto px-4 pb-4">
          <table className="mt-2 w-full text-[13px]">
            <caption className="sr-only">{label}</caption>
            <thead>
              <tr className="border-b border-[var(--rule)] text-left text-xs text-muted">
                <th className="py-2 font-medium">Material / route</th>
                <th className="py-2 font-medium">Goes into</th>
                <th className="py-2 text-right font-medium">Per unit</th>
              </tr>
            </thead>
            <tbody>
              {graph.edges.map((e, i) => {
                const from = boxes.get(e.from)!;
                const to = boxes.get(e.to)!;
                const fromLabel = from.type === "route" ? `${ROUTE_TAG[from.route!.kind].tag} · ${from.route!.label}` : `${name(from.itemId)}${from.type === "cycle" ? " (cycle)" : ""}`;
                const toLabel = to.type === "route" ? `${ROUTE_TAG[to.route!.kind].tag} · ${to.route!.label}` : name(to.itemId);
                return (
                  <tr key={i} className="border-b border-[var(--rule)] last:border-0">
                    <td className="py-1.5">{fromLabel}</td>
                    <td className="py-1.5">{toLabel}</td>
                    <td className="num py-1.5 text-right">{e.qty !== undefined ? `${formatQty(e.qty)} ${uom(from.itemId)}` : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrap} className="relative overflow-x-auto px-4 pb-3" onMouseLeave={() => setHover(null)}>
          <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${label}: ${graph.nodes.filter((n) => n.type === "route").length} routes`} className="block">
            <g fill="none">
              {graph.edges.map((e, i) => {
                const a = boxes.get(e.from)!;
                const b = boxes.get(e.to)!;
                const ins = sortedIncoming(e.to);
                const k = ins.indexOf(e.from);
                const x0 = a.x + a.w;
                const y0 = a.y + a.h / 2;
                const x1 = b.x;
                const y1 = b.y + ((k + 1) * b.h) / (ins.length + 1);
                const xm = (x0 + x1) / 2;
                const on = !lit || (lit.has(e.from) && lit.has(e.to));
                const color = a.type === "route" ? ROUTE_TAG[a.route!.kind].color : "var(--ink-soft)";
                return (
                  <g key={i} opacity={on ? 1 : 0.15} className="transition-opacity duration-150">
                    <path d={`M${x0},${y0} C${xm},${y0} ${xm},${y1} ${x1},${y1}`} stroke={color} strokeWidth={a.type === "route" ? 2 : 1.25} strokeOpacity={a.type === "route" ? 0.85 : 0.55} strokeDasharray={a.type === "cycle" ? "4 3" : undefined} />
                    {e.qty !== undefined && (!crowded || (lit && on)) && (
                      <text x={xm} y={(y0 + y1) / 2 - 4} textAnchor="middle" className="num fill-muted text-[10px]" style={HALO}>
                        {formatQty(e.qty)} {uom(a.itemId)}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
            {[...boxes.values()].map((n) => {
              const on = !lit || lit.has(n.id);
              const isRoot = n.id === rootId;
              const common = {
                opacity: on ? 1 : 0.3,
                onMouseMove: track(n.id),
                onClick: () => go(n),
                onKeyDown: onKey(n),
                tabIndex: clickable(n) ? 0 : undefined,
                role: clickable(n) ? "link" : undefined,
                className: `transition-opacity duration-150 outline-none ${clickable(n) ? "cursor-pointer [&:focus-visible>rect]:stroke-[var(--focus)]" : ""}`,
              } as const;
              if (n.type === "route") {
                const r = n.route!;
                const t = ROUTE_TAG[r.kind];
                const line2 = [`${formatIDRCompact(r.unitCost)}/${uom(graph.nodes.find((x) => x.id === graph.edges.find((e) => e.from === n.id)?.to)?.itemId)}`, r.uses ? `used ${r.uses}×` : "not used yet", n.hiddenAux ? `+${n.hiddenAux} auxiliary` : ""].filter(Boolean).join(" · ");
                return (
                  <g key={n.id} {...common} aria-label={`${t.tag} ${r.label}`}>
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={n.h / 2} fill="var(--surface)" stroke={t.color} strokeWidth={1.5} strokeDasharray={r.byProduct ? "5 3" : undefined} />
                    <text x={n.x + 14} y={n.y + 19} className="text-[11px]">
                      <tspan className="font-semibold tracking-wide" style={{ fill: t.color }}>
                        {t.tag}
                      </tspan>
                      <tspan className="fill-foreground font-medium"> {clip(r.label, 18)}</tspan>
                    </text>
                    <text x={n.x + 14} y={n.y + 36} className="num fill-muted text-[10px]">
                      {clip(line2, 28)}
                    </text>
                  </g>
                );
              }
              if (n.type === "cycle") {
                return (
                  <g key={n.id} {...common} aria-label={`Cycle to ${name(n.itemId)}`}>
                    <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={4} fill="var(--background)" stroke="var(--rule)" strokeDasharray="4 3" />
                    <text x={n.x + 12} y={n.y + n.h / 2} dominantBaseline="middle" className="fill-muted text-[11px]">
                      ↺ {clip(name(n.itemId), 24)}
                    </text>
                  </g>
                );
              }
              const it = item(n.itemId);
              const s = n.itemId ? stock.get(n.itemId) : undefined;
              const stripe = it?.kind === "product" ? "var(--flow-produk)" : "var(--flow-bahan)";
              const line3 = n.buyOnly ? `bought · ${n.buyOnly.suppliers?.[0]?.name ?? "supplier"}` : n.more ? "more routes — click →" : isRoot ? "item being mapped" : "";
              return (
                <g key={n.id} {...common} aria-label={`${it?.name ?? "?"}${n.buyOnly ? ", bought" : ""}`}>
                  <rect x={n.x} y={n.y} width={n.w} height={n.h} rx={4} fill="var(--surface)" stroke={isRoot ? "var(--accent)" : "var(--rule)"} strokeWidth={isRoot ? 2 : 1} />
                  <rect x={n.x} y={n.y} width={4} height={n.h} rx={2} fill={stripe} />
                  <text x={n.x + 14} y={n.y + 19} className="fill-foreground text-[12px] font-medium">
                    {clip(it?.name ?? "?", 26)}
                  </text>
                  <text x={n.x + 14} y={n.y + 36} className="num fill-muted text-[10px]">
                    {clip(`stock ${formatQty(s?.available ?? 0, it?.uom)} · ${formatIDRCompact(it?.standardCost ?? 0)}`, 34)}
                  </text>
                  {line3 && (
                    <text x={n.x + 14} y={n.y + 52} className="text-[10px]" style={{ fill: n.buyOnly ? ROUTE_TAG.beli.color : "var(--ink-soft)" }}>
                      {clip(line3, 32)}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {hovered && hover && (
            <div
              role="status"
              className="pointer-events-none absolute z-10 max-w-80 rounded-sm border border-[var(--rule)] bg-surface px-3 py-2 text-xs shadow-[var(--overlay-shadow)]"
              style={{ left: Math.min(hover.x + 14, width - 300), top: hover.y + 14 }}
            >
              {hovered.type === "route" && hovered.route ? (
                <>
                  <p className="font-medium">
                    <span style={{ color: ROUTE_TAG[hovered.route.kind].color }}>{ROUTE_TAG[hovered.route.kind].tag}</span> · {hovered.route.label}
                  </p>
                  {hovered.route.inputs.length > 0 && (
                    <ul className="mt-1 space-y-0.5">
                      {hovered.route.inputs.map((i) => (
                        <li key={i.itemId} className="flex justify-between gap-4">
                          <span>{name(i.itemId)}</span>
                          <span className="num">
                            {formatQty(i.qty)} {uom(i.itemId)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {hovered.route.suppliers?.map((sp) => (
                    <p key={sp.name} className="mt-0.5">
                      {sp.name} · {sp.count}× · last {formatIDRCompact(sp.lastUnitCost)}
                    </p>
                  ))}
                  <p className="mt-1 text-muted">
                    {hovered.route.byProduct ? "By-product of dismantling. " : ""}
                    {hovered.route.recipeId ? "Click to open the recipe." : ""}
                  </p>
                </>
              ) : (
                <>
                  <p className="font-medium">{name(hovered.itemId)}</p>
                  <p className="text-muted">
                    {hovered.type === "cycle"
                      ? "This item is already downstream — the route loops back."
                      : hovered.buyOnly
                        ? `Only bought${hovered.buyOnly.suppliers?.length ? `: ${hovered.buyOnly.suppliers.map((x) => x.name).join(", ")}` : ""}.`
                        : hovered.id === rootId
                          ? "The item being mapped."
                          : "Click to map this item."}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </figure>
  );
}

const HALO = { paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 3, strokeLinejoin: "round" } as const;
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
