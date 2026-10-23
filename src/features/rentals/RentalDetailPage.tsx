import { Alert, Button, Link } from "@heroui/react";
import { CalendarPlus, Pencil, Undo2, Wrench, Truck } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  cancelRental,
  checkoutRental,
  createRepairsFromRental,
  EPS,
  extendRental,
  outstandingCheckouts,
  rentalCharges,
  returnRental,
  today,
  type ID,
  type Rental,
  type ReturnCondition,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { PaymentsSection } from "@/components/PaymentsSection";
import { ConfirmButton, DataTable, KeyValue, PageHeader, Row, Section, StatusChip, Tag, TaskModal } from "@/components/ui";
import { formatDate, formatDateTime, formatIDR } from "@/lib/format";
import { RENTAL_STATUS, RETURN_CONDITION, WO_STATUS } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export default function RentalDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [returning, setReturning] = useState(false);
  const [extending, setExtending] = useState(false);
  const r = db.rentals.find((x) => x.id === id);
  if (!r) return <RecordNotFound what="Rental" back="/rentals" />;

  const t = today();
  const ch = rentalCharges(r, t);
  const out = outstandingCheckouts(r);
  const lotCode = (lotId: ID) => db.lots.find((l) => l.id === lotId)?.code ?? "?";
  const damagedOpen = r.returns.some((x) => x.condition === "rusak");
  const repairWos = (r.repairWoIds ?? []).map((wid) => db.workOrders.find((w) => w.id === wid)).filter((w) => !!w);
  const hasUnrepaired =
    damagedOpen &&
    db.moves.some(
      (m) =>
        m.ref.id === r.id &&
        m.type === "rusak_sewa" &&
        m.qty === 0 &&
        db.lots.some((l) => l.id === m.lotId && l.status === "rusak" && l.qty > EPS) &&
        !db.workOrders.some((w) => w.status !== "batal" && w.plannedInputs.some((i) => i.lotId === m.lotId)),
    );

  return (
    <>
      <PageHeader
        back="/rentals"
        title={r.project}
        badge={
          <>
            <Tag>{r.kind === "sewa" ? "Rental" : "Loan"}</Tag>
            <StatusChip tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</StatusChip>
          </>
        }
        description={`${r.code} · ${partnerName(r.customerId)} · ${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${ch.days} days)`}
        actions={
          <>
            {r.status === "dipesan" && (
              <>
                <ConfirmButton
                  variant="danger-soft"
                  danger
                  title={`Cancel ${r.code}?`}
                  confirmLabel="Cancel booking"
                  onConfirm={() => run((d) => cancelRental(d, r.id), `${r.code} cancelled`)}
                >
                  Cancel
                </ConfirmButton>
                <Button variant="secondary" onPress={() => navigate(`/rentals/${r.id}/edit`)}>
                  <Pencil className="size-4" /> Edit
                </Button>
                <ConfirmButton
                  variant="primary"
                  title="Hand the units over to the customer?"
                  description="Units are taken automatically from available stock (oldest first) and stay On rent until they come back."
                  confirmLabel="Hand over"
                  onConfirm={() => run((d) => checkoutRental(d, r.id), "Units handed over to the customer")}
                >
                  <Truck className="size-4" /> Hand over units
                </ConfirmButton>
              </>
            )}
            {(r.status === "dipesan" || r.status === "berjalan") && (
              <Button variant="secondary" onPress={() => setExtending(true)}>
                <CalendarPlus className="size-4" /> Extend
              </Button>
            )}
            {r.status === "berjalan" && (
              <Button onPress={() => setReturning(true)}>
                <Undo2 className="size-4" /> Take back
              </Button>
            )}
            {hasUnrepaired && (
              <Button
                variant="secondary"
                onPress={() => {
                  const wos = run((d) => createRepairsFromRental(d, r.id), (w) => `${w.length} repair work orders created`);
                  if (wos?.[0]) navigate(`/work-orders/${wos[0].id}`);
                }}
              >
                <Wrench className="size-4" /> Create repair work orders
              </Button>
            )}
          </>
        }
      />

      {ch.isOverdue && (
        <Alert status="danger" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>{ch.lateDays} days late</Alert.Title>
            <Alert.Description>Late fee so far {formatIDR(ch.lateFee)} (daily rate × units × days late).</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Booked units" bodyClassName="p-0">
            <DataTable
              label="Units"
              rows={r.lines}
              columns={[
                { key: "item", header: "Product", isRowHeader: true, cell: (l) => <span className="font-medium">{item(l.itemId)?.name ?? "?"}</span> },
                { key: "qty", header: "Qty", align: "end", cell: (l) => l.qty },
                { key: "rate", header: "Rate/day", align: "end", cell: (l) => formatIDR(l.ratePerDay) },
                { key: "sub", header: "Subtotal", align: "end", cell: (l) => formatIDR(l.qty * l.ratePerDay * ch.days) },
              ]}
            />
          </Section>
          {r.checkouts.length > 0 && (
            <Section title="Handover" bodyClassName="p-0">
              <DataTable
                label="Units handed over"
                rows={r.checkouts}
                dependencies={[r.returns]}
                columns={[
                  { key: "lot", header: "Lot", isRowHeader: true, className: "whitespace-nowrap", cell: (c) => <span className="font-medium">{lotCode(c.lotId)}</span> },
                  { key: "item", header: "Product", cell: (c) => item(c.itemId)?.name ?? "?" },
                  { key: "qty", header: "Handed over", align: "end", cell: (c) => c.qty },
                  { key: "out", header: "Still out", align: "end", cell: (c) => out.find((o) => o.id === c.id)?.outstanding ?? 0 },
                  { key: "at", header: "Time", cell: (c) => <span className="text-muted">{formatDateTime(c.at)}</span> },
                ]}
              />
            </Section>
          )}
          {r.returns.length > 0 && (
            <Section title="Returns" bodyClassName="p-0">
              <DataTable
                label="Returns"
                rows={r.returns}
                columns={[
                  { key: "at", header: "Time", isRowHeader: true, className: "whitespace-nowrap", cell: (x) => formatDateTime(x.at) },
                  { key: "item", header: "Product", cell: (x) => item(x.itemId)?.name ?? "?" },
                  { key: "qty", header: "Qty", align: "end", cell: (x) => x.qty },
                  { key: "cond", header: "Condition", cell: (x) => <StatusChip tone={RETURN_CONDITION[x.condition].tone}>{RETURN_CONDITION[x.condition].label}</StatusChip> },
                  { key: "fee", header: "Fee", align: "end", cell: (x) => (x.fee ? formatIDR(x.fee) : "—") },
                  { key: "note", header: "Note", cell: (x) => <span className="text-muted">{x.note || "—"}</span> },
                ]}
              />
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Section title="Charges">
            {r.kind === "sewa" && (
              <>
                <Row label={`Rental ${ch.days} days`} value={formatIDR(ch.base)} />
                {ch.lateFee > 0 && <Row label={`Late fee (${ch.lateDays} days)`} value={formatIDR(ch.lateFee)} tone="danger" />}
              </>
            )}
            {r.extraCharges.map((c) => (
              <Row key={c.id} label={c.label} value={formatIDR(c.amount)} />
            ))}
            {ch.damageFee > 0 && <Row label="Damage / loss fee" value={formatIDR(ch.damageFee)} tone="danger" />}
            {ch.discount > 0 && <Row label="Discount" value={`− ${formatIDR(ch.discount)}`} />}
            <Row label="Total charges" value={formatIDR(ch.total)} strong />
          </Section>
          {r.status !== "batal" && <PaymentsSection doc="rental" id={r.id} payments={r.payments} extraNote={`Deposit ${formatIDR(r.deposit)} is deducted from the charges.`} />}
          {repairWos.length > 0 && (
            <Section title="Repairs">
              {repairWos.map((w) => (
                <Row key={w.id} label={<Link href={`/work-orders/${w.id}`}>{w.code}</Link>} value={<StatusChip tone={WO_STATUS[w.status].tone}>{WO_STATUS[w.status].label}</StatusChip>} />
              ))}
            </Section>
          )}
          <Section title="Info">
            <KeyValue columns={1} items={[["Customer", partnerName(r.customerId)], ["Note", r.note]]} />
          </Section>
        </div>
      </div>

      <ReturnDialog rental={r} isOpen={returning} onOpenChange={setReturning} />
      <ExtendDialog key={r.endDate} rental={r} isOpen={extending} onOpenChange={setExtending} />
    </>
  );
}

interface ReturnRow {
  checkoutId: ID;
  condition: ReturnCondition;
  qty: number;
  fee: number;
  note: string;
}

function ReturnDialog({ rental, isOpen, onOpenChange }: { rental: Rental; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} title="Take units back" description="Check every unit. Damaged units are marked Damaged and can get a repair work order right away.">
      {isOpen && <ReturnForm rental={rental} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function ReturnForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const out = outstandingCheckouts(rental);
  const [rows, setRows] = useState<(ReturnRow & { key: string })[]>(() =>
    out.map((c) => ({ key: c.id, checkoutId: c.id, condition: "baik", qty: c.outstanding, fee: 0, note: "" })),
  );
  const update = (key: string, patch: Partial<ReturnRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = () => {
    const ok = run((d) => returnRental(d, rental.id, rows), "Return recorded");
    if (ok) onDone();
  };
  return (
    <div className="flex flex-col gap-3">
      {out.map((c) => {
        const it = item(c.itemId);
        const mine = rows.filter((r) => r.checkoutId === c.id);
        const used = mine.reduce((a, r) => a + r.qty, 0);
        return (
          <div key={c.id} className="rounded-md border border-[var(--rule)] p-3">
            <p className="font-medium">
              {it?.name} <span className="text-sm font-normal text-muted">· {db.lots.find((l) => l.id === c.lotId)?.code} · still out {c.outstanding}</span>
            </p>
            {mine.map((r) => (
              <div key={r.key} className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[9rem_6rem_9rem_1fr]">
                <SelectInput
                  aria-label="Condition"
                  value={r.condition}
                  onChange={(v) => update(r.key, { condition: v as ReturnCondition, ...(v === "baik" ? { fee: 0 } : {}) })}
                  options={(Object.keys(RETURN_CONDITION) as ReturnCondition[]).map((x) => ({ id: x, label: RETURN_CONDITION[x].label }))}
                />
                <NumberInput aria-label="Qty" value={r.qty} onChange={(qty) => update(r.key, { qty })} maximumFractionDigits={0} maxValue={c.outstanding} />
                <NumberInput aria-label="Replacement fee" value={r.fee} onChange={(fee) => update(r.key, { fee })} money isDisabled={r.condition === "baik"} />
                <TextInput aria-label="Note" value={r.note} onChange={(note) => update(r.key, { note })} placeholder={r.condition === "baik" ? "Note (optional)" : "Describe the damage"} />
              </div>
            ))}
            {mine.some((r) => r.qty > 1) && (
              <Button
                size="sm"
                variant="tertiary"
                className="mt-2"
                onPress={() => {
                  const donor = [...mine].reverse().find((r) => r.qty > 1)!;
                  setRows([
                    ...rows.map((r) => (r.key === donor.key ? { ...r, qty: r.qty - 1 } : r)),
                    { key: `${c.id}-${Date.now()}`, checkoutId: c.id, condition: "rusak", qty: 1, fee: 0, note: "" },
                  ]);
                }}
              >
                Split off 1 unit with another condition
              </Button>
            )}
            {used < c.outstanding && <p className="mt-1 text-xs text-muted">{c.outstanding - used} units not back yet — they stay recorded with the customer.</p>}
            {used > c.outstanding && <p className="mt-1 text-xs text-danger">Total quantity is more than the units still out.</p>}
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button onPress={submit}>Save return</Button>
      </div>
    </div>
  );
}

function ExtendDialog({ rental, isOpen, onOpenChange }: { rental: Rental; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const run = useRun();
  const [endDate, setEndDate] = useState(rental.endDate);
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      title="Extend rental"
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onPress={() => run((d) => extendRental(d, rental.id, endDate), "Return date updated") && onOpenChange(false)}>Save</Button>
        </>
      }
    >
      <DateInput label="New return date" value={endDate} onChange={setEndDate} />
    </TaskModal>
  );
}
