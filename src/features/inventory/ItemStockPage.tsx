import { Button, Link } from "@heroui/react";
import { Combine, GitFork, Pencil, Plus, Recycle } from "lucide-react";
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
  if (!it) return <RecordNotFound what="Item" back="/stock/materials" />;
  const s = stock.get(it.id) ?? emptySummary(it.id);

  const columns: Column<Lot>[] = [
    {
      key: "code",
      header: "Lot",
      isRowHeader: true,
      className: "whitespace-nowrap",
      cell: (l) => (
        <span className="inline-flex items-center gap-1.5 font-medium">
          <Link href={`/stock/lots/${l.id}`} aria-label={`Trace ${l.code}`}>
            {l.code}
          </Link>
          {l.isRemnant && <Recycle className="size-3.5 text-success" aria-label="Offcut" />}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (l) => (
        <div className="flex flex-wrap gap-1">
          <StatusChip tone={LOT_STATUS[l.status].tone}>{LOT_STATUS[l.status].label}</StatusChip>
          {l.reservedForWo && <StatusChip tone="accent">For {woCode.get(l.reservedForWo)}</StatusChip>}
          {next?.id === l.id && <StatusChip tone="default">Next out</StatusChip>}
        </div>
      ),
    },
    {
      key: "origin",
      header: "Origin",
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
    { key: "loc", header: "Location", cell: (l) => l.location },
    { key: "dims", header: "Dimensions", cell: (l) => <span className="whitespace-nowrap text-muted">{formatDims(l.dimensions) || "—"}</span> },
    { key: "qty", header: "Qty", align: "end", cell: (l) => formatQty(l.qty, it.uom) },
    { key: "cost", header: "Unit cost", align: "end", cell: (l) => formatIDR(l.unitCost) },
    { key: "value", header: "Value", align: "end", cell: (l) => formatIDR(l.qty * l.unitCost) },
    {
      key: "act",
      header: "",
      align: "end",
      cell: (l) => (
        <span className="flex justify-end gap-1">
          {l.status === "tersedia" && db.settings.locations.length > 1 && (
            <Button size="sm" variant="ghost" onPress={() => setMoving(l)}>
              Transfer
            </Button>
          )}
          <Button size="sm" variant="ghost" onPress={() => setAdjusting(l)}>
            Count
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        back={it.kind === "material" ? "/stock/materials" : "/stock/products"}
        title={it.name}
        description={`${it.sku} · ${categoryLabel(it.category)} · unit ${it.uom}`}
        actions={
          <>
            <Button variant="secondary" onPress={() => navigate(`/routes/${it.id}`)}>
              <GitFork className="size-4" /> Production routes
            </Button>
            <Button variant="secondary" onPress={() => navigate(`/items/${it.id}`)}>
              <Pencil className="size-4" /> Master data
            </Button>
            {lots.filter((l) => l.status === "tersedia").length >= 2 && (
              <Button variant="secondary" onPress={() => setMerging(true)}>
                <Combine className="size-4" /> Merge lots
              </Button>
            )}
            <Button onPress={() => setAdding(true)}>
              <Plus className="size-4" /> Add stock
            </Button>
          </>
        }
      />
      <MetricStrip className="mb-5" items={[{ label: "Available", value: formatQty(s.available, it.uom), hint: s.remnant ? `incl. offcuts ${formatQty(s.remnant, it.uom)}` : undefined }, { label: "Value", value: formatIDRCompact(s.value) }, { label: "Average cost", value: formatIDR(s.avgUnitCost || it.standardCost), hint: `Standard cost ${formatIDR(it.standardCost)}` }, { label: it.kind === "product" ? "On rent / damaged" : "Reserved", value: it.kind === "product" ? `${s.rented} / ${s.damaged}` : formatQty(s.reserved, it.uom) }]} />
      <Section
        title="Stock lots"
        description={`Costing method ${COSTING_LABEL[method]}${it.costingMethod ? " (this item only)" : ""}. ${
          method === "rata_rata"
            ? "All regular lots share the same average cost; offcuts and job-specific items keep their own cost."
            : method === "identifikasi"
              ? "Each lot leaves at its own unit cost."
              : `Regular lots leave ${method === "fifo" ? "oldest" : "newest"} first; the table is in the order they leave.`
        }`}
        className="mb-6"
        bodyClassName="p-0"
      >
        <DataTable label="Stock lots" columns={columns} rows={lots} dependencies={[woCode, next]} />
      </Section>
      <Section title="Recent movements" bodyClassName="p-0">
        <MovesTable moves={moves} showItem={false} />
      </Section>
      {adding && <OpeningStockDialog itemId={it.id} isOpen={adding} onOpenChange={setAdding} />}
      <LotAdjustDialog lot={adjusting} onClose={() => setAdjusting(null)} />
      <TransferDialog lot={moving} onClose={() => setMoving(null)} />
      <MergeLotsDialog itemId={it.id} isOpen={merging} onOpenChange={setMerging} />
    </>
  );
}
