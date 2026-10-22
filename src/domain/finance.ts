import { assert, assertDate, EPS, newId, roundMoney, sum } from "./core";
import { diffDays, today } from "./dates";
import { purchaseTotals } from "./purchasing";
import { rentalCharges } from "./rentals";
import { salesTotals } from "./sales";
import type { Currency, Db, ID, ISODate, Payment, PaymentMethod, Purchase, Rental, SalesOrder } from "./types";

export type PayableDoc = "sale" | "purchase" | "rental";

export interface PaymentInput {
  date: ISODate;
  amount: number;
  method?: PaymentMethod;
  note?: string;
}

const paid = (payments: Payment[]) => roundMoney(sum(payments.map((p) => p.amount)));

/** Amount billed so far (order currency). Draft/cancelled documents bill nothing. */
export function billedAmount(db: Db, doc: PayableDoc, id: ID): { billed: number; paid: number; balance: number; currency: Currency } {
  if (doc === "sale") {
    const so = findSale(db, id);
    const billed = so.status === "batal" ? 0 : salesTotals(db, so).total;
    return { billed, paid: paid(so.payments), balance: roundMoney(billed - paid(so.payments)), currency: so.currency };
  }
  if (doc === "purchase") {
    const p = findPurchase(db, id);
    const billed = p.status === "batal" ? 0 : purchaseTotals(p).total;
    return { billed, paid: paid(p.payments), balance: roundMoney(billed - paid(p.payments)), currency: "IDR" };
  }
  const r = findRental(db, id);
  const ch = rentalCharges(r);
  // The deposit is applied against the bill; a negative balance is money to refund.
  const billed = r.status === "batal" ? 0 : ch.total;
  const settled = r.deposit + paid(r.payments);
  return { billed, paid: settled, balance: roundMoney(billed - settled), currency: "IDR" };
}

function findSale(db: Db, id: ID): SalesOrder {
  const so = db.sales.find((s) => s.id === id);
  assert(so, "Order penjualan tidak ditemukan.");
  return so;
}
function findPurchase(db: Db, id: ID): Purchase {
  const p = db.purchases.find((x) => x.id === id);
  assert(p, "Pembelian tidak ditemukan.");
  return p;
}
function findRental(db: Db, id: ID): Rental {
  const r = db.rentals.find((x) => x.id === id);
  assert(r, "Data sewa tidak ditemukan.");
  return r;
}

function paymentsOf(db: Db, doc: PayableDoc, id: ID): Payment[] {
  if (doc === "sale") return findSale(db, id).payments;
  if (doc === "purchase") return findPurchase(db, id).payments;
  return findRental(db, id).payments;
}

/**
 * Records a payment (DP, instalment, settlement) or a refund (negative amount). Overpaying is
 * blocked so the balance can never silently turn into an unexplained credit.
 */
export function addPayment(db: Db, doc: PayableDoc, id: ID, input: PaymentInput): Payment {
  assertDate(input.date, "Tanggal pembayaran");
  assert(typeof input.amount === "number" && Number.isFinite(input.amount), "Jumlah pembayaran harus berupa angka.");
  assert(Math.abs(input.amount) > EPS, "Jumlah pembayaran tidak boleh 0.");
  if (doc === "sale") assert(findSale(db, id).status !== "batal", "Order sudah dibatalkan.");
  if (doc === "purchase") assert(findPurchase(db, id).status !== "batal", "Pembelian sudah dibatalkan.");
  if (doc === "rental") assert(findRental(db, id).status !== "batal", "Sewa sudah dibatalkan.");
  const { balance } = billedAmount(db, doc, id);
  const list = paymentsOf(db, doc, id);
  if (input.amount > 0) {
    // A sale may be paid up front (DP) up to its full value, before anything is shipped.
    assert(input.amount <= balance + 0.01, `Pembayaran melebihi sisa tagihan (${roundMoney(Math.max(0, balance))}).`);
  } else {
    // Refund: of money paid, or of a rental deposit that exceeds the final bill.
    const refundable = doc === "rental" ? Math.max(-balance, paid(list)) : paid(list);
    assert(-input.amount <= refundable + 0.01, `Refund melebihi yang bisa dikembalikan (${roundMoney(Math.max(0, refundable))}).`);
  }
  const payment: Payment = {
    id: newId(),
    date: input.date,
    amount: roundMoney(input.amount),
    method: input.method ?? "transfer",
    note: input.note?.trim() || undefined,
  };
  list.push(payment);
  return payment;
}

export function removePayment(db: Db, doc: PayableDoc, id: ID, paymentId: ID) {
  const list = paymentsOf(db, doc, id);
  const idx = list.findIndex((p) => p.id === paymentId);
  assert(idx >= 0, "Pembayaran tidak ditemukan.");
  const removed = list[idx]!;
  if (removed.amount < 0) {
    // Undoing a refund puts the money back on the document; it must not exceed the bill.
    assert(billedAmount(db, doc, id).balance + removed.amount >= -0.01 || doc === "rental", "Refund ini tidak bisa dihapus karena membuat pembayaran melebihi tagihan.");
  }
  list.splice(idx, 1);
  return true;
}

/** Down-payment status of a sales order. */
export function dpStatus(db: Db, so: SalesOrder) {
  const total = salesTotals(db, so).total;
  const required = roundMoney((total * (so.dpPercent ?? 0)) / 100);
  const received = paid(so.payments);
  return { required, received, met: received + 0.01 >= required, total };
}

export interface OpenItem {
  doc: PayableDoc;
  id: ID;
  code: string;
  partnerId?: ID;
  date: ISODate;
  dueDate: ISODate;
  currency: Currency;
  billed: number;
  paid: number;
  balance: number;
  balanceIdr: number;
  /** Days past due (negative = not yet due). */
  overdueDays: number;
  /** Goods/units already handed over while not fully paid. */
  delivered: boolean;
}

/** Customer receivables (sales + rentals) with ageing. */
export function receivables(db: Db, asOf: ISODate = today()): OpenItem[] {
  const out: OpenItem[] = [];
  for (const so of db.sales) {
    if (so.status === "draft" || so.status === "batal") continue;
    const b = billedAmount(db, "sale", so.id);
    if (b.balance <= 0.5) continue;
    const due = so.paymentDueDate ?? so.dueDate ?? so.date;
    // A receivable exists once goods have left, or once the agreed payment date has passed.
    if (so.deliveries.length === 0 && diffDays(due, asOf) <= 0) continue;
    out.push({
      doc: "sale",
      id: so.id,
      code: so.code,
      partnerId: so.customerId,
      date: so.date,
      dueDate: due,
      ...b,
      balanceIdr: roundMoney(b.balance * so.exchangeRate),
      overdueDays: diffDays(due, asOf),
      delivered: so.deliveries.length > 0,
    });
  }
  for (const r of db.rentals) {
    if (r.status === "dipesan" || r.status === "batal") continue;
    const b = billedAmount(db, "rental", r.id);
    if (b.balance <= 0.5) continue;
    out.push({
      doc: "rental",
      id: r.id,
      code: r.code,
      partnerId: r.customerId,
      date: r.startDate,
      dueDate: r.endDate,
      ...b,
      balanceIdr: b.balance,
      overdueDays: diffDays(r.endDate, asOf),
      delivered: true,
    });
  }
  return out.sort((a, b) => b.overdueDays - a.overdueDays);
}

/** Deposits/overpayments owed back to customers (rentals with deposit above the bill). */
export function refundsDue(db: Db): OpenItem[] {
  return db.rentals
    .filter((r) => r.status === "selesai")
    .map((r) => ({ r, b: billedAmount(db, "rental", r.id) }))
    .filter(({ b }) => b.balance < -0.5)
    .map(({ r, b }) => ({
      doc: "rental" as const,
      id: r.id,
      code: r.code,
      partnerId: r.customerId,
      date: r.startDate,
      dueDate: r.endDate,
      ...b,
      balanceIdr: b.balance,
      overdueDays: 0,
      delivered: true,
    }));
}

/** Supplier payables for received purchases. */
export function payables(db: Db, asOf: ISODate = today()): OpenItem[] {
  return db.purchases
    .filter((p) => p.status === "diterima")
    .map((p) => ({ p, b: billedAmount(db, "purchase", p.id) }))
    .filter(({ b }) => b.balance > 0.5)
    .map(({ p, b }) => {
      const due = p.dueDate ?? p.date;
      return {
        doc: "purchase" as const,
        id: p.id,
        code: p.code,
        partnerId: p.supplierId,
        date: p.date,
        dueDate: due,
        ...b,
        balanceIdr: b.balance,
        overdueDays: diffDays(due, asOf),
        delivered: true,
      };
    })
    .sort((a, b) => b.overdueDays - a.overdueDays);
}

export const AGING_BUCKETS = [
  { key: "belum", label: "Belum jatuh tempo", test: (d: number) => d <= 0 },
  { key: "1-30", label: "1–30 hari", test: (d: number) => d >= 1 && d <= 30 },
  { key: "31-60", label: "31–60 hari", test: (d: number) => d >= 31 && d <= 60 },
  { key: "60+", label: "> 60 hari", test: (d: number) => d > 60 },
] as const;

export function agingSummary(items: OpenItem[]) {
  return AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    amount: roundMoney(sum(items.filter((i) => b.test(i.overdueDays)).map((i) => i.balanceIdr))),
    count: items.filter((i) => b.test(i.overdueDays)).length,
  }));
}
