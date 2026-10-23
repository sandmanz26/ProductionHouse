import type { KeyboardEvent } from "react";
import { STEP_COLOR } from "./step-color";
import type { StepKind } from "./content";

interface Node {
  id: string;
  label: string;
  sub: string;
  x: number;
  y: number;
  kind: StepKind;
  topic: string;
}

const W = 150;
const H = 58;

// The whole business on one sheet. Coordinates are in a 1080 × 470 box.
const NODES: Node[] = [
  { id: "buy", label: "1 · Purchasing", sub: "timber, panels, parts", x: 16, y: 150, kind: "money", topic: "purchasing" },
  { id: "stock", label: "2 · Stock in lots", sub: "each lot has its cost", x: 230, y: 150, kind: "material", topic: "stock" },
  { id: "wo", label: "3 · Work order", sub: "issue · labour · finish", x: 444, y: 150, kind: "process", topic: "work-orders" },
  { id: "product", label: "4 · Products", sub: "cost locked per unit", x: 658, y: 150, kind: "product", topic: "stock" },
  { id: "sales", label: "5 · Sales & export", sub: "ship → COGS & margin", x: 872, y: 70, kind: "product", topic: "sales" },
  { id: "rent", label: "5 · Rental & loan", sub: "out, back, repair", x: 872, y: 232, kind: "product", topic: "rentals" },
  { id: "money", label: "6 · Receivables", sub: "payments, overdue", x: 872, y: 392, kind: "money", topic: "finance" },
  { id: "recipe", label: "BOM & recipes", sub: "what goes in and out", x: 444, y: 16, kind: "neutral", topic: "recipes" },
  { id: "offcut", label: "Offcuts", sub: "back to stock, priced", x: 337, y: 318, kind: "offcut", topic: "offcuts" },
  { id: "pay", label: "Payables", sub: "what you owe suppliers", x: 16, y: 318, kind: "money", topic: "finance" },
];

const byId = new Map(NODES.map((n) => [n.id, n]));
const right = (n: Node) => ({ x: n.x + W, y: n.y + H / 2 });
const left = (n: Node) => ({ x: n.x, y: n.y + H / 2 });
const top = (n: Node) => ({ x: n.x + W / 2, y: n.y });
const bottom = (n: Node) => ({ x: n.x + W / 2, y: n.y + H });

interface Edge {
  d: string;
  label?: string;
  lx?: number;
  ly?: number;
  dashed?: boolean;
}

function curve(a: { x: number; y: number }, b: { x: number; y: number }) {
  const mx = (a.x + b.x) / 2;
  return `M${a.x},${a.y} C${mx},${a.y} ${mx},${b.y} ${b.x},${b.y}`;
}

const n = (id: string) => byId.get(id)!;
const EDGES: Edge[] = [
  { d: curve(right(n("buy")), left(n("stock"))), label: "receive", lx: 198, ly: 170 },
  { d: curve(right(n("stock")), left(n("wo"))), label: "issue", lx: 412, ly: 170 },
  { d: curve(right(n("wo")), left(n("product"))), label: "complete", lx: 626, ly: 170 },
  { d: curve(right(n("product")), left(n("sales"))) },
  { d: curve(right(n("product")), left(n("rent"))) },
  { d: `M${right(n("sales")).x},${right(n("sales")).y} C${right(n("sales")).x + 42},${right(n("sales")).y} ${right(n("money")).x + 42},${right(n("money")).y} ${right(n("money")).x},${right(n("money")).y}`, label: "invoice", lx: 1046, ly: 256 },
  { d: `M${bottom(n("rent")).x},${bottom(n("rent")).y} L${top(n("money")).x},${top(n("money")).y}` },
  { d: `M${top(n("wo")).x},${bottom(n("recipe")).y} L${top(n("wo")).x},${top(n("wo")).y}`, label: "plan", lx: 534, ly: 116 },
  // Offcuts loop: out of the work order, back into stock.
  { d: `M${bottom(n("wo")).x},${bottom(n("wo")).y} C${bottom(n("wo")).x},${n("offcut").y + H / 2} ${n("offcut").x + W + 20},${n("offcut").y + H / 2} ${n("offcut").x + W},${n("offcut").y + H / 2}`, label: "usable leftovers", lx: 520, ly: 300 },
  { d: `M${n("offcut").x},${n("offcut").y + H / 2} C${n("stock").x + W / 2},${n("offcut").y + H / 2} ${n("stock").x + W / 2},${bottom(n("stock")).y + 30} ${bottom(n("stock")).x},${bottom(n("stock")).y}`, dashed: true },
  // Rental returns: damaged units go to a repair work order.
  { d: `M${n("rent").x},${n("rent").y + H - 8} C${n("rent").x - 120},${n("rent").y + 110} ${bottom(n("wo")).x + 40},${bottom(n("wo")).y + 90} ${bottom(n("wo")).x + 40},${bottom(n("wo")).y}`, label: "damaged → repair", lx: 690, ly: 330, dashed: true },
  { d: `M${bottom(n("buy")).x},${bottom(n("buy")).y} L${top(n("pay")).x},${top(n("pay")).y}`, label: "bill", lx: 106, ly: 266 },
];

/**
 * The map people asked for: how a piece of timber becomes money, and the two loops that make
 * Serat different (offcuts back to stock, damaged rental units back to production).
 */
export function ProcessOverview({ onOpen }: { onOpen: (topicId: string) => void }) {
  const key = (topic: string) => (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(topic);
    }
  };
  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 1080 470" className="block w-full min-w-[760px]" role="img" aria-label="How Serat works: purchasing, stock in lots, work order, products, sales and rental, receivables; offcuts return to stock; damaged rentals go to repair">
        <defs>
          <marker id="ov-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" fill="var(--ink-soft)" />
          </marker>
        </defs>
        <g fill="none" stroke="var(--ink-soft)" strokeWidth={1.5}>
          {EDGES.map((e, i) => (
            <path key={i} d={e.d} markerEnd="url(#ov-arrow)" strokeDasharray={e.dashed ? "5 4" : undefined} strokeOpacity={0.8} />
          ))}
        </g>
        {EDGES.filter((e) => e.label).map((e, i) => (
          <text key={i} x={e.lx} y={e.ly} textAnchor="middle" className="fill-muted text-[12px]" style={{ paintOrder: "stroke", stroke: "var(--surface)", strokeWidth: 4 }}>
            {e.label}
          </text>
        ))}
        {NODES.map((node) => (
          <g key={node.id} role="link" tabIndex={0} aria-label={`${node.label}: ${node.sub}`} onClick={() => onOpen(node.topic)} onKeyDown={key(node.topic)} className="cursor-pointer outline-none [&:focus-visible>rect]:stroke-[var(--focus)]">
            <rect x={node.x} y={node.y} width={W} height={H} rx={5} fill="var(--surface)" stroke="var(--rule)" strokeWidth={1.5} />
            <rect x={node.x} y={node.y} width={4} height={H} rx={2} fill={STEP_COLOR[node.kind]} />
            <text x={node.x + 14} y={node.y + 24} className="fill-foreground text-[14px] font-medium">
              {node.label}
            </text>
            <text x={node.x + 14} y={node.y + 43} className="fill-muted text-[12px]">
              {node.sub}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
