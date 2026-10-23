import { Link, Tabs, type Key } from "@heroui/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  addDays,
  COSTING_LABEL,
  inventoryValuation,
  productCostRows,
  rentalUtilization,
  standardProductCost,
  sum,
  today,
  type ProductCostRow,
  type UtilizationRow,
  type WorkOrder,
} from "@/domain";
import { DataTable, PageHeader, Section, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR, formatIDRCompact, formatPct, formatQty } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";
import { CostingComparison } from "./CostingComparison";

type View = "produk" | "pekerjaan" | "sewa" | "nilai" | "metode";

export default function HppReportPage() {
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("produk");

  const products = useMemo(() => productCostRows(db, (p) => standardProductCost(db, p)), [db]);
  const done = useMemo(
    () => db.workOrders.filter((w) => w.status === "selesai" && w.cost).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [db.workOrders],
  );
  const valuation = useMemo(() => inventoryValuation(db), [db]);
  const util = useMemo(() => rentalUtilization(db, addDays(today(), -89), today()), [db]);

  const totals = useMemo(() => {
    const gross = sum(done.map((w) => w.cost!.materialGross));
    const credit = sum(done.map((w) => w.cost!.returnCredit + w.cost!.scrapRecovery));
    const total = sum(done.map((w) => w.cost!.total));
    const material = sum(done.map((w) => w.cost!.materialNet));
    return {
      gross,
      credit,
      total,
      material,
      labor: sum(done.map((w) => w.cost!.labor + w.cost!.overhead)),
      variance: sum(done.map((w) => w.cost!.variance ?? 0)),
      rejects: sum(done.map((w) => w.cost!.rejectQty ?? 0)),
    };
  }, [done]);

  const productCols: Column<ProductCostRow & { id: string }>[] = [
    { key: "name", header: "Product", isRowHeader: true, cell: (r) => <span className="font-medium">{r.item.name}</span> },
    { key: "made", header: "Produced", align: "end", cell: (r) => (r.produced ? formatQty(r.produced) : <span className="text-muted">—</span>) },
    { key: "std", header: "Standard cost", align: "end", cell: (r) => formatIDR(r.standard) },
    {
      key: "act",
      header: "Average actual cost",
      align: "end",
      cell: (r) => {
        if (!r.avgActual) return <span className="text-muted">—</span>;
        const v = r.standard ? r.avgActual / r.standard - 1 : 0;
        return (
          <div>
            <p className="font-medium">{formatIDR(r.avgActual)}</p>
            {r.standard > 0 && (
              <p className={`text-xs ${v > 0.05 ? "text-danger" : v < -0.05 ? "text-success" : "text-muted"}`}>
                {v > 0 ? "+" : ""}
                {formatPct(v)} vs standard
              </p>
            )}
          </div>
        );
      },
    },
    { key: "price", header: "Sales price", align: "end", cell: (r) => (r.salePrice ? formatIDR(r.salePrice) : "—") },
    {
      key: "margin",
      header: "Margin",
      align: "end",
      cell: (r) =>
        r.marginPct === undefined ? (
          "—"
        ) : (
          <StatusChip tone={r.marginPct < 0.2 ? "danger" : r.marginPct < 0.35 ? "warning" : "success"}>{formatPct(r.marginPct)}</StatusChip>
        ),
    },
  ];

  const woCols: Column<WorkOrder>[] = [
    { key: "code", header: "Code", isRowHeader: true, className: "whitespace-nowrap", cell: (w) => <Link href={`/work-orders/${w.id}`}>{w.code}</Link> },
    { key: "type", header: "Type", cell: (w) => <StatusChip tone={WO_TYPE[w.type].tone}>{WO_TYPE[w.type].short}</StatusChip> },
    {
      key: "out",
      header: "Output",
      cell: (w) => (
        <span className="text-sm">{w.cost!.outputs.map((o) => `${formatQty(o.qty, item(o.itemId)?.uom)} ${item(o.itemId)?.name ?? ""}`).join(", ")}</span>
      ),
    },
    { key: "date", header: "Completed", className: "whitespace-nowrap", cell: (w) => formatDate(w.completedAt) },
    { key: "mat", header: "Net materials", align: "end", cell: (w) => formatIDR(w.cost!.materialNet) },
    {
      key: "credit",
      header: "Saved by offcuts",
      align: "end",
      cell: (w) => {
        const c = w.cost!.returnCredit + w.cost!.scrapRecovery;
        return c ? <span className="text-success">{formatIDR(c)}</span> : <span className="text-muted">—</span>;
      },
    },
    { key: "labor", header: "Labour + overhead", align: "end", cell: (w) => formatIDR(w.cost!.labor + w.cost!.overhead + w.cost!.extra) },
    { key: "total", header: "Total cost", align: "end", cell: (w) => <b>{formatIDR(w.cost!.total)}</b> },
    { key: "yield", header: "Yield", align: "end", cell: (w) => formatPct(w.cost!.yieldRatio) },
    { key: "rej", header: "Reject", align: "end", cell: (w) => (w.cost!.rejectQty ? <span className="text-danger">{w.cost!.rejectQty}</span> : "—") },
    { key: "var", header: "Cost variance", align: "end", cell: (w) => (w.cost!.variance ? formatIDR(w.cost!.variance) : "—") },
  ];

  const utilCols: Column<UtilizationRow & { id: string }>[] = [
    { key: "item", header: "Rental product", isRowHeader: true, cell: (r) => item(r.itemId)?.name ?? "?" },
    { key: "owned", header: "Units owned", align: "end", cell: (r) => r.owned },
    { key: "days", header: "Unit-days out", align: "end", cell: (r) => r.unitDays },
    {
      key: "util",
      header: "90-day utilisation",
      align: "end",
      cell: (r) => <span className={r.utilization < 0.15 ? "text-warning" : ""}>{formatPct(r.utilization)}</span>,
    },
    { key: "n", header: "Rentals", align: "end", cell: (r) => r.rentals },
    { key: "rev", header: "Revenue", align: "end", cell: (r) => formatIDR(r.revenue) },
    { key: "dmg", header: "Returned damaged", align: "end", cell: (r) => (r.damaged ? <span className="text-danger">{r.damaged}</span> : "—") },
  ];

  return (
    <>
      <PageHeader
        title="Cost report"
        description="Actual cost vs BOM standard, rental utilisation and inventory value."
      />
      <MetricStrip
        className="mb-5"
        items={[
          { label: "Total production cost", value: formatIDRCompact(totals.total), hint: `${done.length} jobs completed` },
          { label: "Materials used", value: formatIDRCompact(totals.material), hint: totals.total ? `${formatPct(totals.material / totals.total, 0)} of job cost` : undefined },
          { label: "Saved through offcuts", value: formatIDRCompact(totals.credit), hint: totals.gross ? `${formatPct(totals.credit / totals.gross)} of materials issued` : undefined },
          { label: "Labour & overhead", value: formatIDRCompact(totals.labor) },
          { label: "Cost variance", value: formatIDRCompact(totals.variance), hint: `${totals.rejects} QC reject units`, tone: totals.variance > 0 ? "warning" : "default" },
        ]}
      />

      <Tabs selectedKey={view} onSelectionChange={(k: Key) => setView(k as View)} className="mb-4">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Report view">
            <Tabs.Tab id="produk">
              By product
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="pekerjaan">
              By job
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sewa">
              Rental utilisation
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="nilai">
              Inventory value
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="metode">
              Costing methods
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {view === "produk" && (
        <DataTable label="Cost by product" columns={productCols} rows={products.map((p) => ({ ...p, id: p.item.id }))} onRowAction={(r) => navigate(`/items/${r.item.id}`)} />
      )}
      {view === "pekerjaan" && <DataTable label="Cost by job" columns={woCols} rows={done} onRowAction={(w) => navigate(`/work-orders/${w.id}`)} />}
      {view === "sewa" && (
        <>
          <DataTable label="Rental utilisation" columns={utilCols} rows={util.map((u) => ({ ...u, id: u.itemId }))} />
          <p className="mt-2 text-xs text-muted">Utilisation = unit-days out ÷ (units owned × 90 days). Units with low utilisation are better sold or used for other production.</p>
        </>
      )}
      {view === "metode" && <CostingComparison />}
      {view === "nilai" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Inventory value summary">
            <ValRow label="Materials (including offcuts)" value={valuation.materials} total={valuation.total} />
            <ValRow label="— of which offcuts" value={valuation.remnants} total={valuation.total} muted />
            <ValRow label="Finished products" value={valuation.products} total={valuation.total} />
            <ValRow label="— of which on rent" value={valuation.rented} total={valuation.total} muted />
            <ValRow label="— of which damaged" value={valuation.damaged} total={valuation.total} muted />
            <div className="mt-2 flex justify-between border-t border-[var(--rule)] pt-2 font-semibold">
              <span>Total inventory</span>
              <span className="tabular-nums">{formatIDR(valuation.total)}</span>
            </div>
          </Section>
          <Section title="How to read this">
            <ul className="list-disc space-y-2 pl-4 text-sm text-muted">
              <li>Every lot has its own unit cost: purchase (price + shipping), production output (actual cost), or offcut (the average material cost on the job it came from).</li>
              <li>
                The current costing method <b className="text-foreground">{COSTING_LABEL[db.settings.costingMethod]}</b> decides which regular lot goes out first
                (or, for moving average, the shared cost of all lots). Compare the effect on the Costing methods tab.
              </li>
              <li>Offcuts lower the cost of the job that produced them and add to inventory value — they are not lost as cost.</li>
              <li>Dismantling never values materials above their new price; any excess is recorded as a loss.</li>
              <li>Units out on rent remain company assets and are still counted in inventory.</li>
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}

function ValRow({ label, value, total, muted }: { label: string; value: number; total: number; muted?: boolean }) {
  const pct = total ? value / total : 0;
  return (
    <div className={`py-1.5 ${muted ? "pl-3 text-muted" : ""}`}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{formatIDR(value)}</span>
      </div>
      {!muted && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-default">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
