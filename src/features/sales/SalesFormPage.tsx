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
import { DateInput, NumberInput, SelectInput, TextAreaInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker, PartnerPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, formatMoney, formatPct, formatQty, UOM_LABEL } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { emptyExport } from "./export-info";
import { ExportFields } from "./ExportFields";

const CURRENCIES: Currency[] = ["IDR", "USD", "EUR", "SGD", "AUD", "JPY"];

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  unitPrice: number;
  spec: string;
}
let seq = 0;
const k = () => `s${++seq}`;

export default function SalesFormPage() {
  const { id } = useParams();
  const db = useDb();
  const so = id ? db.sales.find((s) => s.id === id) : undefined;
  if (id && !so) return <RecordNotFound what="Order" back="/sales" />;
  if (so && so.deliveries.length > 0) return <RecordNotFound what="Unshipped order" back={`/sales/${so.id}`} />;
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
    existing?.lines.map((l) => ({ key: k(), itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, spec: l.spec ?? "" })) ?? [{ key: k(), itemId: null, qty: 1, unitPrice: 0, spec: "" }],
  );
  const [discount, setDiscount] = useState(existing?.discount ?? 0);
  const [shipping, setShipping] = useState(existing?.shippingCharge ?? 0);
  const [dpPercent, setDpPercent] = useState(existing?.dpPercent ?? 0);
  const [paymentDueDate, setPaymentDueDate] = useState(existing?.paymentDueDate ?? "");
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
    lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty, unitPrice: l.unitPrice, spec: l.spec || undefined })),
    discount,
    shippingCharge: shipping,
    dpPercent: dpPercent || undefined,
    paymentDueDate: paymentDueDate || undefined,
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
    const r = run((d) => (existing ? updateSalesOrder(d, existing.id, input) : createSalesOrder(d, input)), (s) => `Order ${s.code} saved`);
    if (r) navigate(`/sales/${r.id}`, { replace: true });
  };
  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader title={existing ? `Edit ${existing.code}` : "New sales order"} back={existing ? `/sales/${existing.id}` : "/sales"} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Customer & channel">
            <div className="flex flex-col gap-4">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[channel]}
                onSelectionChange={(keys: Set<Key>) => {
                  const v = [...keys][0];
                  if (v) changeChannel(v as SalesChannel);
                }}
                aria-label="Sales channel"
              >
                <ToggleButton id="supply">Domestic supply</ToggleButton>
                <ToggleButton id="ekspor">Export</ToggleButton>
              </ToggleButtonGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <PartnerPicker role="customer" value={customerId} onChange={setCustomerId} />
                <div className="grid grid-cols-2 gap-3">
                  <DateInput label="Order date" value={date} onChange={setDate} />
                  <DateInput label="Ship by" value={dueDate} onChange={setDueDate} />
                </div>
                <SelectInput label="Currency" value={currency} onChange={(v) => changeCurrency(v as Currency)} options={CURRENCIES.map((c) => ({ id: c, label: c }))} />
                {currency !== "IDR" && (
                  <NumberInput label={`Exchange rate (Rp per 1 ${currency})`} value={rate} onChange={setRate} money description="Default from Settings; match it to the contract rate." />
                )}
              </div>
            </div>
          </Section>

          <Section title="Items" description="Products, or materials (e.g. selling offcuts or waste with value).">
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const it = item(l.itemId ?? undefined);
                const free = l.itemId ? freeQtyFor(db, l.itemId) : 0;
                return (
                  <div key={l.key}>
                    <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_7rem_10rem_auto]">
                      <ItemPicker
                        value={l.itemId}
                        onChange={(itemId) =>
                          update(l.key, {
                            itemId,
                            unitPrice: l.unitPrice || Math.round(((item(itemId ?? undefined)?.salePrice ?? 0) / (currency === "IDR" ? 1 : rate)) * 100) / 100,
                          })
                        }
                        aria-label="Item"
                      />
                      <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix={it ? UOM_LABEL[it.uom] : undefined} maximumFractionDigits={it?.kind === "product" ? 0 : 3} />
                      <NumberInput aria-label={`Price (${currency})`} value={l.unitPrice} onChange={(unitPrice) => update(l.key, { unitPrice })} money={currency === "IDR"} suffix={currency !== "IDR" ? currency : undefined} maximumFractionDigits={2} />
                      <Button isIconOnly variant="ghost" aria-label="Remove" isDisabled={lines.length === 1} onPress={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {it?.kind === "product" && (
                      <TextInput
                        aria-label="Custom spec"
                        className="mt-2"
                        value={l.spec}
                        onChange={(spec) => update(l.key, { spec })}
                        placeholder="Custom spec (optional): size, finishing, fabric…"
                      />
                    )}
                    {it && (
                      <p className={`mt-1 text-xs ${free < l.qty ? "text-warning" : "text-muted"}`}>
                        Ready to ship {formatQty(free, it.uom)}
                        {free < l.qty && ` — short by ${formatQty(l.qty - free, it.uom)}; you can create a work order once the order is saved`}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setLines([...lines, { key: k(), itemId: null, qty: 1, unitPrice: 0, spec: "" }])}>
                  <Plus className="size-4" /> Add product
                </Button>
              </div>
            </div>
          </Section>

          {channel === "ekspor" && (
            <Section title="Export details" description="Used for the proforma invoice, packing list and the document completeness check.">
              <ExportFields value={exp} onChange={setExp} />
            </Section>
          )}

          <Section title="Other">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label={`Discount (${currency})`} value={discount} onChange={setDiscount} money={currency === "IDR"} maximumFractionDigits={2} />
              <NumberInput label={`Shipping charged (${currency})`} value={shipping} onChange={setShipping} money={currency === "IDR"} maximumFractionDigits={2} />
              <NumberInput label="Down payment required" value={dpPercent} onChange={setDpPercent} suffix="%" maxValue={100} description="e.g. 30% up front, the rest before shipping." />
              <DateInput label="Final payment due date" value={paymentDueDate} onChange={setPaymentDueDate} />
              <TextAreaInput className="sm:col-span-2" label="Note" value={note} onChange={setNote} rows={2} />
            </div>
          </Section>
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Summary</Card.Title>
            </Card.Header>
            <Card.Content>
              <Row label="Subtotal" value={formatMoney(subtotal, currency)} />
              {discount > 0 && <Row label="Discount" value={`− ${formatMoney(discount, currency)}`} />}
              {shipping > 0 && <Row label="Shipping" value={formatMoney(shipping, currency)} />}
              <div className="my-2 border-t border-[var(--rule)]" />
              <Row label="Total" value={formatMoney(total, currency)} strong />
              {currency !== "IDR" && <Row label="Equivalent" value={formatIDR(total * rate)} muted />}
              <div className="mt-3 rounded-md bg-default/60 p-3">
                <Row label="Estimated COGS" value={formatIDR(estCost)} />
                <Row label="Estimated gross margin" value={`${formatIDR(margin)} · ${subtotal ? formatPct(margin / (subtotal * input.exchangeRate)) : "—"}`} tone={margin < 0 ? "danger" : "success"} />
              </div>
            </Card.Content>
            <Card.Footer>
              <Button onPress={save} isDisabled={input.lines.length === 0} fullWidth>
                Save order
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}
