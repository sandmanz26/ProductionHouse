import { costingMethodOf, isAveragedLot, isOrderedLot, layerOrder } from "./costing-rules";
import type { CounterKey, Db, Dimensions, DocRef, ID, Item, Lot, MoveType, PartnerRole, StockMove } from "./types";

/** Raised for rule violations; the message is user-facing (Bahasa Indonesia). */
export class DomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DomainError";
  }
}

export function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new DomainError(message);
}

/** Tolerance for floating point quantity comparisons. */
export const EPS = 1e-6;

export const roundQty = (n: number) => Math.round(n * 10_000) / 10_000;
export const roundMoney = (n: number) => Math.round(n * 100) / 100;
export const sum = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0);

export function newId(): ID {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === "function") return c.randomUUID();
  // randomUUID is unavailable on insecure origins (e.g. a LAN IP over http).
  const bytes = new Uint8Array(16);
  if (c && typeof c.getRandomValues === "function") c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const nowIso = () => new Date().toISOString();

export const CODE_PREFIX: Record<CounterKey, string> = {
  lot: "LOT",
  purchase: "PB",
  workOrder: "PK",
  sale: "SO",
  rental: "SW",
  adjustment: "ADJ",
  item: "ITM",
  partner: "REL",
  recipe: "RSP",
};

export function nextCode(db: Db, key: CounterKey): string {
  const n = (db.counters[key] ?? 0) + 1;
  db.counters[key] = n;
  return `${CODE_PREFIX[key]}-${String(n).padStart(4, "0")}`;
}

/**
 * Runs a mutation against a deep copy of the database. If the mutation throws, the original
 * database is untouched, which makes every domain operation atomic.
 */
export function transact<R = void>(db: Db, fn: (draft: Db) => R): { db: Db; result: R } {
  const draft = structuredClone(db);
  const result = fn(draft);
  settleAverages(draft);
  return { db: draft, result };
}

export function getItem(db: Db, id: ID): Item {
  const item = db.items.find((i) => i.id === id);
  assert(item, "Item tidak ditemukan.");
  return item;
}

export function findItem(db: Db, id: ID | undefined): Item | undefined {
  return id ? db.items.find((i) => i.id === id) : undefined;
}

export function getLot(db: Db, id: ID): Lot {
  const lot = db.lots.find((l) => l.id === id);
  assert(lot, "Lot stok tidak ditemukan.");
  return lot;
}

export function createLot(db: Db, data: Omit<Lot, "id" | "code" | "createdAt"> & { createdAt?: string }): Lot {
  assert(Number.isFinite(data.qty) && data.qty > EPS, "Qty lot harus lebih dari 0.");
  assertAmount(data.unitCost, "Harga pokok");
  assertDimensions(data.dimensions);
  const lot: Lot = {
    ...data,
    id: newId(),
    code: nextCode(db, "lot"),
    qty: roundQty(data.qty),
    unitCost: roundMoney(data.unitCost),
    createdAt: data.createdAt ?? nowIso(),
  };
  db.lots.push(lot);
  return lot;
}

export function recordMove(
  db: Db,
  move: { lot: Lot; qty: number; type: MoveType; ref: DocRef; at?: string; note?: string; unitCost?: number },
): StockMove {
  const m: StockMove = {
    id: newId(),
    at: move.at ?? nowIso(),
    itemId: move.lot.itemId,
    lotId: move.lot.id,
    qty: roundQty(move.qty),
    unitCost: move.unitCost ?? move.lot.unitCost,
    type: move.type,
    ref: move.ref,
    note: move.note,
  };
  db.moves.push(m);
  return m;
}

/** Decreases a lot and records the movement. Never allows negative stock. */
export function takeFromLot(
  db: Db,
  lotId: ID,
  qty: number,
  type: MoveType,
  ref: DocRef,
  opts: { at?: string; note?: string; allowStatus?: Lot["status"][] } = {},
): Lot {
  const lot = getLot(db, lotId);
  const item = getItem(db, lot.itemId);
  assert(Number.isFinite(qty) && qty > EPS, "Qty harus lebih dari 0.");
  // Moving average: whatever physical lot is taken, it leaves at the item's current average.
  if (isAveragedLot(lot) && costingMethodOf(db, item) === "rata_rata") averageItemCost(db, item.id, opts.at);
  const allowed = opts.allowStatus ?? ["tersedia"];
  assert(allowed.includes(lot.status), `Lot ${lot.code} berstatus "${lot.status}" dan tidak dapat dipakai.`);
  assert(
    qty <= lot.qty + EPS,
    `Stok ${item.name} di ${lot.code} tidak cukup (tersedia ${roundQty(lot.qty)} ${item.uom}, diminta ${roundQty(qty)}).`,
  );
  lot.qty = roundQty(Math.max(0, lot.qty - qty));
  recordMove(db, { lot, qty: -qty, type, ref, at: opts.at, note: opts.note });
  return lot;
}

/**
 * Splits `qty` off a lot into a new lot carrying identical cost & attributes. Both sides are
 * recorded in the ledger so that the moves of every lot always sum to its quantity.
 * Returns the original lot when the whole quantity is requested.
 */
export function splitLot(db: Db, lotId: ID, qty: number, type: MoveType, ref: DocRef, at?: string): Lot {
  const lot = getLot(db, lotId);
  assert(qty > EPS && qty <= lot.qty + EPS, `Qty pemecahan lot ${lot.code} tidak valid.`);
  if (Math.abs(qty - lot.qty) < EPS) return lot;
  lot.qty = roundQty(lot.qty - qty);
  const { id: _id, code: _code, createdAt: _c, ...rest } = lot;
  const part = createLot(db, { ...rest, qty, createdAt: lot.createdAt, splitFrom: lot.id });
  recordMove(db, { lot, qty: -qty, type, ref, at, note: `Dipecah ke ${part.code}` });
  recordMove(db, { lot: part, qty, type, ref, at, note: `Dipecah dari ${lot.code}` });
  return part;
}

export const isActiveLot = (l: Lot) => l.qty > EPS;

export interface LotPick {
  lotId: ID;
  qty: number;
  unitCost: number;
  isRemnant: boolean;
  reserved: boolean;
}

export interface LotSuggestion {
  picks: LotPick[];
  shortage: number;
  /** Value saved by using remnants instead of buying at standard cost. */
  remnantQty: number;
}

/**
 * Suggests which lots to consume for a requirement:
 *  1. lots reserved for this work order (bought for it),
 *  2. remnant lots — smallest first so offcuts get used up,
 *  3. regular lots FIFO (oldest first).
 * Lots reserved for other work orders are skipped.
 */
export function suggestLots(
  db: Pick<Db, "lots" | "items" | "settings">,
  itemId: ID,
  qty: number,
  opts: { workOrderId?: ID; excludeLotIds?: ID[]; useRemnants?: boolean } = {},
): LotSuggestion {
  const useRemnants = opts.useRemnants ?? true;
  const candidates = db.lots.filter(
    (l) =>
      l.itemId === itemId &&
      l.status === "tersedia" &&
      isActiveLot(l) &&
      !opts.excludeLotIds?.includes(l.id) &&
      (!l.reservedForWo || l.reservedForWo === opts.workOrderId) &&
      (useRemnants || !l.isRemnant),
  );
  const rank = (l: Lot) => (l.reservedForWo && l.reservedForWo === opts.workOrderId ? 0 : l.isRemnant ? 1 : 2);
  const order = layerOrder(costingMethodOf(db, db.items.find((i) => i.id === itemId)));
  candidates.sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r !== 0) return r;
    if (a.isRemnant && b.isRemnant) return a.qty - b.qty;
    return order(a, b);
  });

  let remaining = qty;
  const picks: LotPick[] = [];
  let remnantQty = 0;
  for (const lot of candidates) {
    if (remaining <= EPS) break;
    const take = roundQty(Math.min(lot.qty, remaining));
    picks.push({
      lotId: lot.id,
      qty: take,
      unitCost: lot.unitCost,
      isRemnant: lot.isRemnant,
      reserved: lot.reservedForWo === opts.workOrderId && !!opts.workOrderId,
    });
    if (lot.isRemnant) remnantQty += take;
    remaining = roundQty(remaining - take);
  }
  return { picks, shortage: Math.max(0, roundQty(remaining)), remnantQty: roundQty(remnantQty) };
}

export interface StockSummary {
  itemId: ID;
  /** Available (status tersedia) — includes remnants and reserved. */
  available: number;
  remnant: number;
  reserved: number;
  rented: number;
  damaged: number;
  /** Everything owned, any status. */
  total: number;
  value: number;
  remnantValue: number;
  avgUnitCost: number;
  lotCount: number;
}

export function emptySummary(itemId: ID): StockSummary {
  return {
    itemId,
    available: 0,
    remnant: 0,
    reserved: 0,
    rented: 0,
    damaged: 0,
    total: 0,
    value: 0,
    remnantValue: 0,
    avgUnitCost: 0,
    lotCount: 0,
  };
}

export function stockSummaries(db: Pick<Db, "lots">): Map<ID, StockSummary> {
  const map = new Map<ID, StockSummary>();
  for (const lot of db.lots) {
    if (!isActiveLot(lot)) continue;
    let s = map.get(lot.itemId);
    if (!s) {
      s = emptySummary(lot.itemId);
      map.set(lot.itemId, s);
    }
    const value = lot.qty * lot.unitCost;
    s.total += lot.qty;
    s.value += value;
    s.lotCount += 1;
    if (lot.status === "tersedia") {
      s.available += lot.qty;
      if (lot.isRemnant) {
        s.remnant += lot.qty;
        s.remnantValue += value;
      }
      if (lot.reservedForWo) s.reserved += lot.qty;
    } else if (lot.status === "disewa") s.rented += lot.qty;
    else if (lot.status === "rusak") s.damaged += lot.qty;
  }
  for (const s of map.values()) {
    s.avgUnitCost = s.total > EPS ? s.value / s.total : 0;
    s.available = roundQty(s.available);
    s.remnant = roundQty(s.remnant);
    s.reserved = roundQty(s.reserved);
    s.rented = roundQty(s.rented);
    s.damaged = roundQty(s.damaged);
    s.total = roundQty(s.total);
  }
  return map;
}

export function stockOf(db: Pick<Db, "lots">, itemId: ID): StockSummary {
  return stockSummaries({ lots: db.lots.filter((l) => l.itemId === itemId) }).get(itemId) ?? emptySummary(itemId);
}

/** Available quantity that is free to use for a given work order (excludes others' reservations). */
export function freeQtyFor(db: Pick<Db, "lots">, itemId: ID, workOrderId?: ID): number {
  return roundQty(
    sum(
      db.lots
        .filter(
          (l) =>
            l.itemId === itemId &&
            l.status === "tersedia" &&
            isActiveLot(l) &&
            (!l.reservedForWo || l.reservedForWo === workOrderId),
        )
        .map((l) => l.qty),
    ),
  );
}

/** Finite and ≥ 0; NaN/Infinity never pass (they would poison every total downstream). */
export const isNonNegative = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0;

export function assertAmount(n: unknown, label: string): asserts n is number {
  assert(typeof n === "number" && Number.isFinite(n), `${label} harus berupa angka.`);
  assert(n >= 0, `${label} tidak boleh negatif.`);
}

/** Item that may be used in a new document line. Lines that already held it may keep it. */
export function getUsableItem(db: Db, id: ID, keepIds?: ReadonlySet<ID>): Item {
  const item = getItem(db, id);
  assert(!item.archived || keepIds?.has(id), `${item.name} sudah diarsipkan — pulihkan dulu di Master Barang.`);
  return item;
}

export function assertPartnerRole(db: Db, id: ID | undefined, role: PartnerRole) {
  if (!id) return;
  const p = db.partners.find((x) => x.id === id);
  assert(p, "Relasi tidak ditemukan.");
  assert(p.role === role, `${p.name} terdaftar sebagai ${role === "supplier" ? "pelanggan, bukan pemasok" : "pemasok, bukan pelanggan"}.`);
}

export function assertDimensions(d: Dimensions | undefined | null) {
  if (!d) return;
  const ok = [d.length, d.width, d.thickness ?? 0].every((n) => isNonNegative(n));
  assert(ok, "Ukuran (panjang/lebar/tebal) harus angka dan tidak boleh negatif.");
}

export function assertDate(date: string | undefined, label = "Tanggal"): asserts date is string {
  assert(typeof date === "string" && /^\d{4}-\d{2}-\d{2}/.test(date), `${label} wajib diisi.`);
}

export function assertLocation(db: Db, location: string) {
  assert(db.settings.locations.includes(location), `Lokasi "${location}" tidak dikenal — tambahkan dulu di Pengaturan.`);
}

/** Revaluation entries made by the cost formula itself carry this reference. */
export const AVERAGE_REF: DocRef = { type: "adjustment", id: "rata-rata", code: "Rata-rata" };

/**
 * Perpetual moving average: gives every interchangeable lot of an item the same unit cost
 * (total value ÷ total qty). Value is preserved; each changed lot gets a zero-qty revaluation.
 */
export function averageItemCost(db: Db, itemId: ID, at?: string): number | undefined {
  const pool = db.lots.filter((l) => l.itemId === itemId && isAveragedLot(l));
  const qty = sum(pool.map((l) => l.qty));
  if (qty <= EPS) return undefined;
  const avg = roundMoney(sum(pool.map((l) => l.qty * l.unitCost)) / qty);
  for (const lot of pool) {
    if (Math.abs(lot.unitCost - avg) < 0.005) continue;
    lot.unitCost = avg;
    recordMove(db, { lot, qty: 0, type: "revaluasi", ref: AVERAGE_REF, at, unitCost: avg, note: "Rata-rata bergerak" });
  }
  return avg;
}

/** Brings every moving-average item back to a single cost after a change (receipts, returns…). */
export function settleAverages(db: Db, at?: string) {
  for (const item of db.items) {
    if (costingMethodOf(db, item) === "rata_rata") averageItemCost(db, item.id, at);
  }
}

/**
 * Puts quantity back into an existing lot at the cost it left with. When the lot's cost moved in
 * the meantime (moving average, revaluation) the two are blended so no value is created or lost.
 */
export function returnToLot(
  db: Db,
  lot: Lot,
  qty: number,
  unitCost: number,
  move: { type: MoveType; ref: DocRef; at?: string; note?: string },
) {
  const before = lot.qty;
  if (before <= EPS) lot.unitCost = roundMoney(unitCost);
  else if (Math.abs(lot.unitCost - unitCost) >= 0.005) {
    lot.unitCost = roundMoney((before * lot.unitCost + qty * unitCost) / (before + qty));
  }
  lot.qty = roundQty(before + qty);
  recordMove(db, { lot, qty, unitCost, ...move });
  return lot;
}

/** Lot that must leave next under FIFO/LIFO, among the interchangeable lots on hand. */
export function nextLayer(db: Pick<Db, "lots" | "items" | "settings">, itemId: ID): Lot | undefined {
  const method = costingMethodOf(db, db.items.find((i) => i.id === itemId));
  return db.lots.filter((l) => l.itemId === itemId && isOrderedLot(l)).sort(layerOrder(method))[0];
}
