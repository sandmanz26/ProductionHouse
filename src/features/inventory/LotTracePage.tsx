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
  if (!lot || !trace || !fate) return <RecordNotFound what="Lot" back="/stock/materials" />;
  const item = db.items.find((i) => i.id === lot.itemId);
  const parent = lot.splitFrom ? db.lots.find((l) => l.id === lot.splitFrom) : undefined;
  const route = lot.originRef ? docRoute(lot.originRef) : undefined;

  return (
    <>
      <PageHeader
        back={`/stock/items/${lot.itemId}`}
        title={
          <span className="inline-flex items-center gap-2">
            {lot.code}
            {lot.isRemnant && <Recycle className="size-4 text-success" aria-label="Offcut" />}
          </span>
        }
        badge={<StatusChip tone={LOT_STATUS[lot.status].tone}>{LOT_STATUS[lot.status].label}</StatusChip>}
        description={`${item?.name ?? "?"} · received ${formatDate(lot.createdAt)} · ${lot.location}`}
        actions={
          <Button variant="secondary" onPress={() => navigate(`/stock/items/${lot.itemId}`)}>
            All lots of {item?.name}
          </Button>
        }
      />
      <MetricStrip
        className="mb-6"
        items={[
          { label: "Left in lot", value: formatQty(lot.qty, item?.uom), hint: formatIDR(lot.qty * lot.unitCost) },
          { label: "Sold", value: formatIDRCompact(fate.sold) },
          { label: "Used in production", value: formatIDRCompact(fate.reused) },
          { label: "Lost / discarded", value: formatIDRCompact(fate.lost), tone: fate.lost > 0 ? "danger" : "default" },
        ]}
      />
      <Section
        title="Origin & destination"
        description="To the left: where this lot came from (purchase, job, its materials). To the right: where its contents went. Flow width = rupiah value. This is the trail SVLK and EUDR due diligence need."
        className="mb-6"
        bodyClassName="p-0"
      >
        <FlowDiagram graph={trace} label={`Trace ${lot.code}`} empty="This lot has no movements in or out yet." />
      </Section>
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="Lot movements" className="xl:col-span-2" bodyClassName="p-0">
          <MovesTable moves={moves} showItem={false} />
        </Section>
        <Section title="Lot details">
          <KeyValue
            columns={1}
            items={[
              ["Origin", <>{LOT_ORIGIN[lot.origin]} {route ? <Link href={route}>{lot.originRef!.code}</Link> : lot.originRef?.code}</>],
              ["Unit cost", `${formatIDR(lot.unitCost)} / ${item?.uom ?? ""}`],
              ["Dimensions", formatDims(lot.dimensions)],
              ["Split from", parent ? <Link href={`/stock/lots/${parent.id}`}>{parent.code}</Link> : undefined],
              [
                "Merged from",
                lot.mergedFrom?.length ? (
                  <span className="flex flex-wrap gap-x-2">
                    {lot.mergedFrom.map((mid) => {
                      const m = db.lots.find((x) => x.id === mid);
                      return m ? (
                        <Link key={mid} href={`/stock/lots/${mid}`}>
                          {m.code}
                        </Link>
                      ) : null;
                    })}
                  </span>
                ) : undefined,
              ],
              ["Note", lot.note],
            ]}
          />
        </Section>
      </div>
    </>
  );
}
