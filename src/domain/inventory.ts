import { assert, assertAmount, assertDimensions, assertLocation, createLot, EPS, getItem, getLot, LOT_STATE, nextCode, recordMove, roundQty, splitLot, takeFromLot } from "./core";
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
  assertDimensions(input.dimensions);
  if (input.location) assertLocation(db, input.location);
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

/** Stock count: sets a lot to the physically counted quantity. */
export function adjustLotQty(db: Db, lotId: ID, countedQty: number, note?: string) {
  const lot = getLot(db, lotId);
  assertAmount(countedQty, "Counted qty");
  assert(lot.status !== "disewa", `Lot ${lot.code} is on rent — count it again after the unit comes back.`);
  const diff = roundQty(countedQty - lot.qty);
  if (Math.abs(diff) < EPS) return lot;
  const ref = adjustmentRef(db);
  lot.qty = roundQty(countedQty);
  recordMove(db, { lot, qty: diff, type: "penyesuaian", ref, note: note || "Stock count" });
  return lot;
}

/** Writes a remnant (or any available lot) off as waste. */
export function scrapLot(db: Db, lotId: ID, note?: string) {
  const lot = getLot(db, lotId);
  assert(lot.status !== "disewa", `Lot ${lot.code} is on rent and cannot be scrapped — take it back first.`);
  assert(lot.qty > EPS, "Lot is already empty.");
  const ref = adjustmentRef(db);
  return takeFromLot(db, lotId, lot.qty, "limbah", ref, {
    note: note || "Scrapped as waste",
    allowStatus: ["tersedia", "rusak"],
  });
}

export function updateLotInfo(
  db: Db,
  lotId: ID,
  patch: { location?: string; dimensions?: Dimensions | null; note?: string; reservedForWo?: ID | null },
) {
  const lot = getLot(db, lotId);
  if (patch.location !== undefined && patch.location !== lot.location) assertLocation(db, patch.location);
  assertDimensions(patch.dimensions);
  if (patch.reservedForWo) {
    const wo = db.workOrders.find((w) => w.id === patch.reservedForWo);
    assert(wo && (wo.status === "rencana" || wo.status === "berjalan"), "The work order to reserve for is not active — pick a planned or in-progress one.");
  }
  if (patch.location !== undefined) lot.location = patch.location;
  if (patch.dimensions !== undefined) lot.dimensions = patch.dimensions ?? undefined;
  if (patch.note !== undefined) lot.note = patch.note;
  if (patch.reservedForWo !== undefined) lot.reservedForWo = patch.reservedForWo ?? undefined;
  return lot;
}

/** Re-labels a damaged unit as usable without a repair order (e.g. minor clean-up). */
export function markLotUsable(db: Db, lotId: ID, note?: string) {
  const lot = getLot(db, lotId);
  assert(lot.status === "rusak", "Only damaged units can be marked usable.");
  lot.status = "tersedia";
  recordMove(db, { lot, qty: 0, type: "penyesuaian", ref: adjustmentRef(db), note: note || "Marked usable" });
  return lot;
}

/** Moves part (or all) of a lot to another location, keeping its cost. */
export function transferLot(db: Db, lotId: ID, qty: number, toLocation: string, note?: string) {
  const lot = getLot(db, lotId);
  assert(lot.status === "tersedia", `Lot ${lot.code} is ${LOT_STATE[lot.status]} and cannot be transferred.`);
  assert(toLocation.trim(), "Choose a destination location.");
  assert(toLocation !== lot.location, "Destination is the same as the current location — choose another.");
  assertLocation(db, toLocation);
  assert(Number.isFinite(qty) && qty > EPS && qty <= lot.qty + EPS, `Transfer qty is more than lot ${lot.code} holds.`);
  const ref = adjustmentRef(db);
  const moved = splitLot(db, lot.id, qty, "transfer", ref);
  moved.location = toLocation;
  recordMove(db, { lot: moved, qty: 0, type: "transfer", ref, note: note || `Transferred to ${toLocation}` });
  return moved;
}

/**
 * Merges several lots of the same item into one, e.g. offcuts of one size bundled together, or
 * stock tidied after transfers. Cost is the weighted average; the merged lot keeps the oldest
 * receipt date so it stays first in line under FIFO.
 */
export function mergeLots(db: Db, lotIds: ID[], opts: { location?: string; dimensions?: Dimensions; note?: string } = {}) {
  const ids = [...new Set(lotIds)];
  assert(ids.length >= 2, "Choose at least two lots to merge.");
  const lots = ids.map((id) => getLot(db, id));
  const first = lots[0]!;
  const item = getItem(db, first.itemId);
  for (const l of lots) {
    assert(l.itemId === first.itemId, "Only lots of the same item can be merged.");
    assert(l.status === "tersedia", `Lot ${l.code} is ${LOT_STATE[l.status]} and cannot be merged.`);
    assert(l.qty > EPS, `Lot ${l.code} is already empty.`);
    assert(l.isRemnant === first.isRemnant, "Offcuts cannot be merged with regular stock.");
    assert((l.reservedForWo ?? null) === (first.reservedForWo ?? null), "Lots reserved for different work orders cannot be merged.");
  }
  const location = opts.location || first.location;
  assertLocation(db, location);
  assertDimensions(opts.dimensions);
  const ref = adjustmentRef(db);
  const at = new Date().toISOString();
  const qty = roundQty(lots.reduce((a, l) => a + l.qty, 0));
  const value = lots.reduce((a, l) => a + l.qty * l.unitCost, 0);
  const oldest = lots.map((l) => l.createdAt).sort()[0]!;
  const codes = lots.map((l) => l.code).join(", ");
  for (const l of lots) {
    takeFromLot(db, l.id, l.qty, "gabung", ref, { at, note: "Merged", allowStatus: ["tersedia"] });
  }
  const merged = createLot(db, {
    itemId: item.id,
    qty,
    unitCost: value / qty,
    origin: "gabung",
    originRef: ref,
    isRemnant: first.isRemnant,
    reservedForWo: first.reservedForWo,
    dimensions: opts.dimensions,
    location,
    status: "tersedia",
    createdAt: oldest,
    mergedFrom: lots.map((l) => l.id),
    note: opts.note || `Merged from ${codes}`,
  });
  recordMove(db, { lot: merged, qty, type: "gabung", ref, at, note: `From ${codes}` });
  return merged;
}
