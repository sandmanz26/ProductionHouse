import { Button } from "@heroui/react";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { addPayment, billedAmount, removePayment, today, type ID, type PayableDoc, type Payment, type PaymentMethod } from "@/domain";
import { DateInput, NumberInput, SelectInput, SwitchInput, TextInput } from "@/components/fields";
import { ConfirmButton, Row, Section, TaskModal } from "@/components/ui";
import { formatDate, formatMoney } from "@/lib/format";
import { PAYMENT_METHOD } from "@/lib/labels";
import { useDb, useRun } from "@/store/db-store";

const DOC_LABEL: Record<PayableDoc, { billed: string; owe: string; title: string }> = {
  sale: { billed: "Billed", owe: "Receivable left", title: "Customer payments" },
  rental: { billed: "Rental billed", owe: "Balance due", title: "Rental payments" },
  purchase: { billed: "Purchase total", owe: "Payable left", title: "Supplier payments" },
};

/** Payments (down payment, instalments, final payment, refunds) for one document. */
export function PaymentsSection({ doc, id, payments, extraNote }: { doc: PayableDoc; id: ID; payments: Payment[]; extraNote?: string }) {
  const db = useDb();
  const run = useRun();
  const [open, setOpen] = useState(false);
  const b = billedAmount(db, doc, id);
  const label = DOC_LABEL[doc];
  return (
    <Section
      title={label.title}
      actions={
        <Button size="sm" variant="secondary" onPress={() => setOpen(true)}>
          <Plus className="size-3.5" /> Record
        </Button>
      }
    >
      <Row label={label.billed} value={formatMoney(b.billed, b.currency)} />
      <Row label={doc === "rental" ? "Deposit + paid" : "Paid"} value={formatMoney(b.paid, b.currency)} />
      <Row
        label={b.balance < 0 ? (doc === "rental" ? "Deposit to refund" : "Overpaid") : label.owe}
        value={formatMoney(Math.abs(b.balance), b.currency)}
        strong
        tone={b.balance > 0.5 ? "warning" : b.balance < -0.5 ? "danger" : "success"}
      />
      {extraNote && <p className="mt-1 text-xs text-muted">{extraNote}</p>}
      {payments.length > 0 && (
        <ul className="mt-3 divide-y divide-[var(--rule)] border-t border-[var(--rule)]">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-2 py-1.5">
              <div className="min-w-0 text-[13px]">
                <span className="num">{formatDate(p.date)}</span> · {PAYMENT_METHOD[p.method]}
                {p.note && <span className="text-muted"> · {p.note}</span>}
              </div>
              <div className="flex items-center gap-1">
                <span className={`num text-[13px] ${p.amount < 0 ? "text-danger" : ""}`}>{formatMoney(p.amount, b.currency)}</span>
                <ConfirmButton
                  size="sm"
                  variant="ghost"
                  danger
                  title="Delete this payment?"
                  description="Use this for an entry made by mistake. The balance is recalculated."
                  confirmLabel="Delete"
                  onConfirm={() => run((d) => removePayment(d, doc, id, p.id), "Payment deleted")}
                >
                  <Trash2 className="size-3.5" />
                </ConfirmButton>
              </div>
            </li>
          ))}
        </ul>
      )}
      <PaymentDialog doc={doc} id={id} isOpen={open} onOpenChange={setOpen} />
    </Section>
  );
}

export function PaymentDialog({ doc, id, isOpen, onOpenChange }: { doc: PayableDoc; id: ID; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} size="sm" title="Record payment">
      {isOpen && <PaymentForm doc={doc} id={id} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function PaymentForm({ doc, id, onDone }: { doc: PayableDoc; id: ID; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const b = billedAmount(db, doc, id);
  const [refund, setRefund] = useState(b.balance < -0.5);
  const [amount, setAmount] = useState(Math.abs(b.balance));
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [note, setNote] = useState("");
  const idr = b.currency === "IDR";
  return (
    <div className="flex flex-col gap-3">
      <SwitchInput isSelected={refund} onChange={setRefund} label="This is a refund" description="E.g. a rental deposit paid back." />
      <NumberInput
        label={`Amount (${b.currency})`}
        value={amount}
        onChange={setAmount}
        money={idr}
        maximumFractionDigits={idr ? 0 : 2}
        description={`Balance ${formatMoney(Math.abs(b.balance), b.currency)}`}
      />
      <div className="grid grid-cols-2 gap-3">
        <DateInput label="Date" value={date} onChange={setDate} />
        <SelectInput label="Method" value={method} onChange={(v) => setMethod(v as PaymentMethod)} options={(Object.keys(PAYMENT_METHOD) as PaymentMethod[]).map((m) => ({ id: m, label: PAYMENT_METHOD[m] }))} />
      </div>
      <TextInput label="Note" value={note} onChange={setNote} placeholder="e.g. 30% down payment, final payment, reference no." />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          isDisabled={!amount}
          onPress={() => {
            const ok = run((d) => addPayment(d, doc, id, { date, amount: refund ? -amount : amount, method, note }), refund ? "Refund recorded" : "Payment recorded");
            if (ok) onDone();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}
