import { useMemo, useState } from "react";
import {
  COSTING_COMPLIANCE,
  COSTING_LABEL,
  compareCostingMethods,
  sum,
  type CostingMethod,
  type ItemKind,
  type MethodComparisonRow,
} from "@/domain";
import { DataTable, Section, type Column } from "@/components/ui";
import { formatIDR, formatQty } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";

type Simulated = "fifo" | "rata_rata" | "lifo";
const SIMULATED: Simulated[] = ["fifo", "rata_rata", "lifo"];

/** "What would my material cost be under another formula?" — replayed from the stock ledger. */
export function CostingComparison() {
  const db = useDb();
  const { item } = useLookups();
  const [kind, setKind] = useState<ItemKind>("material");
  const rows = useMemo(() => compareCostingMethods(db, { kind }).filter((r) => r.outflowQty > 0), [db, kind]);
  const total = (pick: (r: MethodComparisonRow) => number) => sum(rows.map(pick));
  const recordedOut = total((r) => r.recorded.outflow);
  const current = db.settings.costingMethod;

  const summary: { id: string; label: string; method?: CostingMethod; outflow: number; ending: number }[] = [
    { id: "recorded", label: "As recorded", outflow: recordedOut, ending: total((r) => r.recorded.ending) },
    ...SIMULATED.map((m) => ({
      id: m,
      label: COSTING_LABEL[m],
      method: m,
      outflow: total((r) => r[m].outflow),
      ending: total((r) => r[m].ending),
    })),
  ];

  const summaryCols: Column<(typeof summary)[number]>[] = [
    {
      key: "m",
      header: "Method",
      isRowHeader: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className={r.method === current ? "font-semibold" : "font-medium"}>{r.label}</span>
          {r.method === current && <span className="text-xs text-accent">in use</span>}
          {r.method && !COSTING_COMPLIANCE[r.method].psak && <span className="text-xs text-danger">not PSAK</span>}
        </span>
      ),
    },
    { key: "out", header: kind === "material" ? "Cost of materials out" : "COGS of items out", align: "end", cell: (r) => formatIDR(r.outflow) },
    { key: "end", header: "Ending stock value", align: "end", cell: (r) => formatIDR(r.ending) },
    {
      key: "diff",
      header: "Cost difference vs recorded",
      align: "end",
      cell: (r) => {
        if (r.id === "recorded") return <span className="text-muted">—</span>;
        const d = r.outflow - recordedOut;
        return <span className={Math.abs(d) < 1 ? "text-muted" : d > 0 ? "text-danger" : "text-success"}>{Math.abs(d) < 1 ? "0" : `${d > 0 ? "+" : "−"}${formatIDR(Math.abs(d))}`}</span>;
      },
    },
  ];

  const itemCols: Column<MethodComparisonRow & { id: string }>[] = [
    {
      key: "item",
      header: "Item",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-36">
          <p className="font-medium">{item(r.itemId)?.name}</p>
          <p className="text-xs text-muted">
            out {formatQty(r.outflowQty, item(r.itemId)?.uom)} · left {formatQty(r.endingQty, item(r.itemId)?.uom)}
          </p>
        </div>
      ),
    },
    ...SIMULATED.map((m) => ({
      key: m,
      header: COSTING_LABEL[m],
      align: "end" as const,
      cell: (r: MethodComparisonRow) => formatIDR(r[m].outflow),
    })),
    {
      key: "spread",
      header: "Spread",
      align: "end",
      cell: (r) => {
        const xs = SIMULATED.map((m) => r[m].outflow);
        const spread = Math.max(...xs) - Math.min(...xs);
        return spread < 1 ? <span className="text-muted">same</span> : formatIDR(spread);
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Costing method comparison"
        description="The stock ledger replayed under each method: the cost of items that went out and the value of the stock left. The total is always the same — the method only shifts cost between COGS and inventory."
        actions={
          <div role="radiogroup" aria-label="Item type" className="flex gap-1 text-[13px]">
            {(["material", "product"] as ItemKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-sm border px-2.5 py-1 ${kind === k ? "border-accent font-medium" : "border-[var(--rule)] text-muted hover:text-foreground"}`}
              >
                {k === "material" ? "Material" : "Product"}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        <DataTable label="Summary by method" columns={summaryCols} rows={summary} dependencies={[current, kind]} />
      </Section>
      <Section title="By item" description="Items with the widest spread are the most sensitive to the choice of method — usually the ones whose price swings sharply." bodyClassName="p-0">
        <DataTable
          label="Comparison by item"
          columns={itemCols}
          rows={rows
            .map((r) => ({ ...r, id: r.itemId }))
            .sort((a, b) => spreadOf(b) - spreadOf(a))}
          dependencies={[kind]}
        />
      </Section>
      <p className="text-xs text-muted">
        The simulation uses inbound costs as recorded (purchases, opening stock, production output). The knock-on effect on the cost of products made from
        those materials is not recalculated. Offcuts and items bought for a specific job are treated as ordinary layers.
      </p>
    </div>
  );
}

const spreadOf = (r: MethodComparisonRow) => {
  const xs = SIMULATED.map((m) => r[m].outflow);
  return Math.max(...xs) - Math.min(...xs);
};
