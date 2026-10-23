import { Button, Link } from "@heroui/react";
import { PackageCheck, Pencil } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import { cancelPurchase, landedUnitCosts, purchaseTotals, receivePurchase, type PurchaseLine } from "@/domain";
import { SelectInput } from "@/components/fields";
import { PaymentsSection } from "@/components/PaymentsSection";
import { RecordNotFound } from "@/components/NotFound";
import { ConfirmButton, DataTable, KeyValue, PageHeader, Row, Section, StatusChip, TaskModal, type Column } from "@/components/ui";
import { formatDate, formatDateTime, formatDims, formatIDR, formatQty } from "@/lib/format";
import { PURCHASE_STATUS } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export default function PurchaseDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [receiving, setReceiving] = useState(false);
  const [location, setLocation] = useState(db.settings.defaultLocation);
  const p = db.purchases.find((x) => x.id === id);
  if (!p) return <RecordNotFound what="Purchase" back="/purchases" />;

  const totals = purchaseTotals(p);
  const landed = landedUnitCosts(p);
  const wo = p.workOrderId ? db.workOrders.find((w) => w.id === p.workOrderId) : undefined;
  const lots = (p.lotIds ?? []).map((lid) => db.lots.find((l) => l.id === lid)).filter((l) => !!l);

  const columns: Column<PurchaseLine & { idx: number }>[] = [
    {
      key: "item",
      header: "Material",
      isRowHeader: true,
      cell: (l) => (
        <div>
          <p className="font-medium">{item(l.itemId)?.name ?? "?"}</p>
          {l.dimensions && <p className="text-xs text-muted">{formatDims(l.dimensions)}</p>}
        </div>
      ),
    },
    { key: "qty", header: "Qty", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
    { key: "price", header: "Price", align: "end", cell: (l) => formatIDR(l.unitPrice) },
    { key: "landed", header: "Unit cost", align: "end", cell: (l) => <b>{formatIDR(landed[l.idx] ?? l.unitPrice)}</b> },
    { key: "sub", header: "Subtotal", align: "end", cell: (l) => formatIDR(l.qty * l.unitPrice) },
  ];

  return (
    <>
      <PageHeader
        back="/purchases"
        title={`Purchase ${p.code}`}
        badge={<StatusChip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</StatusChip>}
        description={`${partnerName(p.supplierId)} · ${formatDate(p.date)}`}
        actions={
          p.status === "draft" && (
            <>
              <ConfirmButton
                variant="danger-soft"
                danger
                title={`Cancel ${p.code}?`}
                description="A cancelled purchase does not add stock."
                confirmLabel="Cancel purchase"
                onConfirm={() => run((d) => cancelPurchase(d, p.id), `${p.code} cancelled`)}
              >
                Cancel
              </ConfirmButton>
              <Button variant="secondary" onPress={() => navigate(`/purchases/${p.id}/edit`)}>
                <Pencil className="size-4" /> Edit
              </Button>
              <Button onPress={() => setReceiving(true)}>
                <PackageCheck className="size-4" /> Receive
              </Button>
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Items" bodyClassName="p-0">
            <DataTable label="Purchased items" columns={columns} rows={p.lines.map((l, idx) => ({ ...l, idx }))} />
          </Section>
          {lots.length > 0 && (
            <Section title="Lots received into the warehouse" bodyClassName="p-0">
              <DataTable
                label="Lot"
                rows={lots}
                onRowAction={(l) => navigate(`/stock/items/${l.itemId}`)}
                columns={[
                  { key: "code", header: "Lot", isRowHeader: true, className: "whitespace-nowrap", cell: (l) => <span className="font-medium">{l.code}</span> },
                  { key: "item", header: "Material", cell: (l) => item(l.itemId)?.name ?? "?" },
                  { key: "loc", header: "Location", cell: (l) => l.location },
                  { key: "res", header: "Reserved", cell: (l) => (l.reservedForWo ? <StatusChip tone="accent">For {wo?.code}</StatusChip> : <span className="text-muted">Free stock</span>) },
                  { key: "left", header: "Remaining", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
                ]}
              />
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Section title="Total">
            <Row label="Items" value={formatIDR(totals.goods)} />
            {p.extraCosts.map((c) => (
              <Row key={c.id} label={c.label} value={formatIDR(c.amount)} />
            ))}
            <div className="my-2 border-t border-[var(--rule)]" />
            <Row label="Purchase total" value={formatIDR(totals.total)} strong />
          </Section>
          {p.status !== "batal" && <PaymentsSection doc="purchase" id={p.id} payments={p.payments} extraNote={p.dueDate ? `Due ${formatDate(p.dueDate)}.` : undefined} />}
          <Section title="Info">
            <KeyValue
              columns={1}
              items={[
                ["Invoice no.", p.invoiceNo],
                ["For", wo ? <Link href={`/work-orders/${wo.id}`}>{`${wo.code} · ${wo.title}`}</Link> : "General stock"],
                ["Received", formatDateTime(p.receivedAt)],
                ["Note", p.note],
              ]}
            />
          </Section>
        </div>
      </div>

      <TaskModal
        isOpen={receiving}
        onOpenChange={setReceiving}
        size="sm"
        title={`Receive ${p.code}`}
        description="Stock goes up by the quantity, at a unit cost that includes extra costs. The material's standard cost is updated too."
        footer={
          <>
            <Button variant="tertiary" onPress={() => setReceiving(false)}>
              Cancel
            </Button>
            <Button
              onPress={() => {
                const ok = run((d) => receivePurchase(d, p.id, { location }), `${p.code} received — stock added`);
                if (ok) setReceiving(false);
              }}
            >
              Receive
            </Button>
          </>
        }
      >
        <SelectInput label="Store at location" value={location} onChange={setLocation} options={db.settings.locations.map((l) => ({ id: l, label: l }))} />
      </TaskModal>
    </>
  );
}
