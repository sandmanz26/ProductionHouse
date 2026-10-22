import { Button, Card } from "@heroui/react";
import { Calculator, Plus, Ruler, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  createPurchase,
  cubicMeters,
  toStockPrice,
  toStockQty,
  isOpenWo,
  landedUnitCosts,
  receivePurchase,
  reorderSuggestions,
  requirements,
  sum,
  today,
  updatePurchase,
  type Db,
  type ID,
  type PurchaseInput,
  type Uom,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextAreaInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker, PartnerPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, UOM_LABEL } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  unitPrice: number;
  withDims: boolean;
  length: number;
  width: number;
  thickness: number;
}
interface Extra {
  key: string;
  label: string;
  amount: number;
}

let seq = 0;
const k = () => `p${++seq}`;
const emptyLine = (itemId: ID | null = null, qty = 1, unitPrice = 0): Line => ({
  key: k(),
  itemId,
  qty,
  unitPrice,
  withDims: false,
  length: 0,
  width: 0,
  thickness: 0,
});

function initialLines(db: Db, woId: string | null, fromSuggestions: boolean, itemId?: string | null): Line[] {
  const price = (id: ID) => db.items.find((i) => i.id === id)?.standardCost ?? 0;
  // Opened from a production route: buy this item.
  if (itemId && db.items.some((i) => i.id === itemId)) return [emptyLine(itemId, 1, price(itemId))];
  if (woId) {
    const wo = db.workOrders.find((w) => w.id === woId);
    if (wo) {
      const short = requirements(db, wo).filter((r) => r.shortage > 0);
      if (short.length) return short.map((r) => emptyLine(r.itemId, r.shortage, price(r.itemId)));
    }
  }
  if (fromSuggestions) {
    const sug = reorderSuggestions(db);
    if (sug.length) return sug.map((r) => emptyLine(r.item.id, r.suggested, r.item.standardCost));
  }
  return [emptyLine()];
}

export default function PurchaseFormPage() {
  const { id } = useParams();
  const db = useDb();
  const existing = id ? db.purchases.find((p) => p.id === id) : undefined;
  if (id && !existing) return <RecordNotFound what="Pembelian" back="/pembelian" />;
  if (existing && existing.status !== "draft") return <RecordNotFound what="Pembelian draft" back={`/pembelian/${existing.id}`} />;
  return <PurchaseForm key={id ?? "new"} existingId={existing?.id} />;
}

function PurchaseForm({ existingId }: { existingId?: ID }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const existing = existingId ? db.purchases.find((p) => p.id === existingId) : undefined;

  const [supplierId, setSupplierId] = useState<ID | null>(existing?.supplierId ?? null);
  const [date, setDate] = useState(existing?.date ?? today());
  const [invoiceNo, setInvoiceNo] = useState(existing?.invoiceNo ?? "");
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [helperFor, setHelperFor] = useState<string | null>(null);
  const [note, setNote] = useState(existing?.note ?? "");
  const [workOrderId, setWorkOrderId] = useState<string>(existing?.workOrderId ?? params.get("wo") ?? "");
  const [lines, setLines] = useState<Line[]>(() =>
    existing
      ? existing.lines.map((l) => ({
          key: k(),
          itemId: l.itemId,
          qty: l.qty,
          unitPrice: l.unitPrice,
          withDims: !!l.dimensions,
          length: l.dimensions?.length ?? 0,
          width: l.dimensions?.width ?? 0,
          thickness: l.dimensions?.thickness ?? 0,
        }))
      : initialLines(db, params.get("wo"), params.get("dari") === "saran", params.get("barang")),
  );
  const [extras, setExtras] = useState<Extra[]>(() =>
    existing?.extraCosts.length ? existing.extraCosts.map((c) => ({ key: k(), label: c.label, amount: c.amount })) : [{ key: k(), label: "Ongkos kirim", amount: 0 }],
  );

  const woOptions = useMemo(
    () => [
      { id: "", label: "Stok umum (tidak dicadangkan)" },
      ...db.workOrders.filter(isOpenWo).map((w) => ({ id: w.id, label: `${w.code} · ${w.title}` })),
    ],
    [db.workOrders],
  );

  const input: PurchaseInput = {
    supplierId: supplierId ?? undefined,
    date,
    invoiceNo: invoiceNo || undefined,
    dueDate: dueDate || undefined,
    note: note || undefined,
    workOrderId: workOrderId || undefined,
    lines: lines
      .filter((l) => l.itemId)
      .map((l) => ({
        itemId: l.itemId!,
        qty: l.qty,
        unitPrice: l.unitPrice,
        dimensions: l.withDims && l.length && l.width ? { length: l.length, width: l.width, thickness: l.thickness || undefined } : undefined,
      })),
    extraCosts: extras.map((e) => ({ label: e.label, amount: e.amount })),
  };

  const landed = landedUnitCosts({
    lines: input.lines.map((l, i) => ({ id: String(i), ...l })),
    extraCosts: input.extraCosts!.map((e, i) => ({ id: String(i), ...e })),
  });
  const landedByKey = new Map(lines.filter((l) => l.itemId).map((l, i) => [l.key, landed[i]]));
  const goods = sum(input.lines.map((l) => l.qty * l.unitPrice));
  const extraTotal = sum(extras.map((e) => e.amount));
  const valid = input.lines.length > 0 && input.lines.every((l) => l.qty > 0);

  const save = (receive: boolean) => {
    const result = run(
      (d) => {
        const p = existing ? updatePurchase(d, existing.id, input) : createPurchase(d, input);
        if (receive) receivePurchase(d, p.id);
        return p;
      },
      (p) => (receive ? `${p.code} diterima — stok bertambah` : `${p.code} disimpan`),
    );
    if (result) navigate(`/pembelian/${result.id}`, { replace: true });
  };

  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader
        title={existing ? `Ubah ${existing.code}` : "Pembelian baru"}
        description="Isi barang yang dibeli. Biaya tambahan (ongkir, bongkar muat) dibagi ke barang sesuai nilainya sehingga HPP akurat."
        back={existing ? `/pembelian/${existing.id}` : "/pembelian"}
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Informasi">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <PartnerPicker role="supplier" value={supplierId} onChange={setSupplierId} />
              <DateInput label="Tanggal" value={date} onChange={setDate} isRequired />
              <TextInput label="No. nota / faktur" value={invoiceNo} onChange={setInvoiceNo} />
              <DateInput label="Jatuh tempo bayar" value={dueDate} onChange={setDueDate} description="Kosongkan bila bayar tunai." />
              <SelectInput
                label="Dibeli untuk"
                value={workOrderId}
                onChange={setWorkOrderId}
                options={woOptions}
                description="Jika untuk perintah kerja tertentu, barang dicadangkan untuknya. Sisa otomatis dilepas saat pekerjaan selesai."
              />
            </div>
          </Section>

          <Section title="Barang">
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const it = item(l.itemId ?? undefined);
                return (
                  <div key={l.key} className="rounded-md border border-[var(--rule)] p-3">
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_8rem_10rem_auto]">
                      <ItemPicker kind="material" value={l.itemId} onChange={(itemId) => update(l.key, { itemId, unitPrice: l.unitPrice || item(itemId ?? undefined)?.standardCost || 0 })} label="Material" />
                      <NumberInput label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix={it ? UOM_LABEL[it.uom] : undefined} />
                      <NumberInput label="Harga satuan" value={l.unitPrice} onChange={(unitPrice) => update(l.key, { unitPrice })} money />
                      <div className="flex gap-1">
                        <Button isIconOnly variant={helperFor === l.key ? "secondary" : "ghost"} aria-label="Hitung qty (kubikasi / satuan beli)" onPress={() => setHelperFor(helperFor === l.key ? null : l.key)}>
                          <Calculator className="size-4" />
                        </Button>
                        <Button isIconOnly variant={l.withDims ? "secondary" : "ghost"} aria-label="Ukuran" onPress={() => update(l.key, { withDims: !l.withDims })}>
                          <Ruler className="size-4" />
                        </Button>
                        <Button isIconOnly variant="ghost" aria-label="Hapus baris" isDisabled={lines.length === 1} onPress={() => setLines(lines.filter((x) => x.key !== l.key))}>
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>
                    {helperFor === l.key && it && (
                      <QtyHelper
                        uom={it.uom}
                        purchaseUnit={it.purchaseUnit}
                        onApply={(qty, unitPrice) => {
                          update(l.key, { qty, ...(unitPrice !== undefined ? { unitPrice } : {}) });
                          setHelperFor(null);
                        }}
                      />
                    )}
                    {l.withDims && (
                      <div className="mt-2 grid grid-cols-3 gap-2 sm:w-96">
                        <NumberInput label="Panjang (mm)" value={l.length} onChange={(length) => update(l.key, { length })} maximumFractionDigits={0} />
                        <NumberInput label="Lebar (mm)" value={l.width} onChange={(width) => update(l.key, { width })} maximumFractionDigits={0} />
                        <NumberInput label="Tebal (mm)" value={l.thickness} onChange={(thickness) => update(l.key, { thickness })} maximumFractionDigits={0} />
                      </div>
                    )}
                    {it && l.qty > 0 && (
                      <p className="mt-2 text-xs text-muted">
                        Subtotal {formatIDR(l.qty * l.unitPrice)} · harga pokok setelah biaya tambahan{" "}
                        <b className="text-foreground">{formatIDR(landedByKey.get(l.key) ?? l.unitPrice)}</b>/{UOM_LABEL[it.uom]}
                        {it.standardCost > 0 && l.unitPrice > it.standardCost * 1.1 && (
                          <span className="ml-1 text-warning">· {Math.round((l.unitPrice / it.standardCost - 1) * 100)}% di atas harga terakhir</span>
                        )}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setLines([...lines, emptyLine()])}>
                  <Plus className="size-4" /> Tambah barang
                </Button>
              </div>
            </div>
          </Section>

          <Section title="Biaya tambahan" description="Ongkir, bongkar muat, pajak yang tidak dikreditkan, dll.">
            <div className="flex flex-col gap-2">
              {extras.map((e) => (
                <div key={e.key} className="grid grid-cols-[1fr_10rem_auto] items-end gap-2">
                  <TextInput aria-label="Keterangan biaya" value={e.label} onChange={(label) => setExtras(extras.map((x) => (x.key === e.key ? { ...x, label } : x)))} placeholder="Keterangan" />
                  <NumberInput aria-label="Jumlah" value={e.amount} onChange={(amount) => setExtras(extras.map((x) => (x.key === e.key ? { ...x, amount } : x)))} money />
                  <Button isIconOnly variant="ghost" aria-label="Hapus biaya" onPress={() => setExtras(extras.filter((x) => x.key !== e.key))}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setExtras([...extras, { key: k(), label: "", amount: 0 }])}>
                  <Plus className="size-4" /> Tambah biaya
                </Button>
              </div>
              <TextAreaInput label="Catatan" value={note} onChange={setNote} rows={2} />
            </div>
          </Section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Ringkasan</Card.Title>
            </Card.Header>
            <Card.Content>
              <Row label={`Barang (${input.lines.length})`} value={formatIDR(goods)} />
              <Row label="Biaya tambahan" value={formatIDR(extraTotal)} />
              <div className="my-2 border-t border-[var(--rule)]" />
              <Row label="Total" value={formatIDR(goods + extraTotal)} strong />
              {workOrderId && <p className="mt-3 text-xs text-muted">Barang akan dicadangkan untuk {woOptions.find((o) => o.id === workOrderId)?.label.split(" · ")[0]}.</p>}
            </Card.Content>
            <Card.Footer className="flex-col items-stretch gap-2">
              <Button onPress={() => save(true)} isDisabled={!valid} fullWidth>
                Simpan & terima barang
              </Button>
              <Button variant="secondary" onPress={() => save(false)} isDisabled={!valid} fullWidth>
                Simpan — barang belum datang
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}

/**
 * Quantity helper on a purchase line: timber volume from piece size (kubikasi), or conversion
 * from the supplier's unit (roll, dus) to the stock unit.
 */
function QtyHelper({
  uom,
  purchaseUnit,
  onApply,
}: {
  uom: Uom;
  purchaseUnit?: { label: string; factor: number };
  onApply: (qty: number, unitPrice?: number) => void;
}) {
  const [pcs, setPcs] = useState(1);
  const [t, setT] = useState(3);
  const [w, setW] = useState(15);
  const [len, setLen] = useState(2);
  const [pq, setPq] = useState(1);
  const [pp, setPp] = useState(0);
  const unit = { purchaseUnit };
  if (uom === "m3") {
    const vol = cubicMeters(pcs, t, w, len);
    return (
      <div className="mt-2 rounded-sm border border-dashed border-[var(--rule)] p-3">
        <p className="eyebrow mb-2">Kubikasi: batang × tebal × lebar × panjang</p>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <NumberInput label="Batang" value={pcs} onChange={setPcs} maximumFractionDigits={0} />
          <NumberInput label="Tebal" value={t} onChange={setT} suffix="cm" />
          <NumberInput label="Lebar" value={w} onChange={setW} suffix="cm" />
          <NumberInput label="Panjang" value={len} onChange={setLen} suffix="m" />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="num text-sm">{vol.toLocaleString("id-ID", { maximumFractionDigits: 4 })} m³</span>
          <Button size="sm" variant="secondary" isDisabled={!vol} onPress={() => onApply(vol)}>
            Pakai sebagai qty
          </Button>
        </div>
      </div>
    );
  }
  if (purchaseUnit) {
    return (
      <div className="mt-2 rounded-sm border border-dashed border-[var(--rule)] p-3">
        <p className="eyebrow mb-2">
          Satuan beli: 1 {purchaseUnit.label} = {purchaseUnit.factor} {uom}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label={`Jumlah (${purchaseUnit.label})`} value={pq} onChange={setPq} />
          <NumberInput label={`Harga per ${purchaseUnit.label}`} value={pp} onChange={setPp} money />
        </div>
        <div className="mt-2 flex items-center justify-between">
          <span className="num text-sm">
            = {toStockQty(unit, pq)} {uom} @ {formatIDR(toStockPrice(unit, pp))}
          </span>
          <Button size="sm" variant="secondary" onPress={() => onApply(toStockQty(unit, pq), pp ? toStockPrice(unit, pp) : undefined)}>
            Pakai
          </Button>
        </div>
      </div>
    );
  }
  return <p className="mt-2 text-xs text-muted">Kalkulator tersedia untuk material ber-satuan m³, atau yang punya satuan beli di data master.</p>;
}
