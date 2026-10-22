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
  if (!so) return <RecordNotFound what="Order" back="/penjualan" />;

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
      header: "Barang",
      isRowHeader: true,
      cell: (l) => (
        <div className="min-w-40">
          <p className="font-medium">{item(l.itemId)?.name ?? "?"}</p>
          {l.spec && <p className="text-xs text-muted">Spesifikasi: {l.spec}</p>}
        </div>
      ),
    },
    { key: "qty", header: "Order", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
    { key: "sent", header: "Terkirim", align: "end", cell: (l) => formatQty(deliveredQty(so, l.itemId), item(l.itemId)?.uom) },
    {
      key: "stock",
      header: "Stok siap",
      align: "end",
      cell: (l) => {
        const free = freeQtyFor(db, l.itemId);
        const outstanding = l.qty - deliveredQty(so, l.itemId);
        return <span className={open && outstanding > 0 && free < outstanding ? "text-warning" : ""}>{formatQty(free, item(l.itemId)?.uom)}</span>;
      },
    },
    { key: "price", header: "Harga", align: "end", cell: (l) => formatMoney(l.unitPrice, so.currency) },
    { key: "sub", header: "Subtotal", align: "end", cell: (l) => formatMoney(l.qty * l.unitPrice, so.currency) },
  ];

  return (
    <>
      <PageHeader
        back="/penjualan"
        title={`${so.code} · ${partnerName(so.customerId)}`}
        badge={
          <>
            <Tag>{SALES_CHANNEL[so.channel]}</Tag>
            <StatusChip tone={SALES_STATUS[so.status].tone}>{SALES_STATUS[so.status].label}</StatusChip>
          </>
        }
        description={`Order ${formatDate(so.date)}${so.dueDate ? ` · target kirim ${formatDate(so.dueDate)}` : ""}`}
        actions={
          <>
            {so.status === "draft" && (
              <ConfirmButton
                variant="danger-soft"
                danger
                title={`Batalkan ${so.code}?`}
                confirmLabel="Batalkan order"
                onConfirm={() => run((d) => cancelSalesOrder(d, so.id), `${so.code} dibatalkan`)}
              >
                Batalkan
              </ConfirmButton>
            )}
            {so.channel === "ekspor" && (
              <Button variant="secondary" onPress={() => navigate(`/penjualan/${so.id}/dokumen`)}>
                <FileText className="size-4" /> Dokumen ekspor
              </Button>
            )}
            {(so.status === "draft" || so.status === "dikonfirmasi") && so.deliveries.length === 0 && (
              <Button variant="secondary" onPress={() => navigate(`/penjualan/${so.id}/ubah`)}>
                <Pencil className="size-4" /> Ubah
              </Button>
            )}
            {so.status === "draft" && <Button onPress={() => run((d) => confirmSalesOrder(d, so.id), `${so.code} dikonfirmasi`)}>Konfirmasi order</Button>}
            {canDeliver && (
              <Button onPress={() => setDelivering(true)}>
                <Truck className="size-4" /> Kirim barang
              </Button>
            )}
            {so.deliveries.length > 0 && so.status !== "batal" && (
              <Button variant="secondary" onPress={() => setReturning(true)}>
                <Undo2 className="size-4" /> Retur
              </Button>
            )}
            {so.status === "dikirim" && (
              <Button onPress={() => run((d) => completeSalesOrder(d, so.id), `${so.code} selesai`)}>
                <PackageCheck className="size-4" /> Tandai selesai
              </Button>
            )}
          </>
        }
      />

      {open && shortages.length > 0 && so.status !== "draft" && (
        <Alert status="warning" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Stok belum cukup untuk order ini</Alert.Title>
            <Alert.Description>
              {shortages.map((s) => `${item(s.itemId)?.name} kurang ${formatQty(s.shortage)}`).join(", ")}. Buat perintah produksi otomatis untuk kekurangannya.
            </Alert.Description>
          </Alert.Content>
          <Button
            size="sm"
            onPress={() => {
              const created = run((d) => createWorkOrdersForShortage(d, so.id), (w) => `${w.length} perintah produksi dibuat`);
              if (created?.[0]) navigate(`/produksi/${created[0].id}`);
            }}
          >
            <Hammer className="size-4" /> Buat produksi
          </Button>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Produk" bodyClassName="p-0">
            <DataTable label="Produk dipesan" columns={columns} rows={so.lines} dependencies={[db.lots, so.deliveries]} />
          </Section>

          {so.channel === "ekspor" && so.export && pl && (
            <Section
              title="Pengapalan"
              description={`${so.export.incoterm} ${so.export.portOfLoading} → ${so.export.portOfDischarge || "?"}, ${so.export.destinationCountry || "?"}`}
              actions={
                open && (
                  <Button size="sm" variant="secondary" onPress={() => setEditingExport(true)}>
                    <Pencil className="size-4" /> Ubah data ekspor
                  </Button>
                )
              }
            >
              <div className="flex flex-col gap-4">
                {warnings.length > 0 && open && (
                  <Alert status="warning">
                    <Alert.Indicator />
                    <Alert.Content>
                      <Alert.Title>Kelengkapan dokumen</Alert.Title>
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
                  aria-label="Isi kontainer"
                  value={Math.min(100, pl.fill * 100)}
                  color={pl.fill > 1 ? "danger" : pl.fill > 0.85 ? "success" : "warning"}
                >
                  <div className="mb-1 flex justify-between text-sm">
                    <span>
                      Isi {CONTAINER_LABEL[so.export.containerType]} (±{pl.capacity} CBM)
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
                    ? `Masih muat ±${formatNumber(pl.remainingCbm, 1)} CBM — tawarkan produk tambahan ke buyer agar ongkos per unit turun.`
                    : "Volume melebihi kapasitas — pertimbangkan kontainer lebih besar atau pisah pengiriman."}{" "}
                  {pl.totals.cartons} karton · {formatNumber(pl.totals.grossKg, 1)} kg kotor.
                </p>
                <KeyValue
                  columns={3}
                  items={[
                    ["No. V-Legal", so.export.vLegalNo],
                    ["Ref. DDS EUDR", so.export.eudrDdsRef],
                    ["ETD", formatDate(so.export.etd)],
                    ["No. kontainer", so.export.containerNo],
                    ["No. segel", so.export.sealNo],
                    ["No. B/L", so.export.blNo],
                  ]}
                />
              </div>
            </Section>
          )}

          {so.deliveries.length > 0 && (
          <Section title="Riwayat pengiriman" bodyClassName="p-0">
            <DataTable
              label="Pengiriman"
              rows={so.deliveries.flatMap((d) => d.lines.map((l, i) => ({ ...l, id: `${d.id}-${i}`, at: d.at })))}
              columns={[
                { key: "at", header: "Waktu", isRowHeader: true, className: "whitespace-nowrap", cell: (l) => formatDateTime(l.at) },
                { key: "item", header: "Produk", cell: (l) => item(l.itemId)?.name ?? "?" },
                { key: "lot", header: "Lot", className: "whitespace-nowrap", cell: (l) => db.lots.find((x) => x.id === l.lotId)?.code ?? "?" },
                { key: "qty", header: "Qty", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
                { key: "cost", header: "HPP/unit", align: "end", cell: (l) => formatIDR(l.unitCost) },
              ]}
            />
          </Section>
          )}
          {so.returns.length > 0 && (
            <Section title="Retur" bodyClassName="p-0">
              <DataTable
                label="Retur"
                rows={so.returns}
                columns={[
                  { key: "at", header: "Waktu", isRowHeader: true, className: "whitespace-nowrap", cell: (r) => formatDateTime(r.at) },
                  { key: "item", header: "Barang", cell: (r) => item(r.itemId)?.name ?? "?" },
                  { key: "cond", header: "Kondisi", cell: (r) => <StatusChip tone={r.condition === "rusak" ? "danger" : "success"}>{r.condition === "rusak" ? "Cacat" : "Baik"}</StatusChip> },
                  { key: "qty", header: "Qty", align: "end", cell: (r) => formatQty(r.qty, item(r.itemId)?.uom) },
                  { key: "credit", header: "Kredit", align: "end", cell: (r) => formatMoney(r.credit, so.currency) },
                  { key: "note", header: "Alasan", cell: (r) => <span className="text-muted">{r.note ?? "—"}</span> },
                ]}
              />
            </Section>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Section title="Nilai & margin">
            <Row label="Subtotal" value={formatMoney(totals.subtotal, so.currency)} />
            {so.discount > 0 && <Row label="Diskon" value={`− ${formatMoney(so.discount, so.currency)}`} />}
            {so.shippingCharge > 0 && <Row label="Ongkir" value={formatMoney(so.shippingCharge, so.currency)} />}
            {totals.returnCredit > 0 && <Row label="Retur" value={`− ${formatMoney(totals.returnCredit, so.currency)}`} />}
            <Row label="Total" value={formatMoney(totals.total, so.currency)} strong />
            {so.currency !== "IDR" && <Row label={`Kurs ${formatIDR(so.exchangeRate)}`} value={formatIDR(totals.totalIdr)} muted />}
            <div className="my-2 border-t border-[var(--rule)]" />
            <Row label="HPP barang terkirim" value={formatIDR(totals.cogs)} />
            {totals.estimatedCogsOutstanding > 0 && <Row label="Estimasi HPP belum kirim" value={formatIDR(totals.estimatedCogsOutstanding)} muted />}
            <Row label="Margin kotor" value={`${formatIDR(totals.margin)} · ${formatPct(totals.marginPct)}`} strong tone={totals.margin < 0 ? "danger" : "success"} />
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
                      return `DP ${so.dpPercent}%: ${formatMoney(dp.required, so.currency)} — ${dp.met ? "sudah terpenuhi" : `kurang ${formatMoney(dp.required - dp.received, so.currency)}`}. Jatuh tempo pelunasan ${formatDate(so.paymentDueDate ?? so.dueDate)}.`;
                    })()
                  : so.paymentDueDate
                    ? `Jatuh tempo pelunasan ${formatDate(so.paymentDueDate)}.`
                    : undefined
              }
            />
          )}
          {wos.length > 0 && (
            <Section title="Produksi untuk order ini">
              {wos.map((w) => (
                <Row key={w.id} label={<Link href={`/produksi/${w.id}`}>{`${w.code} · ${w.title}`}</Link>} value={<StatusChip tone={WO_STATUS[w.status].tone}>{WO_STATUS[w.status].label}</StatusChip>} />
              ))}
            </Section>
          )}
          <Section title="Info">
            <KeyValue columns={1} items={[["Pelanggan", partnerName(so.customerId)], ["Catatan", so.note]]} />
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
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} title={`Kirim barang ${so.code}`} description="Lot produk dipilih otomatis (stok terlama dulu). HPP penjualan tercatat dari lot yang terkirim.">
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
      "Pengiriman tercatat — stok berkurang",
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
                Sisa order {formatQty(l.qty, it?.uom)} · stok siap {formatQty(free, it?.uom)}
              </p>
            </div>
            <NumberInput aria-label={`Qty kirim ${it?.name}`} value={qty[l.itemId] ?? 0} onChange={(v) => setQty({ ...qty, [l.itemId]: v })} maxValue={Math.min(l.qty, free)} maximumFractionDigits={0} />
          </div>
        );
      })}
      <div className="mt-2 flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button onPress={submit} isDisabled={Object.values(qty).every((v) => !v)}>
          Kirim
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
      title="Data ekspor"
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button
            onPress={() => {
              if (run((d) => updateExportInfo(d, soId, value), "Data ekspor disimpan")) onOpenChange(false);
            }}
          >
            Simpan
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
      title={`Retur ${so.code}`}
      description="Barang kembali ke gudang dengan HPP saat dikirim. Barang cacat masuk status rusak dan bisa dibuatkan perintah perbaikan. Pelanggan dikredit sesuai harga order."
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
              {item(r.itemId)?.name} <span className="font-normal text-muted">· bisa diretur {formatQty(max)}</span>
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-[7rem_9rem_1fr]">
              <NumberInput aria-label="Qty retur" value={r.qty} onChange={(qty) => set({ qty })} maxValue={max} />
              <SelectInput
                aria-label="Kondisi"
                value={r.condition}
                onChange={(v) => set({ condition: v as "baik" | "rusak" })}
                options={[
                  { id: "baik", label: "Baik — bisa dijual lagi" },
                  { id: "rusak", label: "Cacat — perlu perbaikan" },
                ]}
              />
              <TextInput aria-label="Alasan" value={r.note} onChange={(note) => set({ note })} placeholder="Alasan retur" className="col-span-2 sm:col-span-1" />
            </div>
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button
          isDisabled={rows.every((r) => !r.qty)}
          onPress={() => {
            const ok = run((d) => returnSale(d, so.id, rows.filter((r) => r.qty > 0).map((r) => ({ ...r, note: r.note || undefined }))), "Retur tercatat");
            if (ok) onDone();
          }}
        >
          Simpan retur
        </Button>
      </div>
    </div>
  );
}
