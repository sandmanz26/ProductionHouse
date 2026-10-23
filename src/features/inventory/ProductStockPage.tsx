import { Button } from "@heroui/react";
import { Armchair, Wrench } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { createRepairOrder, EPS, emptySummary, markLotUsable, sum, type Item, type StockSummary } from "@/domain";
import { ConfirmButton, DataTable, EmptyBlock, PageHeader, Section, MetricStrip, type Column } from "@/components/ui";
import { formatIDR, formatIDRCompact } from "@/lib/format";
import { PRODUCT_CATEGORY } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

type RowT = Item & { s: StockSummary };

export default function ProductStockPage() {
  const db = useDb();
  const run = useRun();
  const { stock, item } = useLookups();
  const navigate = useNavigate();

  const rows = useMemo<RowT[]>(
    () =>
      db.items
        .filter((i) => i.kind === "product" && !i.archived)
        .map((i) => ({ ...i, s: stock.get(i.id) ?? emptySummary(i.id) }))
        .sort((a, b) => b.s.value - a.s.value || a.name.localeCompare(b.name)),
    [db.items, stock],
  );
  const damaged = db.lots.filter((l) => l.status === "rusak" && l.qty > EPS && item(l.itemId)?.kind === "product");
  const inRepair = new Set(db.workOrders.filter((w) => w.status === "rencana" || w.status === "berjalan").flatMap((w) => w.plannedInputs.map((i) => i.lotId)));

  const columns: Column<RowT>[] = [
    {
      key: "name",
      header: "Product",
      isRowHeader: true,
      cell: (r) => (
        <div className="sm:min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">
            {r.sku} · {PRODUCT_CATEGORY[r.category as keyof typeof PRODUCT_CATEGORY] ?? r.category}
          </p>
        </div>
      ),
    },
    { key: "avail", header: "Ready to sell/rent", align: "end", cell: (r) => <span className="font-medium">{r.s.available}</span> },
    { key: "rent", header: "On rent", align: "end", cell: (r) => r.s.rented || <span className="text-muted">0</span> },
    { key: "dmg", header: "Damaged", align: "end", cell: (r) => (r.s.damaged ? <span className="text-danger">{r.s.damaged}</span> : <span className="text-muted">0</span>) },
    { key: "hpp", header: "Average unit cost", align: "end", cell: (r) => (r.s.total ? formatIDR(r.s.avgUnitCost) : <span className="text-muted">—</span>) },
    { key: "price", header: "Sale price", align: "end", cell: (r) => (r.salePrice ? formatIDR(r.salePrice) : "—") },
    { key: "value", header: "Stock value", align: "end", cell: (r) => formatIDR(r.s.value) },
  ];

  return (
    <>
      <PageHeader
        title="Product stock"
        description="By status: ready, on rent, damaged. Unit cost comes from the actual production lots."
      />
      <MetricStrip className="mb-5" items={[{ label: "Product value", value: formatIDRCompact(sum(rows.map((r) => r.s.value))) }, { label: "Units ready", value: sum(rows.map((r) => r.s.available)), tone: "success" }, { label: "Units on rent", value: sum(rows.map((r) => r.s.rented)), tone: "accent", onPress: () => navigate("/rentals") }, { label: "Units damaged", value: sum(rows.map((r) => r.s.damaged)), tone: damaged.length ? "danger" : "default" }]} />

      {damaged.length > 0 && (
        <Section title="Damaged units" description="Repair through a work order so the repair cost goes into the unit cost, or mark as usable if it only needs cleaning." className="mb-6" bodyClassName="p-0">
          <ul className="divide-y divide-separator">
            {damaged.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {item(l.itemId)?.name} <span className="font-normal text-muted">· {l.code} · {l.qty} units</span>
                  </p>
                  <p className="text-xs text-muted">
                    Unit cost {formatIDR(l.unitCost)} · {l.location}
                  </p>
                </div>
                <div className="flex gap-2">
                  {inRepair.has(l.id) ? (
                    <span className="text-sm text-accent">In repair</span>
                  ) : (
                    <>
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        title="Mark unit as usable?"
                        description="Use this when the damage is very minor and needs no materials or labour."
                        confirmLabel="Mark as usable"
                        onConfirm={() => run((d) => markLotUsable(d, l.id), "Unit available again")}
                      >
                        Mark as usable
                      </ConfirmButton>
                      <Button
                        size="sm"
                        onPress={() => {
                          const wo = run((d) => createRepairOrder(d, l.id), (w) => `${w.code} created`);
                          if (wo) navigate(`/work-orders/${wo.id}`);
                        }}
                      >
                        <Wrench className="size-4" /> Repair
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <DataTable
        label="Product stock"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/stock/items/${r.id}`)}
        empty={<EmptyBlock icon={<Armchair className="size-5" />} title="No finished products yet" description="Products enter the warehouse when a work order is completed or a partial output is received." />}
      />
    </>
  );
}
