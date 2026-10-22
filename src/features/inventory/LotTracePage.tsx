import { Button, Link } from "@heroui/react";
import { Recycle } from "lucide-react";
import { useMemo } from "react";
import { useNavigate, useParams } from "react-router";
import { lotFate, lotTrace } from "@/domain";
import { FlowDiagram } from "@/components/FlowDiagram";
import { RecordNotFound } from "@/components/NotFound";
import { KeyValue, MetricStrip, PageHeader, Section, StatusChip } from "@/components/ui";
import { formatDate, formatDims, formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { LOT_ORIGIN, LOT_STATUS } from "@/lib/labels";
import { docRoute } from "@/lib/routes";
import { useDb } from "@/store/db-store";
import { MovesTable } from "./MovesPage";

/** One lot's genealogy: where it came from and where every part of it went. */
export default function LotTracePage() {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const lot = db.lots.find((l) => l.id === id);
  const trace = useMemo(() => (lot ? lotTrace(db, lot.id) : null), [db, lot]);
  const fate = useMemo(() => (lot ? lotFate(db, [lot.id]) : null), [db, lot]);
  const moves = useMemo(() => db.moves.filter((m) => m.lotId === id).sort((a, b) => b.at.localeCompare(a.at)), [db.moves, id]);
  if (!lot || !trace || !fate) return <RecordNotFound what="Lot" back="/stok/material" />;
  const item = db.items.find((i) => i.id === lot.itemId);
  const parent = lot.splitFrom ? db.lots.find((l) => l.id === lot.splitFrom) : undefined;
  const route = lot.originRef ? docRoute(lot.originRef) : undefined;

  return (
    <>
      <PageHeader
        back={`/stok/item/${lot.itemId}`}
        title={
          <span className="inline-flex items-center gap-2">
            {lot.code}
            {lot.isRemnant && <Recycle className="size-4 text-success" aria-label="Sisa" />}
          </span>
        }
        badge={<StatusChip tone={LOT_STATUS[lot.status].tone}>{LOT_STATUS[lot.status].label}</StatusChip>}
        description={`${item?.name ?? "?"} · masuk ${formatDate(lot.createdAt)} · ${lot.location}`}
        actions={
          <Button variant="secondary" onPress={() => navigate(`/stok/item/${lot.itemId}`)}>
            Semua lot {item?.name}
          </Button>
        }
      />
      <MetricStrip
        className="mb-6"
        items={[
          { label: "Sisa di lot", value: formatQty(lot.qty, item?.uom), hint: formatIDR(lot.qty * lot.unitCost) },
          { label: "Terjual", value: formatIDRCompact(fate.sold) },
          { label: "Diolah di produksi", value: formatIDRCompact(fate.reused) },
          { label: "Hilang / dibuang", value: formatIDRCompact(fate.lost), tone: fate.lost > 0 ? "danger" : "default" },
        ]}
      />
      <Section
        title="Asal-usul & tujuan"
        description="Ke kiri: dari mana lot ini datang (pembelian, pekerjaan, bahan-bahannya). Ke kanan: ke mana isinya pergi. Lebar aliran = nilai rupiah. Jejak ini yang dibutuhkan untuk SVLK dan uji tuntas EUDR."
        className="mb-6"
        bodyClassName="p-0"
      >
        <FlowDiagram graph={trace} label={`Telusur ${lot.code}`} empty="Lot ini belum punya riwayat masuk atau keluar." />
      </Section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="Mutasi lot" className="xl:col-span-2" bodyClassName="p-0">
          <MovesTable moves={moves} showItem={false} />
        </Section>
        <Section title="Data lot">
          <KeyValue
            columns={1}
            items={[
              ["Asal", <>{LOT_ORIGIN[lot.origin]} {route ? <Link href={route}>{lot.originRef!.code}</Link> : lot.originRef?.code}</>],
              ["Harga pokok", `${formatIDR(lot.unitCost)} / ${item?.uom ?? ""}`],
              ["Ukuran", formatDims(lot.dimensions)],
              ["Dipecah dari", parent ? <Link href={`/stok/lot/${parent.id}`}>{parent.code}</Link> : undefined],
              [
                "Gabungan dari",
                lot.mergedFrom?.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {lot.mergedFrom.map((mid) => {
                      const m = db.lots.find((x) => x.id === mid);
                      return m ? (
                        <Link key={mid} href={`/stok/lot/${mid}`}>
                          {m.code}
                        </Link>
                      ) : null;
                    })}
                  </span>
                ) : undefined,
              ],
              ["Catatan", lot.note],
            ]}
          />
        </Section>
      </div>
    </>
  );
}
