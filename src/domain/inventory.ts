import { assert, createLot, EPS, getItem, getLot, nextCode, recordMove, roundQty, takeFromLot } from "./core";
import type { Db, Dimensions, DocRef, ID } from "./types";

export interface OpeningStockInput {
  itemId: ID;
  qty: number;
  unitCost: number;
  isRemnant?: boolean;
  dimensions?: Dimensions;
  location?: string;
  note?: string;
}

function adjustmentRef(db: Db): DocRef {
  const code = nextCode(db, "adjustment");
  return { type: "adjustment", id: code, code };
}

/** Records stock that already exists (initial balance / found stock). */
export function addOpeningStock(db: Db, input: OpeningStockInput) {
  const item = getItem(db, input.itemId);
  const ref = adjustmentRef(db);
  const lot = createLot(db, {
    itemId: item.id,
    qty: input.qty,
    unitCost: input.unitCost,
    origin: input.isRemnant ? "sisa_produksi" : "saldo_awal",
    originRef: ref,
    isRemnant: !!input.isRemnant,
    dimensions: input.dimensions,
    location: input.location || db.settings.defaultLocation,
    status: "tersedia",
    note: input.note,
  });
  recordMove(db, { lot, qty: lot.qty, type: "saldo_awal", ref, note: input.note });
  return lot;
}

/** Stock opname: sets a lot to the physically counted quantity. */
export function adjustLotQty(db: Db, lotId: ID, countedQty: number, note?: string) {
  const lot = getLot(db, lotId);
  assert(countedQty >= 0, "Qty hitung fisik tidak boleh negatif.");
  const diff = roundQty(countedQty - lot.qty);
  if (Math.abs(diff) < EPS) return lot;
  const ref = adjustmentRef(db);
  lot.qty = roundQty(countedQty);
  recordMove(db, { lot, qty: diff, type: "penyesuaian", ref, note: note || "Stok opname" });
  return lot;
}

/** Writes a remnant (or any available lot) off as waste. */
export function scrapLot(db: Db, lotId: ID, note?: string) {
  const lot = getLot(db, lotId);
  assert(lot.qty > EPS, "Lot sudah kosong.");
  const ref = adjustmentRef(db);
  return takeFromLot(db, lotId, lot.qty, "limbah", ref, {
    note: note || "Dibuang sebagai limbah",
    allowStatus: ["tersedia", "rusak"],
  });
}

export function updateLotInfo(
  db: Db,
  lotId: ID,
  patch: { location?: string; dimensions?: Dimensions | null; note?: string; reservedForWo?: ID | null },
) {
  const lot = getLot(db, lotId);
  if (patch.location !== undefined) lot.location = patch.location;
  if (patch.dimensions !== undefined) lot.dimensions = patch.dimensions ?? undefined;
  if (patch.note !== undefined) lot.note = patch.note;
  if (patch.reservedForWo !== undefined) lot.reservedForWo = patch.reservedForWo ?? undefined;
  return lot;
}

/** Re-labels a damaged unit as usable without a repair order (e.g. minor clean-up). */
export function markLotUsable(db: Db, lotId: ID, note?: string) {
  const lot = getLot(db, lotId);
  assert(lot.status === "rusak", "Hanya unit rusak yang bisa ditandai layak.");
  lot.status = "tersedia";
  recordMove(db, { lot, qty: 0, type: "penyesuaian", ref: adjustmentRef(db), note: note || "Ditandai layak pakai" });
  return lot;
}
