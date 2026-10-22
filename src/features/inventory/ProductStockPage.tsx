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
      header: "Produk",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">
            {r.sku} · {PRODUCT_CATEGORY[r.category as keyof typeof PRODUCT_CATEGORY] ?? r.category}
          </p>
        </div>
      ),
    },
    { key: "avail", header: "Siap jual/sewa", align: "end", cell: (r) => <span className="font-medium">{r.s.available}</span> },
    { key: "rent", header: "Disewa", align: "end", cell: (r) => r.s.rented || <span className="text-muted">0</span> },
    { key: "dmg", header: "Rusak", align: "end", cell: (r) => (r.s.damaged ? <span className="text-danger">{r.s.damaged}</span> : <span className="text-muted">0</span>) },
    { key: "hpp", header: "HPP rata-rata", align: "end", cell: (r) => (r.s.total ? formatIDR(r.s.avgUnitCost) : <span className="text-muted">—</span>) },
    { key: "price", header: "Harga jual", align: "end", cell: (r) => (r.salePrice ? formatIDR(r.salePrice) : "—") },
    { key: "value", header: "Nilai stok", align: "end", cell: (r) => formatIDR(r.s.value) },
  ];

  return (
    <>
      <PageHeader
        title="Stok Produk"
        description="Per status: siap, disewa, rusak. HPP dari lot produksi aktual."
      />
      <MetricStrip className="mb-5" items={[{ label: "Nilai produk", value: formatIDRCompact(sum(rows.map((r) => r.s.value))) }, { label: "Unit siap", value: sum(rows.map((r) => r.s.available)), tone: "success" }, { label: "Unit disewa", value: sum(rows.map((r) => r.s.rented)), tone: "accent", onPress: () => navigate("/sewa") }, { label: "Unit rusak", value: sum(rows.map((r) => r.s.damaged)), tone: damaged.length ? "danger" : "default" }]} />

      {damaged.length > 0 && (
        <Section title="Unit rusak" description="Perbaiki lewat perintah kerja agar biaya perbaikan masuk ke HPP unit, atau tandai layak bila hanya perlu dibersihkan." className="mb-6" bodyClassName="p-0">
          <ul className="divide-y divide-separator">
            {damaged.map((l) => (
              <li key={l.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {item(l.itemId)?.name} <span className="font-normal text-muted">· {l.code} · {l.qty} unit</span>
                  </p>
                  <p className="text-xs text-muted">
                    HPP {formatIDR(l.unitCost)} · {l.location}
                  </p>
                </div>
                <div className="flex gap-2">
                  {inRepair.has(l.id) ? (
                    <span className="text-sm text-accent">Sedang diperbaiki</span>
                  ) : (
                    <>
                      <ConfirmButton
                        size="sm"
                        variant="ghost"
                        title="Tandai unit layak?"
                        description="Gunakan bila kerusakan sangat ringan dan tidak butuh bahan/tenaga kerja."
                        confirmLabel="Tandai layak"
                        onConfirm={() => run((d) => markLotUsable(d, l.id), "Unit kembali tersedia")}
                      >
                        Tandai layak
                      </ConfirmButton>
                      <Button
                        size="sm"
                        onPress={() => {
                          const wo = run((d) => createRepairOrder(d, l.id), (w) => `${w.code} dibuat`);
                          if (wo) navigate(`/produksi/${wo.id}`);
                        }}
                      >
                        <Wrench className="size-4" /> Perbaiki
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
        label="Stok produk"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/stok/item/${r.id}`)}
        empty={<EmptyBlock icon={<Armchair className="size-5" />} title="Belum ada produk" />}
      />
    </>
  );
}
