import { Button, Link } from "@heroui/react";
import { Hammer, Recycle, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { remnantRows, scrapLot, sum, type Item, type Lot, type RemnantRow } from "@/domain";
import { SelectInput } from "@/components/fields";
import { ConfirmButton, DataTable, EmptyBlock, PageHeader, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatDims, formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { docRoute } from "@/lib/routes";
import { useDb, useRun } from "@/store/db-store";
import { LotAdjustDialog } from "./StockDialogs";

/** Products whose BOM need of this material fits in the remnant. */
function fitsFor(products: Item[], lot: Lot) {
  return products
    .map((p) => {
      const need = p.bom?.find((b) => b.materialId === lot.itemId)?.qty ?? 0;
      return need > 0 && need <= lot.qty ? { product: p, times: Math.floor(lot.qty / need) } : undefined;
    })
    .filter((x): x is { product: Item; times: number } => !!x)
    .sort((a, b) => (b.product.salePrice ?? 0) - (a.product.salePrice ?? 0))
    .slice(0, 2);
}

export default function RemnantsPage() {
  const db = useDb();
  const run = useRun();
  const navigate = useNavigate();
  const [material, setMaterial] = useState("semua");
  const [adjusting, setAdjusting] = useState<Lot | null>(null);

  const all = useMemo(() => remnantRows(db), [db]);
  const rows = all.filter((r) => material === "semua" || r.item.id === material);
  const products = useMemo(() => db.items.filter((i) => i.kind === "product" && !i.archived), [db.items]);
  const materials = [...new Map(all.map((r) => [r.item.id, r.item])).values()];

  const columns: Column<RemnantRow & { id: string }>[] = [
    {
      key: "item",
      header: "Material",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{r.item.name}</p>
          <p className="text-xs text-muted">
            {r.lot.code} · {r.lot.location}
          </p>
        </div>
      ),
    },
    { key: "dims", header: "Dimensions", cell: (r) => <span className="whitespace-nowrap">{formatDims(r.lot.dimensions) || <span className="text-muted">—</span>}</span> },
    { key: "qty", header: "Qty", align: "end", cell: (r) => formatQty(r.lot.qty, r.item.uom) },
    { key: "value", header: "Value", align: "end", cell: (r) => formatIDR(r.value) },
    {
      key: "age",
      header: "Age",
      className: "whitespace-nowrap",
      cell: (r) => <StatusChip tone={r.aging ? "warning" : "default"}>{r.ageDays} days</StatusChip>,
    },
    {
      key: "origin",
      header: "From",
      cell: (r) => {
        const route = r.lot.originRef ? docRoute(r.lot.originRef) : undefined;
        return route ? (
          <Link href={route}>{r.lot.originRef!.code}</Link>
        ) : (
          <span className="line-clamp-2 max-w-36 text-xs text-muted" title={r.lot.note}>
            {r.lot.note ?? "Opening stock"}
          </span>
        );
      },
    },
    {
      key: "fit",
      header: "Enough for",
      cell: (r) => {
        const fits = fitsFor(products, r.lot);
        return fits.length ? (
          <div className="flex min-w-40 flex-col text-xs">
            {fits.map((f) => (
              <span key={f.product.id}>
                {f.times}× {f.product.name}
              </span>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted">—</span>
        );
      },
    },
    {
      key: "act",
      header: "",
      align: "end",
      cell: (r) => (
        <div className="flex justify-end gap-1">
          <Button size="sm" variant="ghost" onPress={() => setAdjusting(r.lot)}>
            Count
          </Button>
          <ConfirmButton
            size="sm"
            variant="ghost"
            danger
            title={`Scrap ${r.lot.code} as waste?`}
            description={`Value ${formatIDR(r.value)} is recorded as waste and leaves stock.`}
            confirmLabel="Scrap as waste"
            onConfirm={() => run((d) => scrapLot(d, r.lot.id), `${r.lot.code} recorded as waste`)}
          >
            <Trash2 className="size-4" />
          </ConfirmButton>
        </div>
      ),
    },
  ];

  const aging = all.filter((r) => r.aging);

  return (
    <>
      <PageHeader
        title="Offcuts"
        description="Usable offcuts. Suggested first when materials are issued."
        actions={
          <Button variant="secondary" onPress={() => navigate("/work-orders/new")}>
            <Hammer className="size-4" /> Make from offcuts
          </Button>
        }
      />
      <MetricStrip
        className="mb-5"
        items={[
          { label: "Available offcut value", value: formatIDRCompact(sum(all.map((r) => r.value))) },
          { label: "Offcut count", value: all.length, hint: `${materials.length} materials` },
          {
            label: `Older than ${db.settings.remnantAgingDays} days`,
            value: formatIDRCompact(sum(aging.map((r) => r.value))),
            hint: `${aging.length} offcuts — use or sell them`,
            tone: aging.length ? "warning" : "default",
          },
        ]}
      />
      <div className="mb-4">
        <SelectInput
          aria-label="Filter material"
          className="sm:w-72"
          value={material}
          onChange={setMaterial}
          options={[{ id: "semua", label: "All materials" }, ...materials.map((m) => ({ id: m.id, label: m.name }))]}
        />
      </div>
      <DataTable
        label="Offcuts"
        columns={columns}
        rows={rows.map((r) => ({ ...r, id: r.lot.id }))}
        dependencies={[products]}
        empty={<EmptyBlock icon={<Recycle className="size-5" />} title="No offcuts yet" description="Usable offcuts are recorded when a work order is completed — each with its own size and cost." />}
      />
      <LotAdjustDialog lot={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}
