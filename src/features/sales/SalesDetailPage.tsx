import { Alert, Button, Link, Meter } from "@heroui/react";
import { FileText, Hammer, PackageCheck, Pencil, Truck, Undo2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  cancelSalesOrder,
  completeSalesOrder,
  confirmSalesOrder,
  CONTAINER_LABEL,
  createWorkOrdersForShortage,
  deliveredQty,
  dpStatus,
  returnSale,
  saleReturnedQty,
  deliverSalesOrder,
  exportWarnings,
  freeQtyFor,
  outstandingLines,
  packingList,
  productionShortages,
  roundQty,
  salesTotals,
  updateExportInfo,
  type ExportInfo,
  type ID,
  type SalesLine,
  type SalesOrder,
} from "@/domain";
import { NumberInput, SelectInput, TextInput } from "@/components/fields";
import { PaymentsSection } from "@/components/PaymentsSection";
import { RecordNotFound } from "@/components/NotFound";
import { ConfirmButton, DataTable, KeyValue, PageHeader, Row, Section, StatusChip, Tag, TaskModal, type Column } from "@/components/ui";
import { formatDate, formatDateTime, formatIDR, formatMoney, formatNumber, formatPct, formatQty } from "@/lib/format";
import { SALES_CHANNEL, SALES_STATUS, WO_STATUS } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { ExportFields } from "./ExportFields";

export default function SalesDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [delivering, setDelivering] = useState(false);
  const [editingExport, setEditingExport] = useState(false);
  const [returning, setReturning] = useState(false);
  const so = db.sales.find((s) => s.id === id);
  if (!so) return <RecordNotFound what="Order" back="/sales" />;

  const totals = salesTotals(db, so);
  const shortages = productionShortages(db, so);
  const warnings = exportWarnings(db, so);
  const pl = so.channel === "ekspor" ? packingList(db, so) : undefined;
  const wos = db.workOrders.filter((w) => w.salesOrderId === so.id);
  const canDeliver = so.status === "dikonfirmasi" || so.status === "dikirim_sebagian";
  const open = so.status !== "batal" && so.status !== "selesai";

  const columns: Column<SalesLine>[] = [
    {
      key: "item",
      header: "Item",
      isRowHeader: true,
      cell: (l) => (
        <div className="sm:min-w-40">
          <p className="font-medium">{item(l.itemId)?.name ?? "?"}</p>
          {l.spec && <p className="text-xs text-muted">Spec: {l.spec}</p>}
        </div>
      ),
    },
    { key: "qty", header: "Ordered", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
    { key: "sent", header: "Shipped", align: "end", cell: (l) => formatQty(deliveredQty(so, l.itemId), item(l.itemId)?.uom) },
    {
      key: "stock",
      header: "Ready stock",
      align: "end",
      cell: (l) => {
        const free = freeQtyFor(db, l.itemId);
        const outstanding = l.qty - deliveredQty(so, l.itemId);
        return <span className={open && outstanding > 0 && free < outstanding ? "text-warning" : ""}>{formatQty(free, item(l.itemId)?.uom)}</span>;
      },
    },
    { key: "price", header: "Price", align: "end", cell: (l) => formatMoney(l.unitPrice, so.currency) },
    { key: "sub", header: "Subtotal", align: "end", cell: (l) => formatMoney(l.qty * l.unitPrice, so.currency) },
  ];

  return (
    <>
      <PageHeader
        back="/sales"
        title={`${so.code} · ${partnerName(so.customerId)}`}
        badge={
          <>
            <Tag>{SALES_CHANNEL[so.channel]}</Tag>
            <StatusChip tone={SALES_STATUS[so.status].tone}>{SALES_STATUS[so.status].label}</StatusChip>
          </>
        }
        description={`Order ${formatDate(so.date)}${so.dueDate ? ` · ship by ${formatDate(so.dueDate)}` : ""}`}
        actions={
          <>
            {so.status === "draft" && (
              <ConfirmButton
                variant="danger-soft"
                danger
                title={`Cancel ${so.code}?`}
                confirmLabel="Cancel order"
                onConfirm={() => run((d) => cancelSalesOrder(d, so.id), `${so.code} cancelled`)}
              >
                Cancel
              </ConfirmButton>
            )}
            {so.channel === "ekspor" && (
              <Button variant="secondary" onPress={() => navigate(`/sales/${so.id}/documents`)}>
                <FileText className="size-4" /> Export documents
              </Button>
            )}
            {(so.status === "draft" || so.status === "dikonfirmasi") && so.deliveries.length === 0 && (
              <Button variant="secondary" onPress={() => navigate(`/sales/${so.id}/edit`)}>
                <Pencil className="size-4" /> Edit
              </Button>
            )}
            {so.status === "draft" &&
              (so.customerId ? (
                <Button onPress={() => run((d) => confirmSalesOrder(d, so.id), `${so.code} confirmed`)}>Confirm order</Button>
              ) : (
                <Button variant="secondary" onPress={() => navigate(`/sales/${so.id}/edit`)}>
                  Choose a customer to confirm
                </Button>
              ))}
            {canDeliver && (
              <Button onPress={() => setDelivering(true)}>
                <Truck className="size-4" /> Ship
              </Button>
            )}
            {so.deliveries.length > 0 && so.status !== "batal" && (
              <Button variant="secondary" onPress={() => setReturning(true)}>
                <Undo2 className="size-4" /> Return
              </Button>
            )}
            {so.status === "dikirim" && (
              <Button onPress={() => run((d) => completeSalesOrder(d, so.id), `${so.code} done`)}>
                <PackageCheck className="size-4" /> Mark as done
              </Button>
            )}
          </>
        }
      />

      {open && shortages.length > 0 && so.status !== "draft" && (
        <Alert status="warning" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Not enough stock for this order</Alert.Title>
            <Alert.Description>
              {shortages.map((s) => `${item(s.itemId)?.name} short by ${formatQty(s.shortage)}`).join(", ")}. Create work orders for the shortfall automatically.
            </Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            onPress={() => {
              const created = run((d) => createWorkOrdersForShortage(d, so.id), (w) => `${w.length} work orders created`);
              if (created?.[0]) navigate(`/work-orders/${created[0].id}`);
            }}
          >
            <Hammer className="size-4" /> Create work orders
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Products" bodyClassName="p-0">
            <DataTable label="Ordered products" columns={columns} rows={so.lines} dependencies={[db.lots, so.deliveries]} />
          </Section>

          {so.channel === "ekspor" && so.export && pl && (
            <Section
              title="Shipment"
              description={`${so.export.incoterm} ${so.export.portOfLoading} → ${so.export.portOfDischarge || "?"}, ${so.export.destinationCountry || "?"}`}
              actions={
                open && (
                  <Button size="sm" variant="secondary" onPress={() => setEditingExport(true)}>
                    <Pencil className="size-4" /> Edit export details
                  </Button>
                )
              }
            >
              <div className="flex flex-col gap-4">
                {warnings.length > 0 && open && (
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Missing document details</Alert.Title>
                      <Alert.Description>
                        <ul className="list-disc pl-4">
                          {warnings.map((w) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </Alert.Description>
                    </Alert.Content>
                  </Alert>
                )}
                <Meter
                  aria-label="Container fill"
                  value={Math.min(100, pl.fill * 100)}
                  color={pl.fill > 1 ? "danger" : pl.fill > 0.85 ? "success" : "warning"}
                >
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      Fill of {CONTAINER_LABEL[so.export.containerType]} (±{pl.capacity} CBM)
                    </span>
                    <span className="tabular-nums">
                      {formatNumber(pl.totals.cbm, 2)} CBM · {formatPct(pl.fill, 0)}
                    </span>
                  </div>
                  <Meter.Track>
                    <Meter.Fill />
                  </Meter.Track>
                </Meter>
                <p className="text-xs text-muted">
                  {pl.remainingCbm > 0
                    ? `Room for ±${formatNumber(pl.remainingCbm, 1)} CBM more — offer the buyer extra products to bring the freight cost per unit down.`
                    : "Volume exceeds capacity — use a bigger container or split the shipment."}{" "}
                  {pl.totals.cartons} cartons · {formatNumber(pl.totals.grossKg, 1)} kg gross.
                </p>
                <KeyValue
                  columns={3}
                  items={[
                    ["V-Legal no.", so.export.vLegalNo],
                    ["EUDR DDS reference", so.export.eudrDdsRef],
                    ["ETD", formatDate(so.export.etd)],
                    ["Container no.", so.export.containerNo],
                    ["Seal no.", so.export.sealNo],
                    ["B/L no.", so.export.blNo],
                  ]}
                />
              </div>
            </Section>
          )}

          {so.deliveries.length > 0 && (
          <Section title="Delivery history" bodyClassName="p-0">
            <DataTable
              label="Deliveries"
              rows={so.deliveries.flatMap((d) => d.lines.map((l, i) => ({ ...l, id: `${d.id}-${i}`, at: d.at })))}
              columns={[
                { key: "at", header: "Time", isRowHeader: true, className: "whitespace-nowrap", cell: (l) => formatDateTime(l.at) },
                { key: "item", header: "Product", cell: (l) => item(l.itemId)?.name ?? "?" },
                { key: "lot", header: "Lot", className: "whitespace-nowrap", cell: (l) => db.lots.find((x) => x.id === l.lotId)?.code ?? "?" },
                { key: "qty", header: "Qty", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
                { key: "cost", header: "Unit cost", align: "end", cell: (l) => formatIDR(l.unitCost) },
              ]}
            />
          </Section>
          )}
          {so.returns.length > 0 && (
            <Section title="Returns" bodyClassName="p-0">
              <DataTable
                label="Returns"
                rows={so.returns}
                columns={[
                  { key: "at", header: "Time", isRowHeader: true, className: "whitespace-nowrap", cell: (r) => formatDateTime(r.at) },
                  { key: "item", header: "Item", cell: (r) => item(r.itemId)?.name ?? "?" },
                  { key: "cond", header: "Condition", cell: (r) => <StatusChip tone={r.condition === "rusak" ? "danger" : "success"}>{r.condition === "rusak" ? "Defective" : "Good"}</StatusChip> },
                  { key: "qty", header: "Qty", align: "end", cell: (r) => formatQty(r.qty, item(r.itemId)?.uom) },
                  { key: "credit", header: "Credit", align: "end", cell: (r) => formatMoney(r.credit, so.currency) },
                  { key: "note", header: "Reason", cell: (r) => <span className="text-muted">{r.note ?? "—"}</span> },
                ]}
              />
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Value & margin">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, so.currency)} />
            {so.discount > 0 && <Row label="Discount" value={`− ${formatMoney(so.discount, so.currency)}`} />}
            {so.shippingCharge > 0 && <Row label="Shipping" value={formatMoney(so.shippingCharge, so.currency)} />}
            {totals.returnCredit > 0 && <Row label="Returns" value={`− ${formatMoney(totals.returnCredit, so.currency)}`} />}
            <Row label="Total" value={formatMoney(totals.total, so.currency)} strong />
            {so.currency !== "IDR" && <Row label={`Exchange rate ${formatIDR(so.exchangeRate)}`} value={formatIDR(totals.totalIdr)} muted />}
            <div className="my-2 border-t border-[var(--rule)]" />
            <Row label="COGS of shipped items" value={formatIDR(totals.cogs)} />
            {totals.estimatedCogsOutstanding > 0 && <Row label="Estimated COGS not yet shipped" value={formatIDR(totals.estimatedCogsOutstanding)} muted />}
            <Row label="Gross margin" value={`${formatIDR(totals.margin)} · ${formatPct(totals.marginPct)}`} strong tone={totals.margin < 0 ? "danger" : "success"} />
          </Section>
          {so.status !== "batal" && (
            <PaymentsSection
              doc="sale"
              id={so.id}
              payments={so.payments}
              extraNote={
                so.dpPercent
                  ? (() => {
                      const dp = dpStatus(db, so);
                      return `Down payment ${so.dpPercent}%: ${formatMoney(dp.required, so.currency)} — ${dp.met ? "received" : `${formatMoney(dp.required - dp.received, so.currency)} still due`}. Final payment due ${formatDate(so.paymentDueDate ?? so.dueDate)}.`;
                    })()
                  : so.paymentDueDate
                    ? `Final payment due ${formatDate(so.paymentDueDate)}.`
                    : undefined
              }
            />
          )}
          {wos.length > 0 && (
            <Section title="Work orders for this order">
              {wos.map((w) => (
                <Row key={w.id} label={<Link href={`/work-orders/${w.id}`}>{`${w.code} · ${w.title}`}</Link>} value={<StatusChip tone={WO_STATUS[w.status].tone}>{WO_STATUS[w.status].label}</StatusChip>} />
              ))}
            </Section>
          )}
          <Section title="Info">
            <KeyValue columns={1} items={[["Customer", partnerName(so.customerId)], ["Note", so.note]]} />
          </Section>
        </div>
      </div>

      <DeliverDialog so={so} isOpen={delivering} onOpenChange={setDelivering} />
      <ReturnDialog so={so} isOpen={returning} onOpenChange={setReturning} />
      {so.export && <ExportEditDialog key={JSON.stringify(so.export)} soId={so.id} initial={so.export} isOpen={editingExport} onOpenChange={setEditingExport} />}
    </>
  );
}

function DeliverDialog({ so, isOpen, onOpenChange }: { so: SalesOrder; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} title={`Ship ${so.code}`} description="Product lots are picked automatically (oldest stock first). COGS is recorded from the lots shipped.">
      {isOpen && <DeliverForm so={so} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function DeliverForm({ so, onDone }: { so: SalesOrder; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const lines = outstandingLines(so);
  const [qty, setQty] = useState<Record<ID, number>>(() => Object.fromEntries(lines.map((l) => [l.itemId, Math.min(l.qty, freeQtyFor(db, l.itemId))])));
  const submit = () => {
    const ok = run(
      (d) => deliverSalesOrder(d, so.id, lines.map((l) => ({ itemId: l.itemId, qty: roundQty(qty[l.itemId] ?? 0) }))),
      "Delivery recorded — stock reduced",
    );
    if (ok) onDone();
  };
  return (
    <div className="flex flex-col gap-3">
      {lines.map((l) => {
        const free = freeQtyFor(db, l.itemId);
        const it = item(l.itemId);
        return (
          <div key={l.itemId} className="grid grid-cols-[1fr_8rem] items-center gap-3 rounded-md border border-[var(--rule)] p-3">
            <div>
              <p className="font-medium">{it?.name}</p>
              <p className="text-xs text-muted">
                Left to ship {formatQty(l.qty, it?.uom)} · ready stock {formatQty(free, it?.uom)}
              </p>
            </div>
            <NumberInput aria-label={`Quantity to ship ${it?.name}`} value={qty[l.itemId] ?? 0} onChange={(v) => setQty({ ...qty, [l.itemId]: v })} maxValue={Math.min(l.qty, free)} maximumFractionDigits={0} />
          </div>
        );
      })}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button onPress={submit} isDisabled={Object.values(qty).every((v) => !v)}>
          Ship
        </Button>
      </div>
    </div>
  );
}

function ExportEditDialog({
  soId,
  initial,
  isOpen,
  onOpenChange,
}: {
  soId: ID;
  initial: ExportInfo;
  isOpen: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const run = useRun();
  const [value, setValue] = useState(initial);
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title="Export details"
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onPress={() => {
              if (run((d) => updateExportInfo(d, soId, value), "Export details saved")) onOpenChange(false);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <ExportFields value={value} onChange={setValue} />
    </TaskModal>
  );
}

function ReturnDialog({ so, isOpen, onOpenChange }: { so: SalesOrder; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      title={`Return ${so.code}`}
      description="Items go back to the warehouse at their unit cost when shipped. Defective items are marked Damaged and can get a repair work order. The customer is credited at the order price."
    >
      {isOpen && <ReturnForm so={so} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function ReturnForm({ so, onDone }: { so: SalesOrder; onDone: () => void }) {
  const run = useRun();
  const { item } = useLookups();
  const ids = [...new Set(so.deliveries.flatMap((d) => d.lines.map((l) => l.itemId)))];
  const [rows, setRows] = useState(() => ids.map((itemId) => ({ itemId, qty: 0, condition: "baik" as "baik" | "rusak", note: "" })));
  return (
    <div className="flex flex-col gap-3">
      {rows.map((r, i) => {
        const max = deliveredQty(so, r.itemId) - saleReturnedQty(so, r.itemId);
        const set = (patch: Partial<typeof r>) => setRows(rows.map((x, j) => (j === i ? { ...x, ...patch } : x)));
        return (
          <div key={r.itemId} className="rounded-sm border border-[var(--rule)] p-3">
            <p className="text-sm font-medium">
              {item(r.itemId)?.name} <span className="font-normal text-muted">· returnable {formatQty(max)}</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[7rem_9rem_1fr]">
              <NumberInput aria-label="Return quantity" value={r.qty} onChange={(qty) => set({ qty })} maxValue={max} />
              <SelectInput
                aria-label="Condition"
                value={r.condition}
                onChange={(v) => set({ condition: v as "baik" | "rusak" })}
                options={[
                  { id: "baik", label: "Good — can be sold again" },
                  { id: "rusak", label: "Defective — needs repair" },
                ]}
              />
              <TextInput aria-label="Reason" value={r.note} onChange={(note) => set({ note })} placeholder="Return reason" className="col-span-2 sm:col-span-1" />
            </div>
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          isDisabled={rows.every((r) => !r.qty)}
          onPress={() => {
            const ok = run((d) => returnSale(d, so.id, rows.filter((r) => r.qty > 0).map((r) => ({ ...r, note: r.note || undefined }))), "Return recorded");
            if (ok) onDone();
          }}
        >
          Save return
        </Button>
      </div>
    </div>
  );
}
