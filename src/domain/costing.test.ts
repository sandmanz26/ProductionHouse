/**
 * Cost formulas: FIFO, LIFO, moving average and specific identification, the exemptions PSAK 14
 * requires (remnants, project stock), the audit trail and the method comparison.
 *
 * Fixture: wood bought twice — LOT A 10 m³ @ 100 (January), LOT B 10 m³ @ 200 (February).
 * Issuing 15 m³ costs 2.000 under FIFO, 2.500 under LIFO and 2.250 under moving average.
 */
import { describe, expect, it } from "vitest";
import {
  addOpeningStock,
  cancelWorkOrder,
  compareCostingMethods,
  completeWorkOrder,
  confirmSalesOrder,
  createItem,
  createPartner,
  createPurchase,
  createSalesOrder,
  createWorkOrder,
  deliverSalesOrder,
  emptyDb,
  issueMaterials,
  nextLayer,
  parseBackup,
  receiveOutput,
  receivePurchase,
  salesTotals,
  serializeBackup,
  stockOf,
  suggestIssue,
  sum,
  transact,
  unissue,
  updateItem,
  updateSettings,
  type CostingMethod,
  type Db,
  type ID,
} from "./index";

function buy(db: Db, itemId: ID, qty: number, price: number, at: string) {
  const p = createPurchase(db, { date: at.slice(0, 10), lines: [{ itemId, qty, unitPrice: price }] });
  receivePurchase(db, p.id, { at });
  return db.lots.find((l) => l.id === p.lotIds![0])!;
}

function setup(method: CostingMethod) {
  const db = emptyDb();
  db.settings.laborRatePerHour = 0;
  db.settings.overheadPerLaborHour = 0;
  updateSettings(db, { costingMethod: method });
  const wood = createItem(db, { name: "Kayu", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 100 });
  const table = createItem(db, {
    name: "Meja",
    kind: "product",
    category: "meja",
    uom: "pcs",
    standardCost: 1_000,
    salePrice: 5_000,
    bom: [{ materialId: wood.id, qty: 1 }],
  });
  const a = buy(db, wood.id, 10, 100, "2026-01-05T08:00:00.000Z");
  const b = buy(db, wood.id, 10, 200, "2026-02-05T08:00:00.000Z");
  const wo = createWorkOrder(db, { type: "produksi", title: "Meja", plannedOutputs: [{ itemId: table.id, qty: 15 }], laborHours: 0 });
  return { db, wood, table, a, b, wo };
}

const value = (db: Db, itemId: ID) => sum(db.lots.filter((l) => l.itemId === itemId).map((l) => l.qty * l.unitCost));
const issuedValue = (db: Db, woId: ID) => sum(db.workOrders.find((w) => w.id === woId)!.issues.map((i) => i.qty * i.unitCost));

function rejects(db: Db, fn: (d: Db) => unknown, match: RegExp) {
  const before = JSON.stringify(db);
  expect(() => transact(db, fn)).toThrow(match);
  expect(JSON.stringify(db)).toBe(before);
}

describe("FIFO", () => {
  it("issues the oldest layer first and keeps the newest cost in stock", () => {
    const { db, wood, a, b, wo } = setup("fifo");
    const s = suggestIssue(db, wo, wood.id, 15);
    expect(s.picks.map((p) => p.lotId)).toEqual([a.id, b.id]);
    issueMaterials(db, wo.id, s.picks);
    expect(issuedValue(db, wo.id)).toBe(10 * 100 + 5 * 200);
    expect(value(db, wood.id)).toBe(5 * 200);
    expect(nextLayer(db, wood.id)?.id).toBe(b.id);
  });

  it("refuses a newer lot while an older one is on hand, wherever it is stored", () => {
    const { db, b, wo } = setup("fifo");
    rejects(db, (d) => issueMaterials(d, wo.id, [{ lotId: b.id, qty: 1 }]), /FIFO: use up LOT-0001 first/);
  });

  it("accepts a valid combination even when the newer lot is listed first", () => {
    const { db, wood, a, b, wo } = setup("fifo");
    issueMaterials(db, wo.id, [
      { lotId: b.id, qty: 2 },
      { lotId: a.id, qty: 10 },
    ]);
    expect(issuedValue(db, wo.id)).toBe(10 * 100 + 2 * 200);
    expect(stockOf(db, wood.id).total).toBe(8);
  });

  it("ships finished goods first-in, first-out and books COGS from those layers", () => {
    const db = emptyDb();
    const chair = createItem(db, { name: "Kursi", kind: "product", category: "kursi", uom: "pcs", standardCost: 1, salePrice: 1_000 });
    const buyer = createPartner(db, { role: "customer", name: "Toko" });
    const old = buy(db, chair.id, 3, 300, "2026-01-01T00:00:00.000Z");
    const recent = buy(db, chair.id, 3, 400, "2026-03-01T00:00:00.000Z");
    const so = createSalesOrder(db, { channel: "supply", customerId: buyer.id, date: "2026-04-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 4, unitPrice: 1_000 }] });
    confirmSalesOrder(db, so.id);
    rejects(db, (d) => deliverSalesOrder(d, so.id, [{ itemId: chair.id, qty: 1, picks: [{ lotId: recent.id, qty: 1 }] }]), /use up .* first/);
    deliverSalesOrder(db, so.id, [{ itemId: chair.id, qty: 4 }]);
    expect(salesTotals(db, so).cogs).toBe(3 * 300 + 1 * 400);
    expect(db.lots.find((l) => l.id === old.id)!.qty).toBe(0);
  });
});

describe("LIFO", () => {
  it("issues the newest layer first", () => {
    const { db, wood, a, b, wo } = setup("lifo");
    const s = suggestIssue(db, wo, wood.id, 15);
    expect(s.picks.map((p) => p.lotId)).toEqual([b.id, a.id]);
    issueMaterials(db, wo.id, s.picks);
    expect(issuedValue(db, wo.id)).toBe(10 * 200 + 5 * 100);
    expect(value(db, wood.id)).toBe(5 * 100);
    rejects(db, (d) => issueMaterials(d, wo.id, [{ lotId: "nope", qty: 1 }]), /not found/);
  });

  it("refuses the older lot while the newer one is on hand", () => {
    const { db, a, wo } = setup("lifo");
    rejects(db, (d) => issueMaterials(d, wo.id, [{ lotId: a.id, qty: 1 }]), /LIFO: use up LOT-0002 first/);
  });
});

describe("moving average", () => {
  it("charges the average whichever lot is physically taken", () => {
    const { db, wood, b, wo } = setup("rata_rata");
    // Both lots carry the average as soon as the second purchase lands.
    expect(transact(db, () => undefined).db.lots.map((l) => l.unitCost)).toEqual([150, 150]);
    issueMaterials(db, wo.id, [{ lotId: b.id, qty: 10 }, ...suggestIssue(db, wo, wood.id, 5).picks.filter((p) => p.lotId !== b.id)]);
    expect(issuedValue(db, wo.id)).toBe(15 * 150);
    expect(value(db, wood.id)).toBe(5 * 150);
  });

  it("re-averages after each receipt", () => {
    const { db, wood, wo } = setup("rata_rata");
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 15).picks);
    const { db: next } = transact(db, (d) => buy(d, wood.id, 5, 300, "2026-03-01T08:00:00.000Z"));
    // (5 × 150 + 5 × 300) / 10
    expect(new Set(next.lots.filter((l) => l.qty > 0).map((l) => l.unitCost))).toEqual(new Set([225]));
    expect(value(next, wood.id)).toBe(2_250);
  });

  it("returns material at the cost it left with, without creating or losing value", () => {
    const { db, wood, wo } = setup("rata_rata");
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 15).picks);
    const { db: d1 } = transact(db, (d) => buy(d, wood.id, 5, 300, "2026-03-01T08:00:00.000Z"));
    const before = value(d1, wood.id);
    const w = d1.workOrders.find((x) => x.id === wo.id)!;
    const { db: d2 } = transact(d1, (d) => unissue(d, wo.id, w.issues[0]!.id, 5));
    expect(value(d2, wood.id)).toBeCloseTo(before + 5 * 150, 0);
    expect(issuedValue(d2, wo.id)).toBe(10 * 150);
  });

  it("revalues partial output by the difference only, so the pool keeps its other value", () => {
    const run = (method: CostingMethod) => {
      const { db, wood, table, wo } = setup(method);
      addOpeningStock(db, { itemId: table.id, qty: 2, unitCost: 900 });
      issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 15).picks);
      receiveOutput(db, wo.id, { itemId: table.id, qty: 5 });
      const { db: done } = transact(db, (d) => completeWorkOrder(d, wo.id, { outputs: [{ itemId: table.id, qty: 10 }], returns: [] }));
      return value(done, table.id);
    };
    const fifoIssue = 10 * 100 + 5 * 200;
    const avgIssue = 15 * 150;
    // Opening stock + every table at its actual cost (issued material ÷ 15 tables).
    expect(run("fifo")).toBeCloseTo(2 * 900 + fifoIssue, 0);
    expect(run("rata_rata")).toBeCloseTo(2 * 900 + avgIssue, 0);
  });
});

describe("specific identification", () => {
  it("lets the user pick any lot at that lot's own cost", () => {
    const { db, b, wo } = setup("identifikasi");
    issueMaterials(db, wo.id, [{ lotId: b.id, qty: 10 }]);
    expect(issuedValue(db, wo.id)).toBe(2_000);
  });
});

describe("exemptions required by PSAK 14", () => {
  it("remnants and stock bought for this job can be used before older stock under FIFO", () => {
    const { db, wood, wo } = setup("fifo");
    const offcut = addOpeningStock(db, { itemId: wood.id, qty: 0.5, unitCost: 120, isRemnant: true });
    const p = createPurchase(db, { date: "2026-03-01", lines: [{ itemId: wood.id, qty: 2, unitPrice: 250 }], workOrderId: wo.id });
    receivePurchase(db, p.id, { at: "2026-03-01T08:00:00.000Z" });
    const reserved = db.lots.find((l) => l.reservedForWo === wo.id)!;
    issueMaterials(db, wo.id, [
      { lotId: offcut.id, qty: 0.5 },
      { lotId: reserved.id, qty: 2 },
    ]);
    expect(issuedValue(db, wo.id)).toBe(0.5 * 120 + 2 * 250);
    const s = suggestIssue(db, wo, wood.id, 1);
    expect(s.picks[0]!.lotId).toBe(db.lots[0]!.id);
  });

  it("cancelling a job puts material back into its own layer", () => {
    const { db, wood, a, wo } = setup("fifo");
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 12).picks);
    cancelWorkOrder(db, wo.id);
    expect(db.lots.find((l) => l.id === a.id)).toMatchObject({ qty: 10, unitCost: 100 });
    expect(value(db, wood.id)).toBe(3_000);
  });
});

describe("method settings and audit trail", () => {
  it("logs company and item changes, and averages immediately when switching to moving average", () => {
    const { db, wood } = setup("fifo");
    updateSettings(db, { costingMethod: "rata_rata" });
    expect(db.lots.map((l) => l.unitCost)).toEqual([150, 150]);
    expect(value(db, wood.id)).toBe(3_000);
    updateItem(db, wood.id, { ...wood, costingMethod: "lifo" });
    expect(db.settings.costingHistory.map(({ from, to, itemId }) => ({ from, to, itemId }))).toEqual([
      { from: "fifo", to: "rata_rata", itemId: undefined },
      { from: "rata_rata", to: "lifo", itemId: wood.id },
    ]);
    // Switching to the method already in use records nothing.
    updateSettings(db, { costingMethod: "rata_rata" });
    expect(db.settings.costingHistory).toHaveLength(2);
  });

  it("an item override wins over the company default", () => {
    const { db, wood, a, b, wo } = setup("fifo");
    updateItem(db, wood.id, { ...wood, costingMethod: "lifo" });
    expect(suggestIssue(db, wo, wood.id, 15).picks.map((p) => p.lotId)).toEqual([b.id, a.id]);
  });

  it("rejects unknown methods, from the screen or from a backup file", () => {
    const { db, wood } = setup("fifo");
    rejects(db, (d) => updateSettings(d, { costingMethod: "hifo" as CostingMethod }), /unknown/i);
    rejects(db, (d) => updateItem(d, wood.id, { ...wood, costingMethod: "hifo" as CostingMethod }), /unknown/i);
    const file = JSON.parse(serializeBackup(db));
    file.data.items[0].costingMethod = "hifo";
    expect(() => parseBackup(JSON.stringify(file))).toThrow(/damaged/);
  });
});

describe("method comparison", () => {
  it("replays the ledger under every formula", () => {
    const { db, wood, wo } = setup("fifo");
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 15).picks);
    const row = compareCostingMethods(db, { kind: "material" }).find((r) => r.itemId === wood.id)!;
    expect(row).toMatchObject({ inflowQty: 20, outflowQty: 15, endingQty: 5 });
    expect(row.fifo).toEqual({ outflow: 2_000, ending: 1_000 });
    expect(row.lifo).toEqual({ outflow: 2_500, ending: 500 });
    expect(row.rata_rata).toEqual({ outflow: 2_250, ending: 750 });
    // What the books show matches the method in use.
    expect(row.recorded).toEqual(row.fifo);
    // Every formula accounts for the same total cost.
    for (const m of [row.fifo, row.lifo, row.rata_rata]) expect(m.outflow + m.ending).toBe(3_000);
  });
});
