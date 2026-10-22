import { assert, averageItemCost, EPS, getItem, getLot, nowIso, roundMoney, roundQty, sum } from "./core";
import { costingMethodOf, enforcesOrder, isCostingMethod, isOrderedLot, layerOrder } from "./costing-rules";
import type { CostingMethod, Db, ID, ItemKind, MoveType } from "./types";

export { COSTING_METHODS, costingMethodOf, isCostingMethod, layerOrder } from "./costing-rules";

export const COSTING_LABEL: Record<CostingMethod, string> = {
  fifo: "FIFO",
  lifo: "LIFO",
  rata_rata: "Rata-rata bergerak",
  identifikasi: "Identifikasi khusus",
};

/** Where each formula may be used in Indonesia. */
export const COSTING_COMPLIANCE: Record<CostingMethod, { psak: boolean; tax: boolean }> = {
  fifo: { psak: true, tax: true },
  rata_rata: { psak: true, tax: true },
  identifikasi: { psak: true, tax: false },
  lifo: { psak: false, tax: false },
};

/**
 * Sorts picks so interchangeable lots are consumed in the method's order (a caller may list the
 * newer lot first). Specific lots (remnants, reserved, damaged) keep their position up front.
 */
export function orderPicks<P extends { lotId: ID }>(db: Db, picks: P[]): P[] {
  const lots = new Map(db.lots.map((l) => [l.id, l]));
  return [...picks].sort((a, b) => {
    const la = lots.get(a.lotId);
    const lb = lots.get(b.lotId);
    if (!la || !lb || la.itemId !== lb.itemId) return 0;
    const oa = isOrderedLot(la);
    const ob = isOrderedLot(lb);
    if (oa !== ob) return oa ? 1 : -1;
    return oa ? layerOrder(costingMethodOf(db, getItem(db, la.itemId)))(la, lb) : 0;
  });
}

/**
 * Under FIFO/LIFO an interchangeable lot may only be consumed when no lot ahead of it in the
 * method's order is still on hand. Call immediately before taking from the lot.
 */
export function assertCostOrder(db: Db, lotId: ID) {
  const lot = getLot(db, lotId);
  if (!isOrderedLot(lot)) return;
  const item = getItem(db, lot.itemId);
  const method = costingMethodOf(db, item);
  if (!enforcesOrder(method)) return;
  const first = db.lots.filter((l) => l.itemId === lot.itemId && isOrderedLot(l)).sort(layerOrder(method))[0];
  assert(
    !first || first.id === lot.id,
    `Metode ${COSTING_LABEL[method]}: habiskan dulu ${first?.code} (${first?.location}, sisa ${roundQty(first?.qty ?? 0)} ${item.uom}) sebelum mengambil ${lot.code}.`,
  );
}

/** Changes the company default or one item's override and keeps an audit trail. */
export function setCostingMethod(db: Db, method: CostingMethod | null, opts: { itemId?: ID; at?: string } = {}) {
  const at = opts.at ?? nowIso();
  if (opts.itemId) {
    const item = getItem(db, opts.itemId);
    assert(method === null || isCostingMethod(method), "Metode biaya tidak dikenal.");
    const from = costingMethodOf(db, item);
    item.costingMethod = method ?? undefined;
    const to = costingMethodOf(db, item);
    if (from !== to) {
      db.settings.costingHistory.push({ at, from, to, itemId: item.id });
      if (to === "rata_rata") averageItemCost(db, item.id, at);
    }
    return to;
  }
  assert(method && isCostingMethod(method), "Metode biaya tidak dikenal.");
  const from = db.settings.costingMethod;
  if (from === method) return method;
  db.settings.costingMethod = method;
  db.settings.costingHistory.push({ at, from, to: method });
  for (const item of db.items) {
    if (!item.costingMethod && method === "rata_rata") averageItemCost(db, item.id, at);
  }
  return method;
}

// ------------------------------------------------------------------ Method comparison

const INFLOW: MoveType[] = ["saldo_awal", "masuk_pembelian", "masuk_produksi", "masuk_sisa", "retur_penjualan", "kembali_produksi", "penyesuaian"];
const OUTFLOW: MoveType[] = ["keluar_produksi", "keluar_penjualan", "hilang", "limbah", "penyesuaian"];

export interface MethodResult {
  /** Cost of everything that left stock (issued to production, sold, lost, scrapped). */
  outflow: number;
  /** Value of what is left. */
  ending: number;
}

export interface MethodComparisonRow {
  itemId: ID;
  inflowQty: number;
  outflowQty: number;
  endingQty: number;
  recorded: MethodResult;
  fifo: MethodResult;
  lifo: MethodResult;
  rata_rata: MethodResult;
}

type Layer = { qty: number; cost: number };

/**
 * Replays an item's stock ledger under each formula. Inflows keep the cost they were recorded at
 * (purchases, opening stock, production output), so the effect on goods produced from the
 * material is not cascaded — this answers "how would material cost and stock value differ?".
 */
function replay(events: { qty: number; cost: number }[], method: "fifo" | "lifo" | "rata_rata"): MethodResult {
  const layers: Layer[] = [];
  let outflow = 0;
  for (const e of events) {
    if (e.qty > 0) {
      if (method === "rata_rata") {
        const qty = sum(layers.map((l) => l.qty));
        const value = sum(layers.map((l) => l.qty * l.cost)) + e.qty * e.cost;
        layers.splice(0, layers.length, { qty: qty + e.qty, cost: value / (qty + e.qty) });
      } else layers.push({ qty: e.qty, cost: e.cost });
      continue;
    }
    let need = -e.qty;
    while (need > EPS && layers.length) {
      const layer = method === "lifo" ? layers[layers.length - 1]! : layers[0]!;
      const take = Math.min(layer.qty, need);
      outflow += take * layer.cost;
      layer.qty -= take;
      need -= take;
      if (layer.qty > EPS) continue;
      if (method === "lifo") layers.pop();
      else layers.shift();
    }
    // Ledger inconsistencies (should not happen) are valued at the last known cost.
    if (need > EPS) outflow += need * (layers.at(-1)?.cost ?? e.cost);
  }
  return { outflow: roundMoney(outflow), ending: roundMoney(sum(layers.map((l) => l.qty * l.cost))) };
}

export function compareCostingMethods(db: Db, opts: { kind?: ItemKind } = {}): MethodComparisonRow[] {
  const rows: MethodComparisonRow[] = [];
  const indexed = db.moves.map((m, i) => ({ m, i }));
  indexed.sort((a, b) => a.m.at.localeCompare(b.m.at) || a.i - b.i);
  for (const item of db.items) {
    if (opts.kind && item.kind !== opts.kind) continue;
    const events: { qty: number; cost: number }[] = [];
    let recordedOut = 0;
    for (const { m } of indexed) {
      if (m.itemId !== item.id || Math.abs(m.qty) <= EPS) continue;
      const counted = m.qty > 0 ? INFLOW.includes(m.type) : OUTFLOW.includes(m.type);
      if (!counted) continue;
      events.push({ qty: m.qty, cost: m.unitCost });
      if (m.qty < 0) recordedOut += -m.qty * m.unitCost;
    }
    if (!events.length) continue;
    const lots = db.lots.filter((l) => l.itemId === item.id && l.qty > EPS);
    rows.push({
      itemId: item.id,
      inflowQty: roundQty(sum(events.filter((e) => e.qty > 0).map((e) => e.qty))),
      outflowQty: roundQty(-sum(events.filter((e) => e.qty < 0).map((e) => e.qty))),
      endingQty: roundQty(sum(lots.map((l) => l.qty))),
      recorded: { outflow: roundMoney(recordedOut), ending: roundMoney(sum(lots.map((l) => l.qty * l.unitCost))) },
      fifo: replay(events, "fifo"),
      lifo: replay(events, "lifo"),
      rata_rata: replay(events, "rata_rata"),
    });
  }
  return rows;
}
