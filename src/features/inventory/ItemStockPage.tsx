import { Button, Link } from "@heroui/react";
import { Combine, Pencil, Plus, Recycle } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { COSTING_LABEL, costingMethodOf, EPS, emptySummary, layerOrder, nextLayer, type Lot } from "@/domain";
import { RecordNotFound } from "@/components/NotFound";
import { DataTable, PageHeader, Section, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatDims, formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { categoryLabel, LOT_ORIGIN, LOT_STATUS } from "@/lib/labels";
import { docRoute } from "@/lib/routes";
import { useDb, useLookups } from "@/store/db-store";
import { MovesTable } from "./MovesPage";
import { LotAdjustDialog, MergeLotsDialog, OpeningStockDialog, TransferDialog } from "./StockDialogs";

export default function ItemStockPage() {
  const { id } = useParams();
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [adjusting, setAdjusting] = useState<Lot | null>(null);
  const [moving, setMoving] = useState<Lot | null>(null);
  const [merging, setMerging] = useState(false);
  const it = db.items.find((i) => i.id === id);
  const method = costingMethodOf(db, it);
  // Lots are listed in the order the cost formula lets them leave.
  const lots = db.lots.filter((l) => l.itemId === id && l.qty > EPS).sort(layerOrder(method));
  const next = id && (method === "fifo" || method === "lifo") ? nextLayer(db, id) : undefined;
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
          <Link href={`/stok/lot/${l.id}`} aria-label={`Telusuri ${l.code}`}>
            {l.code}
          </Link>
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
          {next?.id === l.id && <StatusChip tone="default">Keluar berikutnya</StatusChip>}
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
        <span className="flex justify-end gap-1">
          {l.status === "tersedia" && db.settings.locations.length > 1 && (
            <Button size="sm" variant="ghost" onPress={() => setMoving(l)}>
              Pindah
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => setAdjusting(l)}>
            Opname
          </Button>
        </span>
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
            {lots.filter((l) => l.status === "tersedia").length >= 2 && (
              <Button variant="secondary" onPress={() => setMerging(true)}>
                <Combine className="size-4" /> Gabung lot
              </Button>
            )}
            <Button onPress={() => setAdding(true)}>
              <Plus className="size-4" /> Tambah stok
            </Button>
          </>
        }
      />
      <MetricStrip className="mb-5" items={[{ label: "Tersedia", value: formatQty(s.available, it.uom), hint: s.remnant ? `termasuk sisa ${formatQty(s.remnant, it.uom)}` : undefined }, { label: "Nilai", value: formatIDRCompact(s.value) }, { label: "Harga rata-rata", value: formatIDR(s.avgUnitCost || it.standardCost), hint: `Harga standar ${formatIDR(it.standardCost)}` }, { label: it.kind === "product" ? "Disewa / rusak" : "Dicadangkan", value: it.kind === "product" ? `${s.rented} / ${s.damaged}` : formatQty(s.reserved, it.uom) }]} />
      <Section
        title="Lot stok"
        description={`Metode biaya ${COSTING_LABEL[method]}${it.costingMethod ? " (khusus item ini)" : ""}. ${
          method === "rata_rata"
            ? "Semua lot biasa memakai harga rata-rata yang sama; sisa dan barang khusus pekerjaan memakai harganya sendiri."
            : method === "identifikasi"
              ? "Setiap lot keluar dengan harga pokoknya sendiri."
              : `Lot biasa keluar dari yang ${method === "fifo" ? "terlama" : "terbaru"}; urutan di tabel mengikuti urutan keluar.`
        }`}
        className="mb-6"
        bodyClassName="p-0"
      >
        <DataTable label="Lot stok" columns={columns} rows={lots} dependencies={[woCode, next]} />
      </Section>
      <Section title="Mutasi terakhir" bodyClassName="p-0">
        <MovesTable moves={moves} showItem={false} />
      </Section>
      {adding && <OpeningStockDialog itemId={it.id} isOpen={adding} onOpenChange={setAdding} />}
      <LotAdjustDialog lot={adjusting} onClose={() => setAdjusting(null)} />
      <TransferDialog lot={moving} onClose={() => setMoving(null)} />
      <MergeLotsDialog itemId={it.id} isOpen={merging} onOpenChange={setMerging} />
    </>
  );
}
