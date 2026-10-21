import { Button, Link } from "@heroui/react";
import { Pencil, Plus, Recycle } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { EPS, emptySummary, type Lot } from "@/domain";
import { RecordNotFound } from "@/components/NotFound";
import { DataTable, PageHeader, Section, StatCard, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatDims, formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { categoryLabel, LOT_ORIGIN, LOT_STATUS } from "@/lib/labels";
import { docRoute } from "@/lib/routes";
import { useDb, useLookups } from "@/store/db-store";
import { MovesTable } from "./MovesPage";
import { LotAdjustDialog, OpeningStockDialog } from "./StockDialogs";

export default function ItemStockPage() {
  const { id } = useParams();
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Lot | null>(null);
  const it = db.items.find((i) => i.id === id);
  const lots = useMemo(() => db.lots.filter((l) => l.itemId === id && l.qty > EPS).sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [db.lots, id]);
  const moves = useMemo(() => db.moves.filter((m) => m.itemId === id).sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60), [db.moves, id]);
  const woCode = useMemo(() => new Map(db.workOrders.map((w) => [w.id, w.code])), [db.workOrders]);
  if (!it) return <RecordNotFound what="Item" back="/stok/material" />;
  const s = stock.get(it.id) ?? emptySummary(it.id);

  const columns: Column<Lot>[] = [
    {
      key: "code",
      header: "Lot",
      isRowHeader: true,
      className: "whitespace-nowrap",
      cell: (l) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          {l.code}
          {l.isRemnant && <Recycle className="size-3.5 text-success" aria-label="Sisa" />}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          <StatusChip tone={LOT_STATUS[l.status].tone}>{LOT_STATUS[l.status].label}</StatusChip>
          {l.reservedForWo && <StatusChip tone="accent">Untuk {woCode.get(l.reservedForWo)}</StatusChip>}
        </div>
      ),
    },
    {
      key: "origin",
      header: "Asal",
      cell: (l) => {
        const route = l.originRef ? docRoute(l.originRef) : undefined;
        return (
          <div className="text-sm">
            <p>{LOT_ORIGIN[l.origin]}</p>
            {route ? <Link href={route} className="text-xs">{l.originRef!.code}</Link> : <p className="text-xs text-muted">{formatDate(l.createdAt)}</p>}
          </div>
        );
      },
    },
    { key: "loc", header: "Lokasi", cell: (l) => l.location },
    { key: "dims", header: "Ukuran", cell: (l) => <span className="whitespace-nowrap text-muted">{formatDims(l.dimensions) || "—"}</span> },
    { key: "qty", header: "Qty", align: "end", cell: (l) => formatQty(l.qty, it.uom) },
    { key: "cost", header: "Harga pokok", align: "end", cell: (l) => formatIDR(l.unitCost) },
    { key: "value", header: "Nilai", align: "end", cell: (l) => formatIDR(l.qty * l.unitCost) },
    {
      key: "act",
      header: "",
      align: "end",
      cell: (l) => (
        <Button size="sm" variant="ghost" onPress={() => setAdjusting(l)}>
          Opname
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        back={it.kind === "material" ? "/stok/material" : "/stok/produk"}
        title={it.name}
        description={`${it.sku} · ${categoryLabel(it.category)} · satuan ${it.uom}`}
        actions={
          <>
            <Button variant="secondary" onPress={() => navigate(`/master/item/${it.id}`)}>
              <Pencil className="size-4" /> Data master
            </Button>
            <Button onPress={() => setAdding(true)}>
              <Plus className="size-4" /> Tambah stok
            </Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Tersedia" value={formatQty(s.available, it.uom)} hint={s.remnant ? `termasuk sisa ${formatQty(s.remnant, it.uom)}` : undefined} />
        <StatCard label="Nilai" value={formatIDRCompact(s.value)} />
        <StatCard label="Harga rata-rata" value={formatIDR(s.avgUnitCost || it.standardCost)} hint={`Harga standar ${formatIDR(it.standardCost)}`} />
        <StatCard
          label={it.kind === "product" ? "Disewa / rusak" : "Dicadangkan"}
          value={it.kind === "product" ? `${s.rented} / ${s.damaged}` : formatQty(s.reserved, it.uom)}
        />
      </div>
      <Section title="Lot stok" description="Setiap lot membawa harga pokoknya sendiri — inilah yang membuat HPP akurat." className="mb-6" bodyClassName="p-0">
        <DataTable label="Lot stok" columns={columns} rows={lots} dependencies={[woCode]} />
      </Section>
      <Section title="Mutasi terakhir" bodyClassName="p-0">
        <MovesTable moves={moves} showItem={false} />
      </Section>
      {adding && <OpeningStockDialog itemId={it.id} isOpen={adding} onOpenChange={setAdding} />}
      <LotAdjustDialog lot={adjusting} onClose={() => setAdjusting(null)} />
    </>
  );
}
