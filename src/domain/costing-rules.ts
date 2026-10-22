import type { CostingMethod, Db, Item, Lot } from "./types";

/** Pure rules shared by the lot engine (core.ts) and the costing module (costing.ts). */

export const COSTING_METHODS: CostingMethod[] = ["fifo", "rata_rata", "identifikasi", "lifo"];

export const isCostingMethod = (v: unknown): v is CostingMethod => COSTING_METHODS.includes(v as CostingMethod);

export function costingMethodOf(db: Pick<Db, "settings">, item: Pick<Item, "costingMethod"> | undefined): CostingMethod {
  return item?.costingMethod ?? db.settings.costingMethod ?? "fifo";
}

/**
 * Lots that are interchangeable with each other and therefore follow the cost formula.
 * Remnants (unique offcuts with their own size), stock bought for one work order and damaged
 * units are not interchangeable: PSAK 14 / IAS 2 require specific identification for them.
 */
const isInterchangeable = (l: Lot) => !l.isRemnant && !l.reservedForWo && l.qty > 1e-6;

/** Lots that compete for "which leaves first" under FIFO/LIFO: interchangeable and on hand. */
export const isOrderedLot = (l: Lot) => isInterchangeable(l) && l.status === "tersedia";

/** Lots that share one moving-average cost: interchangeable and still owned in good condition. */
export const isAveragedLot = (l: Lot) => isInterchangeable(l) && (l.status === "tersedia" || l.status === "disewa");

const byCode = (a: Lot, b: Lot) => a.code.localeCompare(b.code, undefined, { numeric: true });

/** Oldest receipt layer first; lots split off a layer keep its date, so they stay in place. */
export const oldestFirst = (a: Lot, b: Lot) => a.createdAt.localeCompare(b.createdAt) || byCode(a, b);

/** Order in which interchangeable lots should leave stock under a method. */
export function layerOrder(method: CostingMethod): (a: Lot, b: Lot) => number {
  return method === "lifo" ? (a, b) => -oldestFirst(a, b) : oldestFirst;
}

export const enforcesOrder = (method: CostingMethod) => method === "fifo" || method === "lifo";
