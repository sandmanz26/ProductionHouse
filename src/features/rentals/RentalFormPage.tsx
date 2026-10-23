import { Button, Card, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  addDays,
  availableForRange,
  createRental,
  rentalDays,
  sum,
  today,
  updateRental,
  type ID,
  type RentalInput,
  type RentalKind,
} from "@/domain";
import { DateInput, NumberInput, TextAreaInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker, PartnerPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  ratePerDay: number;
}
let seq = 0;
const k = () => `w${++seq}`;

export default function RentalFormPage() {
  const { id } = useParams();
  const db = useDb();
  const r = id ? db.rentals.find((x) => x.id === id) : undefined;
  if (id && !r) return <RecordNotFound what="Rental" back="/rentals" />;
  if (r && r.status !== "dipesan") return <RecordNotFound what="Editable booking" back={`/rentals/${r.id}`} />;
  return <RentalForm key={id ?? "new"} existingId={r?.id} />;
}

function RentalForm({ existingId }: { existingId?: ID }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const existing = existingId ? db.rentals.find((x) => x.id === existingId) : undefined;

  const [kind, setKind] = useState<RentalKind>(existing?.kind ?? "sewa");
  const [customerId, setCustomerId] = useState<ID | null>(existing?.customerId ?? null);
  const [project, setProject] = useState(existing?.project ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [endDate, setEndDate] = useState(existing?.endDate ?? addDays(today(), 2));
  const [lines, setLines] = useState<Line[]>(
    existing?.lines.map((l) => ({ key: k(), itemId: l.itemId, qty: l.qty, ratePerDay: l.ratePerDay })) ?? [{ key: k(), itemId: null, qty: 1, ratePerDay: 0 }],
  );
  const [deposit, setDeposit] = useState(existing?.deposit ?? 0);
  const [discount, setDiscount] = useState(existing?.discount ?? 0);
  const [charges, setCharges] = useState<{ key: string; label: string; amount: number }[]>(
    existing?.extraCharges?.map((c) => ({ key: k(), label: c.label, amount: c.amount })) ?? [],
  );
  const [note, setNote] = useState(existing?.note ?? "");

  const validDates = !!startDate && !!endDate && endDate >= startDate;
  const days = validDates ? rentalDays(startDate, endDate) : 0;
  const input: RentalInput = {
    kind,
    customerId: customerId ?? undefined,
    project,
    startDate,
    endDate,
    lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty, ratePerDay: kind === "pinjam" ? 0 : l.ratePerDay })),
    deposit,
    discount,
    extraCharges: charges.map((c) => ({ label: c.label, amount: c.amount })),
    note: note || undefined,
  };
  const base = sum(input.lines.map((l) => l.qty * l.ratePerDay * days));
  const availability = new Map(
    input.lines.map((l) => [l.itemId, validDates ? availableForRange(db, l.itemId, startDate, endDate, { excludeRentalId: existing?.id }) : undefined]),
  );
  const overbooked = input.lines.filter((l) => {
    const a = availability.get(l.itemId);
    const requested = sum(input.lines.filter((x) => x.itemId === l.itemId).map((x) => x.qty));
    return a && requested > a.available;
  });

  const save = () => {
    const r = run((d) => (existing ? updateRental(d, existing.id, input) : createRental(d, input)), (x) => `Booking ${x.code} saved`);
    if (r) navigate(`/rentals/${r.id}`, { replace: true });
  };
  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader title={existing ? `Edit ${existing.code}` : "Rental / loan booking"} back={existing ? `/rentals/${existing.id}` : "/rentals"} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Details">
            <div className="flex flex-col gap-4">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[kind]}
                onSelectionChange={(keys: Set<Key>) => {
                  const v = [...keys][0];
                  if (v) setKind(v as RentalKind);
                }}
                aria-label="Type"
              >
                <ToggleButton id="sewa">Rental (paid)</ToggleButton>
                <ToggleButton id="pinjam">Loan (free)</ToggleButton>
              </ToggleButtonGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput label="Event / project name" value={project} onChange={setProject} placeholder="e.g. Ad shoot, wedding, exhibition" isRequired />
                <PartnerPicker role="customer" value={customerId} onChange={setCustomerId} label="Customer" />
                <DateInput label="Start" value={startDate} onChange={setStartDate} isRequired />
                <DateInput
                  label="Return"
                  value={endDate}
                  onChange={setEndDate}
                  isRequired
                  errorMessage={startDate && endDate && endDate < startDate ? "Return date is before the start date" : undefined}
                  description={validDates ? `${days} days (including the start day)` : undefined}
                />
              </div>
            </div>
          </Section>
          <Section title="Units">
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const a = l.itemId ? availability.get(l.itemId) : undefined;
                const requested = sum(lines.filter((x) => x.itemId === l.itemId).map((x) => x.qty));
                const ok = a ? requested <= a.available : true;
                return (
                  <div key={l.key}>
                    <div className={`grid grid-cols-1 items-end gap-2 ${kind === "sewa" ? "sm:grid-cols-[1fr_6rem_10rem_auto]" : "sm:grid-cols-[1fr_6rem_auto]"}`}>
                      <ItemPicker
                        kind="product"
                        value={l.itemId}
                        onChange={(itemId) => update(l.key, { itemId, ratePerDay: l.ratePerDay || item(itemId ?? undefined)?.rentalRatePerDay || 0 })}
                        aria-label="Product"
                      />
                      <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix="units" maximumFractionDigits={0} minValue={1} />
                      {kind === "sewa" && <NumberInput aria-label="Rate per day" value={l.ratePerDay} onChange={(ratePerDay) => update(l.key, { ratePerDay })} money />}
                      <Button isIconOnly variant="ghost" aria-label="Remove" isDisabled={lines.length === 1} onPress={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {a && (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${ok ? "text-success" : "text-danger"}`}>
                        {ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                        {a.available} of {a.owned} units available on these dates
                        {a.held > 0 && ` (${a.held} booked for other events)`}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setLines([...lines, { key: k(), itemId: null, qty: 1, ratePerDay: 0 }])}>
                  <Plus className="size-4" /> Add unit
                </Button>
              </div>
            </div>
          </Section>
          <Section title="Other">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label="Deposit / security" value={deposit} onChange={setDeposit} money />
              {kind === "sewa" && <NumberInput label="Discount" value={discount} onChange={setDiscount} money />}
              <div className="flex flex-col gap-2 sm:col-span-2">
                <p className="text-sm font-medium">Extra charges</p>
                {charges.map((c) => (
                  <div key={c.key} className="grid grid-cols-[1fr_9rem_auto] items-end gap-2">
                    <TextInput aria-label="Description" value={c.label} onChange={(label) => setCharges(charges.map((x) => (x.key === c.key ? { ...x, label } : x)))} placeholder="e.g. delivery & pickup, setup, cleaning" />
                    <NumberInput aria-label="Amount" value={c.amount} onChange={(amount) => setCharges(charges.map((x) => (x.key === c.key ? { ...x, amount } : x)))} money />
                    <Button isIconOnly variant="ghost" aria-label="Remove charge" onPress={() => setCharges(charges.filter((x) => x.key !== c.key))}>
                      <Trash2 className="size-4" />
                    </Button>
                  </div>
                ))}
                <div>
                  <Button size="sm" variant="tertiary" onPress={() => setCharges([...charges, { key: k(), label: "Delivery, pickup & setup", amount: 0 }])}>
                    <Plus className="size-4" /> Delivery / setup charge
                  </Button>
                </div>
              </div>
              <TextAreaInput className="sm:col-span-2" label="Note" value={note} onChange={setNote} rows={2} placeholder="Venue address, on-site contact, special terms…" />
            </div>
          </Section>
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Summary</Card.Title>
            </Card.Header>
            <Card.Content>
              <Row label="Duration" value={`${days} days`} />
              <Row label="Units" value={sum(input.lines.map((l) => l.qty))} />
              {kind === "sewa" && (
                <>
                  <Row label="Rental charge" value={formatIDR(base)} />
                  {sum(charges.map((c) => c.amount)) > 0 && <Row label="Extra charges" value={formatIDR(sum(charges.map((c) => c.amount)))} />}
                  {discount > 0 && <Row label="Discount" value={`− ${formatIDR(discount)}`} />}
                  <div className="my-2 border-t border-[var(--rule)]" />
                  <Row label="Total" value={formatIDR(Math.max(0, base + sum(charges.map((c) => c.amount)) - discount))} strong />
                </>
              )}
              <Row label="Deposit" value={formatIDR(deposit)} muted />
              {overbooked.length > 0 && (
                <p className="mt-3 rounded-sm bg-danger-soft p-3 text-xs text-danger-soft-foreground">
                  Not enough units on these dates. You can still save the booking (e.g. units are in production), but hand-over will be refused until the stock exists.
                </p>
              )}
            </Card.Content>
            <Card.Footer>
              <Button onPress={save} isDisabled={!validDates || !project.trim() || input.lines.length === 0} fullWidth>
                Save booking
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}
