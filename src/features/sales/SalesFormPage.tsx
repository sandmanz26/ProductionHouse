import { Button, Card, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  createSalesOrder,
  freeQtyFor,
  sum,
  today,
  updateSalesOrder,
  type Currency,
  type ExportInfo,
  type ID,
  type SalesChannel,
  type SalesInput,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextAreaInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker, PartnerPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, formatMoney, formatPct, formatQty } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { emptyExport } from "./export-info";
import { ExportFields } from "./ExportFields";

const CURRENCIES: Currency[] = ["IDR", "USD", "EUR", "SGD", "AUD", "JPY"];

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  unitPrice: number;
}
let seq = 0;
const k = () => `s${++seq}`;

export default function SalesFormPage() {
  const { id } = useParams();
  const db = useDb();
  const so = id ? db.sales.find((s) => s.id === id) : undefined;
  if (id && !so) return <RecordNotFound what="Order" back="/penjualan" />;
  if (so && so.deliveries.length > 0) return <RecordNotFound what="Order yang belum dikirim" back={`/penjualan/${so.id}`} />;
  return <SalesForm key={id ?? "new"} existingId={so?.id} />;
}

function SalesForm({ existingId }: { existingId?: ID }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const existing = existingId ? db.sales.find((s) => s.id === existingId) : undefined;

  const [channel, setChannel] = useState<SalesChannel>(existing?.channel ?? "supply");
  const [customerId, setCustomerId] = useState<ID | null>(existing?.customerId ?? null);
  const [date, setDate] = useState(existing?.date ?? today());
  const [dueDate, setDueDate] = useState(existing?.dueDate ?? "");
  const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "IDR");
  const [rate, setRate] = useState(existing?.exchangeRate ?? 1);
  const [lines, setLines] = useState<Line[]>(
    existing?.lines.map((l) => ({ key: k(), itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice })) ?? [{ key: k(), itemId: null, qty: 1, unitPrice: 0 }],
  );
  const [discount, setDiscount] = useState(existing?.discount ?? 0);
  const [shipping, setShipping] = useState(existing?.shippingCharge ?? 0);
  const [exp, setExp] = useState<ExportInfo>(existing?.export ?? emptyExport());
  const [note, setNote] = useState(existing?.note ?? "");

  const changeCurrency = (c: Currency) => {
    const newRate = c === "IDR" ? 1 : db.settings.exchangeRates[c];
    // Convert entered prices so the user does not have to retype them.
    setLines(lines.map((l) => ({ ...l, unitPrice: Math.round(((l.unitPrice * rate) / newRate) * 100) / 100 })));
    setCurrency(c);
    setRate(newRate);
  };
  const changeChannel = (c: SalesChannel) => {
    setChannel(c);
    if (c === "ekspor" && currency === "IDR") changeCurrency("USD");
  };

  const input: SalesInput = {
    channel,
    customerId: customerId ?? undefined,
    date,
    dueDate: dueDate || undefined,
    currency,
    exchangeRate: currency === "IDR" ? 1 : rate,
    lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty, unitPrice: l.unitPrice })),
    discount,
    shippingCharge: shipping,
    export: channel === "ekspor" ? exp : undefined,
    note: note || undefined,
  };
  const subtotal = sum(input.lines.map((l) => l.qty * l.unitPrice));
  const total = subtotal - discount + shipping;
  const estCost = sum(
    input.lines.map((l) => {
      const s = db.lots.filter((x) => x.itemId === l.itemId && x.qty > 0);
      const q = sum(s.map((x) => x.qty));
      const avg = q > 0 ? sum(s.map((x) => x.qty * x.unitCost)) / q : (item(l.itemId)?.standardCost ?? 0);
      return avg * l.qty;
    }),
  );
  const margin = subtotal * input.exchangeRate - estCost;

  const save = () => {
    const r = run((d) => (existing ? updateSalesOrder(d, existing.id, input) : createSalesOrder(d, input)), (s) => `Order ${s.code} disimpan`);
    if (r) navigate(`/penjualan/${r.id}`, { replace: true });
  };
  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader title={existing ? `Ubah ${existing.code}` : "Order penjualan baru"} back={existing ? `/penjualan/${existing.id}` : "/penjualan"} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Pelanggan & jalur">
            <div className="flex flex-col gap-4">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[channel]}
                onSelectionChange={(keys: Set<Key>) => {
                  const v = [...keys][0];
                  if (v) changeChannel(v as SalesChannel);
                }}
                aria-label="Jalur penjualan"
              >
                <ToggleButton id="supply">Supply domestik</ToggleButton>
                <ToggleButton id="ekspor">Ekspor</ToggleButton>
              </ToggleButtonGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PartnerPicker role="customer" value={customerId} onChange={setCustomerId} />
                <div className="grid grid-cols-2 gap-3">
                  <DateInput label="Tanggal order" value={date} onChange={setDate} />
                  <DateInput label="Target kirim" value={dueDate} onChange={setDueDate} />
                </div>
                <SelectInput label="Mata uang" value={currency} onChange={(v) => changeCurrency(v as Currency)} options={CURRENCIES.map((c) => ({ id: c, label: c }))} />
                {currency !== "IDR" && (
                  <NumberInput label={`Kurs (Rp per 1 ${currency})`} value={rate} onChange={setRate} money description="Default dari Pengaturan; sesuaikan dengan kurs kontrak." />
                )}
              </div>
            </div>
          </Section>

          <Section title="Produk">
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const it = item(l.itemId ?? undefined);
                const free = l.itemId ? freeQtyFor(db, l.itemId) : 0;
                return (
                  <div key={l.key}>
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_7rem_10rem_auto]">
                      <ItemPicker
                        kind="product"
                        value={l.itemId}
                        onChange={(itemId) =>
                          update(l.key, {
                            itemId,
                            unitPrice: l.unitPrice || Math.round(((item(itemId ?? undefined)?.salePrice ?? 0) / (currency === "IDR" ? 1 : rate)) * 100) / 100,
                          })
                        }
                        aria-label="Produk"
                      />
                      <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix="pcs" maximumFractionDigits={0} />
                      <NumberInput aria-label={`Harga (${currency})`} value={l.unitPrice} onChange={(unitPrice) => update(l.key, { unitPrice })} money={currency === "IDR"} suffix={currency !== "IDR" ? currency : undefined} maximumFractionDigits={2} />
                      <Button isIconOnly variant="ghost" aria-label="Hapus" isDisabled={lines.length === 1} onPress={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {it && (
                      <p className={`mt-1 text-xs ${free < l.qty ? "text-warning" : "text-muted"}`}>
                        Stok siap kirim {formatQty(free, it.uom)}
                        {free < l.qty && ` — kurang ${formatQty(l.qty - free, it.uom)}, bisa dibuatkan perintah produksi setelah order disimpan`}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setLines([...lines, { key: k(), itemId: null, qty: 1, unitPrice: 0 }])}>
                  <Plus className="size-4" /> Tambah produk
                </Button>
              </div>
            </div>
          </Section>

          {channel === "ekspor" && (
            <Section title="Data ekspor" description="Dipakai untuk proforma invoice, packing list, dan pengecekan kelengkapan dokumen.">
              <ExportFields value={exp} onChange={setExp} />
            </Section>
          )}

          <Section title="Lainnya">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label={`Diskon (${currency})`} value={discount} onChange={setDiscount} money={currency === "IDR"} maximumFractionDigits={2} />
              <NumberInput label={`Ongkir ditagihkan (${currency})`} value={shipping} onChange={setShipping} money={currency === "IDR"} maximumFractionDigits={2} />
              <TextAreaInput className="sm:col-span-2" label="Catatan" value={note} onChange={setNote} rows={2} />
            </div>
          </Section>
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Ringkasan</Card.Title>
            </Card.Header>
            <Card.Content>
              <Row label="Subtotal" value={formatMoney(subtotal, currency)} />
              {discount > 0 && <Row label="Diskon" value={`− ${formatMoney(discount, currency)}`} />}
              {shipping > 0 && <Row label="Ongkir" value={formatMoney(shipping, currency)} />}
              <div className="my-2 border-t border-separator" />
              <Row label="Total" value={formatMoney(total, currency)} strong />
              {currency !== "IDR" && <Row label="Setara" value={formatIDR(total * rate)} muted />}
              <div className="mt-3 rounded-2xl bg-default/60 p-3">
                <Row label="Estimasi HPP" value={formatIDR(estCost)} />
                <Row label="Estimasi margin kotor" value={`${formatIDR(margin)} · ${subtotal ? formatPct(margin / (subtotal * input.exchangeRate)) : "—"}`} tone={margin < 0 ? "danger" : "success"} />
              </div>
            </Card.Content>
            <Card.Footer>
              <Button onPress={save} isDisabled={input.lines.length === 0} fullWidth>
                Simpan order
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}
