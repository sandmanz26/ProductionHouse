import {
  assert,
  assertAmount,
  assertDate,
  assertPartnerRole,
  EPS,
  getItem,
  getUsableItem,
  getLot,
  newId,
  nextCode,
  nowIso,
  recordMove,
  roundMoney,
  roundQty,
  splitLot,
  suggestLots,
  sum,
  takeFromLot,
} from "./core";
import { diffDays, localDateOf, rangesOverlap, today } from "./dates";
import { createRepairOrder } from "./production";
import type { Db, DocRef, ID, ISODate, Rental, RentalKind, ReturnCondition, WorkOrder } from "./types";

export const rentalRef = (r: Rental): DocRef => ({ type: "rental", id: r.id, code: r.code });

export function getRental(db: Db, id: ID): Rental {
  const r = db.rentals.find((x) => x.id === id);
  assert(r, "Data sewa tidak ditemukan.");
  return r;
}

/** Inclusive number of rental days (same-day = 1 day). */
export const rentalDays = (start: ISODate, end: ISODate) => Math.max(1, diffDays(start, end) + 1);

export function checkedOutQty(r: Rental, checkoutId: ID) {
  return r.checkouts.find((c) => c.id === checkoutId)?.qty ?? 0;
}

export function returnedQty(r: Rental, checkoutId: ID) {
  return roundQty(sum(r.returns.filter((x) => x.checkoutId === checkoutId).map((x) => x.qty)));
}

export function outstandingCheckouts(r: Rental) {
  return r.checkouts
    .map((c) => ({ ...c, outstanding: roundQty(c.qty - returnedQty(r, c.id)) }))
    .filter((c) => c.outstanding > EPS);
}

/** Quantity of an item a rental holds during its window (booked, or still out). */
function heldQty(r: Rental, itemId: ID): number {
  if (r.status === "dipesan") return sum(r.lines.filter((l) => l.itemId === itemId).map((l) => l.qty));
  if (r.status === "berjalan") return sum(outstandingCheckouts(r).filter((c) => c.itemId === itemId).map((c) => c.outstanding));
  return 0;
}

/**
 * Units of a product free for a date window: usable stock owned (available + currently rented)
 * minus what overlapping rentals hold. Overdue rentals are treated as extending to today.
 */
export function availableForRange(
  db: Db,
  itemId: ID,
  start: ISODate,
  end: ISODate,
  opts: { excludeRentalId?: ID; asOf?: ISODate } = {},
): { owned: number; held: number; available: number } {
  const asOf = opts.asOf ?? today();
  const owned = roundQty(
    sum(
      db.lots
        .filter((l) => l.itemId === itemId && l.qty > EPS && !l.reservedForWo && (l.status === "tersedia" || l.status === "disewa"))
        .map((l) => l.qty),
    ),
  );
  const held = roundQty(
    sum(
      db.rentals
        .filter((r) => r.id !== opts.excludeRentalId && (r.status === "dipesan" || r.status === "berjalan"))
        .filter((r) => {
          const effectiveEnd = r.status === "berjalan" && r.endDate < asOf ? asOf : r.endDate;
          return rangesOverlap(r.startDate, effectiveEnd, start, end);
        })
        .map((r) => heldQty(r, itemId)),
    ),
  );
  return { owned, held, available: roundQty(owned - held) };
}

export interface RentalInput {
  kind: RentalKind;
  customerId?: ID;
  project: string;
  startDate: ISODate;
  endDate: ISODate;
  lines: { itemId: ID; qty: number; ratePerDay: number }[];
  deposit?: number;
  discount?: number;
  extraCharges?: { label: string; amount: number }[];
  note?: string;
}

function normalizeCharges(extra: RentalInput["extraCharges"]) {
  return (extra ?? [])
    .filter((c) => c.label.trim() || c.amount)
    .map((c) => {
      assertAmount(c.amount, "Biaya tambahan");
      return { id: newId(), label: c.label.trim() || "Biaya lain", amount: c.amount };
    });
}

function validate(db: Db, input: RentalInput, keep?: ReadonlySet<ID>) {
  assert(input.project?.trim(), "Isi nama acara/proyek.");
  assertDate(input.startDate, "Tanggal mulai");
  assertDate(input.endDate, "Tanggal selesai");
  assertPartnerRole(db, input.customerId, "customer");
  assert(input.endDate >= input.startDate, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  assert(input.lines.length > 0, "Tambahkan minimal satu produk.");
  for (const l of input.lines) {
    const item = getUsableItem(db, l.itemId, keep);
    assert(item.kind === "product", `${item.name} bukan produk.`);
    assert(l.qty > EPS && Number.isInteger(l.qty), `Qty ${item.name} harus bilangan bulat > 0.`);
    assertAmount(l.ratePerDay, `Tarif ${item.name}`);
  }
  assertAmount(input.deposit ?? 0, "Deposit");
  assertAmount(input.discount ?? 0, "Diskon");
}

export function createRental(db: Db, input: RentalInput): Rental {
  validate(db, input);
  const r: Rental = {
    id: newId(),
    code: nextCode(db, "rental"),
    kind: input.kind,
    customerId: input.customerId,
    project: input.project.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    status: "dipesan",
    lines: input.lines.map((l) => ({ id: newId(), ...l, ratePerDay: input.kind === "pinjam" ? 0 : l.ratePerDay })),
    deposit: input.deposit ?? 0,
    discount: input.discount ?? 0,
    extraCharges: normalizeCharges(input.extraCharges),
    payments: [],
    checkouts: [],
    returns: [],
    note: input.note,
  };
  db.rentals.push(r);
  return r;
}

export function updateRental(db: Db, id: ID, input: RentalInput): Rental {
  const r = getRental(db, id);
  assert(r.status === "dipesan", "Hanya booking yang belum diserahkan yang bisa diubah.");
  validate(db, input, new Set(r.lines.map((l) => l.itemId)));
  const draft: Rental = {
    ...r,
    kind: input.kind,
    startDate: input.startDate,
    endDate: input.endDate,
    lines: input.lines.map((l) => ({ id: "", ...l, ratePerDay: input.kind === "pinjam" ? 0 : l.ratePerDay })),
    discount: input.discount ?? 0,
    extraCharges: normalizeCharges(input.extraCharges),
  };
  const paidSoFar = sum(r.payments.map((p) => p.amount));
  assert(
    rentalCharges(draft, input.startDate).total + 0.01 >= paidSoFar,
    "Total baru lebih kecil dari yang sudah dibayar — catat refund dulu.",
  );
  Object.assign(r, {
    kind: input.kind,
    customerId: input.customerId,
    project: input.project.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    lines: input.lines.map((l) => ({ id: newId(), ...l, ratePerDay: input.kind === "pinjam" ? 0 : l.ratePerDay })),
    deposit: input.deposit ?? 0,
    discount: input.discount ?? 0,
    extraCharges: normalizeCharges(input.extraCharges),
    note: input.note,
  });
  return r;
}

/** Extend the return date of an active rental. */
export function extendRental(db: Db, id: ID, endDate: ISODate): Rental {
  const r = getRental(db, id);
  assert(r.status === "dipesan" || r.status === "berjalan", "Sewa sudah ditutup.");
  assertDate(endDate, "Tanggal selesai");
  assert(endDate >= r.startDate, "Tanggal selesai tidak boleh sebelum tanggal mulai.");
  r.endDate = endDate;
  return r;
}

/** Hands units to the customer. Lots are split so rented units are tracked individually. */
export function checkoutRental(db: Db, id: ID, picks?: { itemId: ID; lotId: ID; qty: number }[], at = nowIso()): Rental {
  const r = getRental(db, id);
  assert(r.status === "dipesan", "Unit sudah diserahkan atau sewa ditutup.");
  const ref = rentalRef(r);
  let chosen = picks;
  if (!chosen) {
    chosen = [];
    for (const line of r.lines) {
      const item = getItem(db, line.itemId);
      const s = suggestLots(db, line.itemId, line.qty, { useRemnants: false });
      assert(s.shortage <= EPS, `Stok ${item.name} tersedia kurang ${s.shortage} unit untuk diserahkan.`);
      chosen.push(...s.picks.map((p) => ({ itemId: line.itemId, lotId: p.lotId, qty: p.qty })));
    }
  }
  for (const line of r.lines) {
    const total = sum(chosen.filter((c) => c.itemId === line.itemId).map((c) => c.qty));
    assert(Math.abs(total - line.qty) < EPS, `Qty serah ${getItem(db, line.itemId).name} harus ${line.qty}.`);
  }
  for (const c of chosen) {
    const lot = getLot(db, c.lotId);
    assert(lot.itemId === c.itemId, "Lot tidak sesuai dengan produk.");
    assert(lot.status === "tersedia" && !lot.reservedForWo, `Lot ${lot.code} tidak tersedia untuk disewa.`);
    const part = splitLot(db, lot.id, c.qty, "keluar_sewa", ref, at);
    part.status = "disewa";
    part.rentalId = r.id;
    recordMove(db, { lot: part, qty: 0, type: "keluar_sewa", ref, at, note: `Diserahkan ke ${r.project}` });
    r.checkouts.push({ id: newId(), lotId: part.id, itemId: c.itemId, qty: c.qty, at });
  }
  r.status = "berjalan";
  return r;
}

export interface ReturnInput {
  checkoutId: ID;
  qty: number;
  condition: ReturnCondition;
  fee?: number;
  note?: string;
}

export function returnRental(db: Db, id: ID, entries: ReturnInput[], at = nowIso()): Rental {
  const r = getRental(db, id);
  assert(r.status === "berjalan", "Sewa ini tidak sedang berjalan.");
  const valid = entries.filter((e) => e.qty > EPS);
  assert(valid.length > 0, "Isi qty yang dikembalikan.");
  const ref = rentalRef(r);
  for (const e of valid) {
    const co = r.checkouts.find((c) => c.id === e.checkoutId);
    assert(co, "Data serah unit tidak ditemukan.");
    const item = getItem(db, co.itemId);
    const outstanding = roundQty(co.qty - returnedQty(r, co.id));
    assert(e.qty <= outstanding + EPS, `Qty kembali ${item.name} melebihi yang masih di luar (${outstanding}).`);
    assertAmount(e.fee ?? 0, "Biaya ganti/perbaikan");
    const lot = getLot(db, co.lotId);
    if (e.condition === "hilang") {
      takeFromLot(db, lot.id, e.qty, "hilang", ref, { at, allowStatus: ["disewa"], note: e.note || "Hilang saat disewa" });
    } else {
      const part = splitLot(db, lot.id, e.qty, e.condition === "baik" ? "kembali_sewa" : "rusak_sewa", ref, at);
      part.status = e.condition === "baik" ? "tersedia" : "rusak";
      part.rentalId = undefined;
      recordMove(db, {
        lot: part,
        qty: 0,
        type: e.condition === "baik" ? "kembali_sewa" : "rusak_sewa",
        ref,
        at,
        note: e.note || (e.condition === "baik" ? "Kembali kondisi baik" : "Kembali rusak"),
      });
    }
    r.returns.push({
      id: newId(),
      checkoutId: co.id,
      itemId: co.itemId,
      qty: roundQty(e.qty),
      condition: e.condition,
      fee: e.fee ?? 0,
      at,
      note: e.note,
    });
  }
  if (outstandingCheckouts(r).length === 0) r.status = "selesai";
  return r;
}

export function cancelRental(db: Db, id: ID): Rental {
  const r = getRental(db, id);
  assert(r.status === "dipesan", "Hanya booking yang belum diserahkan yang bisa dibatalkan.");
  assert(r.payments.length === 0, "Booking sudah ada pembayaran — kembalikan/hapus pembayaran dulu.");
  r.status = "batal";
  return r;
}

/** Repair orders for units returned damaged on this rental that are still damaged. */
export function createRepairsFromRental(db: Db, id: ID): WorkOrder[] {
  const r = getRental(db, id);
  const damagedLotIds = new Set(db.lots.filter((l) => l.status === "rusak" && l.qty > EPS).map((l) => l.id));
  const candidates = db.moves
    .filter((m) => m.ref.type === "rental" && m.ref.id === r.id && m.type === "rusak_sewa" && m.qty === 0)
    .map((m) => m.lotId)
    .filter((lotId) => damagedLotIds.has(lotId));
  const already = new Set(
    db.workOrders
      .filter((w) => w.type === "perbaikan" && w.status !== "batal")
      .flatMap((w) => w.plannedInputs.map((i) => i.lotId)),
  );
  const todo = [...new Set(candidates)].filter((lotId) => !already.has(lotId));
  assert(todo.length > 0, "Tidak ada unit rusak yang perlu dibuatkan perintah perbaikan.");
  const wos = todo.map((lotId) => createRepairOrder(db, lotId, `Perbaikan ${getItem(db, getLot(db, lotId).itemId).name} — ${r.code}`));
  r.repairWoIds = [...(r.repairWoIds ?? []), ...wos.map((w) => w.id)];
  return wos;
}

export interface RentalCharges {
  days: number;
  base: number;
  extra: number;
  lateDays: number;
  lateFee: number;
  damageFee: number;
  discount: number;
  total: number;
  deposit: number;
  /** Positive: customer still owes; negative: refund due. */
  balance: number;
  isOverdue: boolean;
}

/**
 * Charges for a rental. Late fee = days past the end date × daily rate × qty, using the actual
 * return date for returned units and `asOf` for units still out.
 */
export function rentalCharges(r: Rental, asOf: ISODate = today()): RentalCharges {
  const days = rentalDays(r.startDate, r.endDate);
  const base = sum(r.lines.map((l) => l.qty * l.ratePerDay * days));
  const rateOf = (itemId: ID) => r.lines.find((l) => l.itemId === itemId)?.ratePerDay ?? 0;
  let lateFee = 0;
  let lateDays = 0;
  for (const ret of r.returns) {
    const d = Math.max(0, diffDays(r.endDate, localDateOf(ret.at)));
    lateDays = Math.max(lateDays, d);
    lateFee += d * rateOf(ret.itemId) * ret.qty;
  }
  const out = r.status === "berjalan" ? outstandingCheckouts(r) : [];
  const overdueDays = Math.max(0, diffDays(r.endDate, asOf));
  for (const c of out) {
    lateDays = Math.max(lateDays, overdueDays);
    lateFee += overdueDays * rateOf(c.itemId) * c.outstanding;
  }
  const damageFee = sum(r.returns.map((x) => x.fee));
  const extra = sum((r.extraCharges ?? []).map((c) => c.amount));
  const total = Math.max(0, base + extra + lateFee + damageFee - r.discount);
  const paid = sum((r.payments ?? []).map((p) => p.amount));
  return {
    days,
    base: roundMoney(base),
    extra: roundMoney(extra),
    lateDays,
    lateFee: roundMoney(lateFee),
    damageFee: roundMoney(damageFee),
    discount: r.discount,
    total: roundMoney(total),
    deposit: r.deposit,
    balance: roundMoney(total - r.deposit - paid),
    isOverdue: r.status === "berjalan" && out.length > 0 && overdueDays > 0,
  };
}

export interface UtilizationRow {
  itemId: ID;
  owned: number;
  unitDays: number;
  utilization: number;
  rentals: number;
  revenue: number;
  damaged: number;
}

/**
 * Rental utilisation per product over a window: unit-days out on rent ÷ (units owned × days).
 * Units out are counted from checkout until their return (or `to` while still out).
 */
export function rentalUtilization(db: Db, from: ISODate, to: ISODate): UtilizationRow[] {
  const windowDays = Math.max(1, diffDays(from, to) + 1);
  const rows = new Map<ID, UtilizationRow>();
  const row = (itemId: ID) => {
    let x = rows.get(itemId);
    if (!x) {
      const owned = sum(db.lots.filter((l) => l.itemId === itemId && l.qty > EPS && l.status !== "rusak").map((l) => l.qty));
      x = { itemId, owned, unitDays: 0, utilization: 0, rentals: 0, revenue: 0, damaged: 0 };
      rows.set(itemId, x);
    }
    return x;
  };
  for (const r of db.rentals) {
    if (r.status === "batal" || r.status === "dipesan") continue;
    const ids = new Set<ID>();
    for (const c of r.checkouts) {
      const start = localDateOf(c.at) > from ? localDateOf(c.at) : from;
      const rets = r.returns.filter((x) => x.checkoutId === c.id);
      let remaining = c.qty;
      const add = (qty: number, endDate: ISODate) => {
        const end = endDate < to ? endDate : to;
        const d = diffDays(start, end) + 1;
        if (d > 0) row(c.itemId).unitDays += qty * d;
      };
      for (const ret of rets) {
        add(ret.qty, localDateOf(ret.at));
        remaining -= ret.qty;
        if (ret.condition === "rusak") row(c.itemId).damaged += ret.qty;
      }
      if (remaining > EPS) add(remaining, to);
      ids.add(c.itemId);
    }
    const ch = rentalCharges(r, to);
    const base = sum(r.lines.map((l) => l.qty * l.ratePerDay));
    for (const itemId of ids) {
      const x = row(itemId);
      x.rentals += 1;
      const share = base > 0 ? sum(r.lines.filter((l) => l.itemId === itemId).map((l) => l.qty * l.ratePerDay)) / base : 1 / ids.size;
      x.revenue += (ch.base + ch.lateFee) * share;
    }
  }
  for (const x of rows.values()) {
    x.utilization = x.owned > 0 ? Math.min(1, x.unitDays / (x.owned * windowDays)) : 0;
    x.revenue = roundMoney(x.revenue);
  }
  return [...rows.values()].sort((a, b) => b.utilization - a.utilization);
}
