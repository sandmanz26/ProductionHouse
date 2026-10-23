import { Button } from "@heroui/react";
import { Layers, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { emptySummary, freeQtyFor, openDemand, sum, type Item, type MaterialCategory, type StockSummary } from "@/domain";
import { SelectInput } from "@/components/fields";
import { DataTable, EmptyBlock, PageHeader, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { MATERIAL_CATEGORY } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type RowT = Item & { s: StockSummary; free: number; demand: number; status: "aman" | "menipis" | "kurang" | "habis" };

export default function MaterialStockPage() {
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [cat, setCat] = useState("semua");

  const rows = useMemo<RowT[]>(() => {
    const demand = openDemand(db);
    return db.items
      .filter((i) => i.kind === "material" && !i.archived)
      .filter((i) => cat === "semua" || i.category === cat)
      .map((i) => {
        const s = stock.get(i.id) ?? emptySummary(i.id);
        const free = freeQtyFor(db, i.id);
        const d = demand.get(i.id) ?? 0;
        const status: RowT["status"] =
          s.available <= 0 ? "habis" : free < d ? "kurang" : free - d < (i.reorderPoint ?? 0) ? "menipis" : "aman";
        return { ...i, s, free, demand: d, status };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db, stock, cat]);

  const totalValue = sum(rows.map((r) => r.s.value));
  const remnantValue = sum(rows.map((r) => r.s.remnantValue));
  const attention = rows.filter((r) => r.status !== "aman").length;

  const STATUS = {
    aman: { label: "OK", tone: "success" },
    menipis: { label: "Running low", tone: "warning" },
    kurang: { label: "Short for production", tone: "danger" },
    habis: { label: "Out of stock", tone: "danger" },
  } as const;

  const columns: Column<RowT>[] = [
    {
      key: "name",
      header: "Material",
      isRowHeader: true,
      cell: (r) => (
        <div className="sm:min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">
            {r.sku} · {MATERIAL_CATEGORY[r.category as MaterialCategory] ?? r.category}
          </p>
        </div>
      ),
    },
    {
      key: "avail",
      header: "Available",
      align: "end",
      cell: (r) => (
        <div>
          <p className="font-medium">{formatQty(r.s.available, r.uom)}</p>
          {r.s.remnant > 0 && <p className="text-xs text-success">offcuts {formatQty(r.s.remnant, r.uom)}</p>}
          {r.s.reserved > 0 && <p className="text-xs text-accent">reserved {formatQty(r.s.reserved, r.uom)}</p>}
        </div>
      ),
    },
    { key: "demand", header: "Needed for production", align: "end", cell: (r) => (r.demand ? formatQty(r.demand, r.uom) : <span className="text-muted">—</span>) },
    { key: "avg", header: "Average cost", align: "end", cell: (r) => formatIDR(r.s.avgUnitCost || r.standardCost) },
    { key: "value", header: "Value", align: "end", cell: (r) => formatIDR(r.s.value) },
    { key: "status", header: "Status", cell: (r) => <StatusChip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Material stock"
        description="Available includes offcuts and stock reserved for work orders."
        actions={
          <Button variant="secondary" onPress={() => navigate("/purchases/new?from=suggestions")}>
            <ShoppingCart className="size-4" /> Buy what is running low
          </Button>
        }
      />
      <MetricStrip className="mb-5" items={[{ label: "Material value", value: formatIDRCompact(totalValue) }, { label: "Of which offcuts", value: formatIDRCompact(remnantValue), tone: "success", onPress: () => navigate("/stock/offcuts") }, { label: "Needs attention", value: attention, hint: "Running low, short or out of stock", tone: attention ? "warning" : "default" }]} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SelectInput
          aria-label="Category"
          className="sm:w-56"
          value={cat}
          onChange={setCat}
          options={[{ id: "semua", label: "All categories" }, ...Object.entries(MATERIAL_CATEGORY).map(([id, label]) => ({ id, label }))]}
        />
      </div>
      <DataTable
        toolbar
        label="Material stock"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/stock/items/${r.id}`)}
        empty={<EmptyBlock icon={<Layers className="size-5" />} title="No materials" description="Add materials under Products & materials." />}
      />
    </>
  );
}
