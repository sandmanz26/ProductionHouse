/**
 * Scenario tests derived from field research (docs/ROAST.md). Each `describe` block is one real
 * situation on a furniture shop floor; assertions check stock, cost (HPP), money and the ledger.
 */
import { describe, expect, it } from "vitest";
import {
  addLaborLog,
  addOpeningStock,
  addPayment,
  agingSummary,
  billedAmount,
  cancelSalesOrder,
  cancelWorkOrder,
  checkoutRental,
  completeWorkOrder,
  computeCost,
  confirmSalesOrder,
  createComponentOrders,
  createItem,
  createPurchase,
  createRental,
  createRepairOrder,
  createSalesOrder,
  createWorkOrder,
  createWorkOrdersForShortage,
  cubicMeters,
  currentStage,
  deliverSalesOrder,
  dpStatus,
  emptyDb,
  insights,
  issueMaterials,
  migrate,
  payables,
  productionShortages,
  receivables,
  receiveOutput,
  receivePurchase,
  refundsDue,
  removeLaborLog,
  removePayment,
  rentalCharges,
  rentalUtilization,
  requirements,
  returnRental,
  returnSale,
  salesTotals,
  setStageStatus,
  stageBoard,
  stageProgress,
  stockOf,
  suggestIssue,
  toStockPrice,
  toStockQty,
  transact,
  transferLot,
  type Db,
  type WorkOrder,
} from "./index";

// ------------------------------------------------------------------ helpers

function shop() {
  const db = emptyDb();
  db.settings.laborRatePerHour = 20_000;
  db.settings.overheadPerLaborHour = 0;
  db.settings.defaultStages = ["Potong", "Rakit", "Finishing", "QC"];
  const teak = createItem(db, { name: "Jati KD", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 15_000_000, trackRemnant: true });
  const wetTeak = createItem(db, { name: "Jati basah", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 11_000_000 });
  const screw = createItem(db, { name: "Sekrup", kind: "material", category: "hardware", uom: "pcs", standardCost: 200 });
  const fabric = createItem(db, {
    name: "Kain linen",
    kind: "material",
    category: "kain",
    uom: "m",
    standardCost: 90_000,
    purchaseUnit: { label: "roll", factor: 50 },
  });
  const frame = createItem(db, {
    name: "Rangka kursi",
    kind: "material",
    category: "kayu_solid",
    uom: "pcs",
    standardCost: 500_000,
    bom: [
      { materialId: teak.id, qty: 0.02 },
      { materialId: screw.id, qty: 10 },
    ],
    laborHours: 2,
  });
  const chair = createItem(db, {
    name: "Kursi",
    kind: "product",
    category: "kursi",
    uom: "pcs",
    standardCost: 900_000,
    salePrice: 2_000_000,
    rentalRatePerDay: 100_000,
    laborHours: 3,
    stages: ["Rakit", "Jok", "QC"],
    bom: [
      { materialId: frame.id, qty: 1 },
      { materialId: fabric.id, qty: 0.5 },
    ],
  });
  return { db, teak, wetTeak, screw, fabric, frame, chair };
}

function expectLedgerConsistent(db: Db) {
  for (const lot of db.lots) {
    const moved = db.moves.filter((m) => m.lotId === lot.id).reduce((a, m) => a + m.qty, 0);
    expect(Math.round(moved * 10_000) / 10_000, `ledger lot ${lot.code}`).toBeCloseTo(lot.qty, 4);
  }
}

function issueAll(db: Db, wo: WorkOrder) {
  for (const r of requirements(db, wo)) {
    if (r.remaining > 0) issueMaterials(db, wo.id, suggestIssue(db, wo, r.itemId, r.remaining).picks);
  }
}

/** Makes `n` chairs in stock at a known cost through a completed work order. */
function stockChairs(ctx: ReturnType<typeof shop>, n: number) {
  const { db, frame, fabric, chair } = ctx;
  addOpeningStock(db, { itemId: frame.id, qty: n, unitCost: 500_000 });
  addOpeningStock(db, { itemId: fabric.id, qty: n, unitCost: 90_000 });
  const wo = createWorkOrder(db, { type: "produksi", title: "Stok kursi", plannedOutputs: [{ itemId: chair.id, qty: n }], laborHours: 0 });
  issueAll(db, wo);
  completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: n }], returns: [] });
  return wo;
}

// ------------------------------------------------------------------ S1 multi-level BOM

describe("S1 · komponen setengah jadi (BOM bertingkat)", () => {
  it("accepts a material with a BOM as production output, rejects plain materials", () => {
    const { db, frame, screw } = shop();
    expect(() => createWorkOrder(db, { type: "produksi", title: "Rangka", plannedOutputs: [{ itemId: frame.id, qty: 4 }] })).not.toThrow();
    expect(() => createWorkOrder(db, { type: "produksi", title: "Sekrup", plannedOutputs: [{ itemId: screw.id, qty: 4 }] })).toThrow(/tidak bisa diproduksi/);
  });

  it("flags producible component shortages and creates child orders once", () => {
    const { db, chair, frame } = shop();
    const parent = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 4 }] });
    const reqFrame = requirements(db, parent).find((r) => r.itemId === frame.id)!;
    expect(reqFrame.producible).toBe(true);
    expect(reqFrame.shortage).toBe(4);
    const fabricReq = requirements(db, parent).find((r) => r.itemId !== frame.id)!;
    expect(fabricReq.producible).toBe(false);

    const [child] = createComponentOrders(db, parent.id);
    expect(child!.parentWoId).toBe(parent.id);
    expect(child!.plannedOutputs[0]).toMatchObject({ itemId: frame.id, qty: 4 });
    expect(requirements(db, parent).find((r) => r.itemId === frame.id)!.inComponentOrders).toBe(4);
    expect(() => createComponentOrders(db, parent.id)).toThrow(/Tidak ada komponen/);
    expect(insights(db).some((i) => i.id === `wo-comp-${parent.id}`)).toBe(false);
  });

  it("rolls the component's actual HPP into the parent product", () => {
    const { db, teak, screw, fabric, chair, frame } = shop();
    addOpeningStock(db, { itemId: teak.id, qty: 1, unitCost: 15_000_000 });
    addOpeningStock(db, { itemId: screw.id, qty: 100, unitCost: 200 });
    addOpeningStock(db, { itemId: fabric.id, qty: 10, unitCost: 90_000 });
    const parent = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 2 }], laborHours: 0 });
    const [child] = createComponentOrders(db, parent.id);
    issueAll(db, child!);
    completeWorkOrder(db, child!.id, { outputs: [{ itemId: frame.id, qty: 2 }], returns: [], laborHours: 4 });
    // frame HPP = (0.04 m3 × 15jt + 20 × 200 + 4 h × 20,000) / 2
    const frameUnit = (0.04 * 15_000_000 + 20 * 200 + 4 * 20_000) / 2;
    expect(child!.cost!.outputs[0]!.unitCost).toBe(frameUnit);
    issueAll(db, parent);
    expect(parent.issues.find((i) => i.itemId === frame.id)!.unitCost).toBe(frameUnit);
    completeWorkOrder(db, parent.id, { outputs: [{ itemId: chair.id, qty: 2 }], returns: [] });
    expect(parent.cost!.outputs[0]!.unitCost).toBe(frameUnit + 0.5 * 90_000);
    expectLedgerConsistent(db);
  });
});

// ------------------------------------------------------------------ S2 material processing

describe("S2 · olah bahan: kayu basah dikeringkan (KD) dan menyusut", () => {
  it("carries the full input cost into the smaller dried volume and reports yield", () => {
    const { db, teak, wetTeak } = shop();
    teak.bom = [{ materialId: wetTeak.id, qty: 1.1 }];
    addOpeningStock(db, { itemId: wetTeak.id, qty: 2.2, unitCost: 11_000_000 });
    const wo = createWorkOrder(db, { type: "produksi", title: "Kiln dry", plannedOutputs: [{ itemId: teak.id, qty: 2 }], laborHours: 0 });
    expect(wo.stages.map((s) => s.name)).toEqual(["Potong", "Rakit", "Finishing", "QC"]);
    issueAll(db, wo);
    completeWorkOrder(db, wo.id, {
      outputs: [{ itemId: teak.id, qty: 2 }],
      returns: [{ itemId: wetTeak.id, kind: "limbah", qty: 0.2, salvageValue: 0, note: "Susut pengeringan" }],
      extraCosts: [{ label: "Oven KD", amount: 1_000_000 }],
    });
    const c = wo.cost!;
    expect(c.total).toBeCloseTo(2.2 * 11_000_000 + 1_000_000, 2);
    expect(c.outputs[0]!.unitCost).toBeCloseTo((2.2 * 11_000_000 + 1_000_000) / 2, 2);
    expect(c.yieldRatio).toBeCloseTo(2 / 2.2, 4);
    expect(stockOf(db, teak.id).available).toBe(2);
  });
});

// ------------------------------------------------------------------ S3 stages

describe("S3 · tahapan produksi & papan WIP", () => {
  it("uses the product's route, tracks progress and closes all stages on completion", () => {
    const ctx = shop();
    const { db, chair } = ctx;
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 1 }] });
    expect(wo.stages.map((s) => s.name)).toEqual(["Rakit", "Jok", "QC"]);
    expect(stageBoard(db).find((c) => c.name === "Antre")!.workOrders).toHaveLength(1);

    setStageStatus(db, wo.id, wo.stages[0]!.id, "selesai");
    expect(wo.status).toBe("berjalan");
    expect(currentStage(wo)!.name).toBe("Jok");
    expect(stageProgress(wo)).toBeCloseTo(1 / 3);
    setStageStatus(db, wo.id, wo.stages[1]!.id, "proses");
    expect(stageProgress(wo)).toBeCloseTo(1.5 / 3);
    expect(stageBoard(db).find((c) => c.name === "Jok")!.workOrders[0]!.code).toBe(wo.code);
    setStageStatus(db, wo.id, wo.stages[1]!.id, "menunggu");
    expect(wo.stages[1]!.startedAt).toBeUndefined();

    const repair = createWorkOrder(db, {
      type: "perbaikan",
      title: "Perbaikan",
      plannedOutputs: [{ itemId: chair.id, qty: 1 }],
      plannedInputs: [{ itemId: chair.id, qty: 1 }],
    });
    expect(repair.stages.map((s) => s.name)).toEqual(["Perbaikan", "QC"]);
    const custom = createWorkOrder(db, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }], stages: ["A", " ", "B"] });
    expect(custom.stages.map((s) => s.name)).toEqual(["A", "B"]);
  });
});

// ------------------------------------------------------------------ S4 labour

describe("S4 · tenaga kerja harian & borongan per unit", () => {
  it("prices labour from logs (hours × rate + pieces × piece rate) instead of the plan", () => {
    const ctx = shop();
    const { db, chair, frame, fabric } = ctx;
    addOpeningStock(db, { itemId: frame.id, qty: 10, unitCost: 500_000 });
    addOpeningStock(db, { itemId: fabric.id, qty: 10, unitCost: 90_000 });
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 10 }] });
    expect(wo.laborHours).toBe(30);
    const rakit = wo.stages[0]!;
    const log = addLaborLog(db, wo.id, { stageId: rakit.id, worker: "Tim A", hours: 12, rate: 25_000 });
    addLaborLog(db, wo.id, { stageId: wo.stages[1]!.id, worker: "Mas Joko", pieces: 10, pieceRate: 40_000 });
    expect(rakit.status).toBe("proses");
    issueAll(db, wo);
    const preview = computeCost(db, wo, { outputs: [{ itemId: chair.id, qty: 10 }], returns: [] });
    expect(preview.laborFromLogs).toBe(true);
    expect(preview.labor).toBe(12 * 25_000 + 10 * 40_000);
    removeLaborLog(db, wo.id, log.id);
    expect(computeCost(db, wo, { outputs: [{ itemId: chair.id, qty: 10 }], returns: [] }).labor).toBe(400_000);
  });

  it("validates labour entries", () => {
    const { db, chair } = shop();
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 1 }] });
    expect(() => addLaborLog(db, wo.id, { worker: " ", hours: 1 })).toThrow(/nama pekerja/);
    expect(() => addLaborLog(db, wo.id, { worker: "A" })).toThrow(/jam kerja atau jumlah unit/);
    expect(() => addLaborLog(db, wo.id, { worker: "A", pieces: 3 })).toThrow(/tarif borongan/);
    expect(() => addLaborLog(db, wo.id, { worker: "A", hours: -1 })).toThrow(/negatif/);
    expect(() => addLaborLog(db, wo.id, { worker: "A", hours: 1, stageId: "nope" })).toThrow(/Tahap/);
  });
});

// ------------------------------------------------------------------ S5 partial output

describe("S5 · hasil bertahap: kirim sebagian sebelum pekerjaan selesai", () => {
  function partialSetup() {
    const ctx = shop();
    const { db, chair, frame, fabric } = ctx;
    addOpeningStock(db, { itemId: frame.id, qty: 24, unitCost: 500_000 });
    addOpeningStock(db, { itemId: fabric.id, qty: 12, unitCost: 90_000 });
    const wo = createWorkOrder(db, { type: "produksi", title: "24 kursi", plannedOutputs: [{ itemId: chair.id, qty: 24 }], laborHours: 0 });
    issueAll(db, wo);
    return { ...ctx, wo };
  }

  it("receives part at provisional cost, revalues stock and books variance on units sold", () => {
    const { db, chair, wo } = partialSetup();
    const rec = receiveOutput(db, wo.id, { itemId: chair.id, qty: 12 });
    expect(rec.provisionalUnitCost).toBe(900_000);
    expect(stockOf(db, chair.id).available).toBe(12);

    const so = createSalesOrder(db, { channel: "supply", date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 8, unitPrice: 2_000_000 }] });
    confirmSalesOrder(db, so.id);
    deliverSalesOrder(db, so.id, [{ itemId: chair.id, qty: 8 }]);
    expect(salesTotals(db, so).cogs).toBe(8 * 900_000);

    expect(() => transact(db, (d) => cancelWorkOrder(d, wo.id))).toThrow(/hasil yang diterima/);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: 12 }], returns: [] });
    const actual = 500_000 + 0.5 * 90_000; // 545,000
    expect(wo.cost!.outputs).toHaveLength(1);
    expect(wo.cost!.outputs[0]!.qty).toBe(24);
    expect(wo.cost!.outputs[0]!.unitCost).toBe(actual);
    expect(wo.cost!.revalued).toBe(4 * (actual - 900_000));
    expect(wo.cost!.variance).toBe(8 * (actual - 900_000));
    const receiptLot = db.lots.find((l) => l.id === rec.lotId)!;
    expect(receiptLot.unitCost).toBe(actual);
    expect(db.moves.some((m) => m.type === "revaluasi" && m.lotId === rec.lotId)).toBe(true);
    expect(stockOf(db, chair.id).available).toBe(16);
    expect(stockOf(db, chair.id).value).toBeCloseTo(16 * actual, 2);
    expectLedgerConsistent(db);
  });

  it("can close with everything received earlier, and guards invalid receipts", () => {
    const { db, chair, frame, wo } = partialSetup();
    receiveOutput(db, wo.id, { itemId: chair.id, qty: 24 });
    expect(() => receiveOutput(db, wo.id, { itemId: frame.id, qty: 1 })).toThrow(/bukan hasil yang direncanakan/);
    expect(() => receiveOutput(db, wo.id, { itemId: chair.id, qty: 0 })).toThrow(/lebih dari 0/);
    expect(() => computeCost(db, wo, { outputs: [{ itemId: chair.id, qty: 1, sharePct: 100 }], returns: [] })).toThrow(/Porsi biaya manual/);
    completeWorkOrder(db, wo.id, { outputs: [], returns: [] });
    expect(wo.status).toBe("selesai");
    expect(wo.cost!.variance).toBe(0);
    expect(stockOf(db, chair.id).value).toBeCloseTo(24 * 545_000, 2);
  });

  it("revalues units even after they were split out for a rental", () => {
    const { db, chair, wo } = partialSetup();
    receiveOutput(db, wo.id, { itemId: chair.id, qty: 6 });
    const r = createRental(db, { kind: "sewa", project: "Event", startDate: "2026-10-01", endDate: "2026-10-02", lines: [{ itemId: chair.id, qty: 2, ratePerDay: 100_000 }] });
    checkoutRental(db, r.id);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: 18 }], returns: [] });
    const rented = db.lots.filter((l) => l.status === "disewa");
    expect(rented[0]!.unitCost).toBe(545_000);
    expect(wo.cost!.variance).toBe(0);
    expectLedgerConsistent(db);
  });
});

// ------------------------------------------------------------------ S6 QC reject

describe("S6 · QC reject & rework", () => {
  it("puts rejected units into damaged stock, counts them, and allows a repair order", () => {
    const ctx = shop();
    const { db, chair, frame, fabric } = ctx;
    addOpeningStock(db, { itemId: frame.id, qty: 5, unitCost: 500_000 });
    addOpeningStock(db, { itemId: fabric.id, qty: 5, unitCost: 90_000 });
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 5 }], laborHours: 0 });
    issueAll(db, wo);
    completeWorkOrder(db, wo.id, {
      outputs: [
        { itemId: chair.id, qty: 4 },
        { itemId: chair.id, qty: 1, grade: "reject" },
      ],
      returns: [],
    });
    expect(wo.cost!.rejectQty).toBe(1);
    expect(stockOf(db, chair.id).available).toBe(4);
    expect(stockOf(db, chair.id).damaged).toBe(1);
    const reject = db.lots.find((l) => l.status === "rusak")!;
    expect(reject.unitCost).toBe(545_000);
    const repair = createRepairOrder(db, reject.id);
    issueMaterials(db, repair.id, suggestIssue(db, repair, chair.id, 1).picks);
    addLaborLog(db, repair.id, { worker: "Finishing ulang", hours: 2 });
    completeWorkOrder(db, repair.id, { outputs: [{ itemId: chair.id, qty: 1 }], returns: [] });
    expect(repair.cost!.outputs[0]!.unitCost).toBe(545_000 + 40_000);
    expect(stockOf(db, chair.id).damaged).toBe(0);
  });
});

// ------------------------------------------------------------------ S7 purchasing units

describe("S7 · kubikasi kayu & satuan beli", () => {
  it("computes timber volume from piece size", () => {
    expect(cubicMeters(10, 5, 20, 3)).toBe(0.3);
    expect(cubicMeters(1, 2.5, 15, 2)).toBe(0.0075);
    expect(cubicMeters(0, 5, 20, 3)).toBe(0);
    expect(cubicMeters(3, -1, 20, 3)).toBe(0);
  });

  it("converts purchase units to stock units", () => {
    const { db, fabric, screw } = shop();
    expect(toStockQty(fabric, 2)).toBe(100);
    expect(toStockPrice(fabric, 4_500_000)).toBe(90_000);
    expect(toStockQty(screw, 7)).toBe(7);
    const p = createPurchase(db, { date: "2026-10-01", lines: [{ itemId: fabric.id, qty: toStockQty(fabric, 2), unitPrice: toStockPrice(fabric, 4_500_000) }] });
    receivePurchase(db, p.id);
    expect(stockOf(db, fabric.id).available).toBe(100);
    expect(stockOf(db, fabric.id).value).toBe(9_000_000);
  });
});

// ------------------------------------------------------------------ S8 money

describe("S8 · DP, pelunasan, piutang & utang", () => {
  function orderOf(ctx: ReturnType<typeof shop>, qty: number, dpPercent?: number) {
    const so = createSalesOrder(ctx.db, {
      channel: "ekspor",
      date: "2026-09-01",
      currency: "USD",
      exchangeRate: 16_000,
      dpPercent,
      paymentDueDate: "2026-09-30",
      lines: [{ itemId: ctx.chair.id, qty, unitPrice: 150 }],
      export: { incoterm: "FOB", portOfLoading: "Semarang", portOfDischarge: "Hamburg", destinationCountry: "Jerman", containerType: "20GP" },
    });
    confirmSalesOrder(ctx.db, so.id);
    return so;
  }

  it("tracks a 30% down payment and blocks overpayment", () => {
    const ctx = shop();
    const so = orderOf(ctx, 10, 30);
    expect(dpStatus(ctx.db, so)).toMatchObject({ required: 450, received: 0, met: false });
    expect(insights(ctx.db, "2026-09-02").some((i) => i.id === `dp-${so.id}`)).toBe(true);
    addPayment(ctx.db, "sale", so.id, { date: "2026-09-02", amount: 450 });
    expect(dpStatus(ctx.db, so).met).toBe(true);
    expect(() => transact(ctx.db, (d) => addPayment(d, "sale", so.id, { date: "2026-09-03", amount: 1_051 }))).toThrow(/melebihi sisa/);
    expect(() => transact(ctx.db, (d) => addPayment(d, "sale", so.id, { date: "2026-09-03", amount: -451 }))).toThrow(/Refund/);
    expect(() => transact(ctx.db, (d) => cancelSalesOrder(d, so.id))).toThrow(/pembayaran/);
    expect(billedAmount(ctx.db, "sale", so.id).balance).toBe(1_050);
  });

  it("ages receivables once goods are delivered and unpaid", () => {
    const ctx = shop();
    stockChairs(ctx, 10);
    const so = orderOf(ctx, 10);
    deliverSalesOrder(ctx.db, so.id, [{ itemId: ctx.chair.id, qty: 10 }]);
    addPayment(ctx.db, "sale", so.id, { date: "2026-09-10", amount: 500 });
    const ar = receivables(ctx.db, "2026-10-20");
    expect(ar).toHaveLength(1);
    expect(ar[0]).toMatchObject({ balance: 1_000, balanceIdr: 16_000_000, overdueDays: 20, delivered: true });
    const aging = agingSummary(ar);
    expect(aging.find((b) => b.key === "1-30")!.amount).toBe(16_000_000);
    expect(insights(ctx.db, "2026-10-20").some((i) => i.id === "ar-overdue")).toBe(true);
    const pay = addPayment(ctx.db, "sale", so.id, { date: "2026-10-20", amount: 1_000 });
    expect(receivables(ctx.db, "2026-10-20")).toHaveLength(0);
    removePayment(ctx.db, "sale", so.id, pay.id);
    expect(receivables(ctx.db, "2026-10-20")).toHaveLength(1);
  });

  it("tracks supplier payables with tempo", () => {
    const { db, fabric } = shop();
    const p = createPurchase(db, { date: "2026-10-01", dueDate: "2026-10-31", lines: [{ itemId: fabric.id, qty: 10, unitPrice: 90_000 }] });
    expect(payables(db, "2026-10-20")).toHaveLength(0); // not received yet
    receivePurchase(db, p.id);
    expect(payables(db, "2026-10-20")[0]).toMatchObject({ balance: 900_000, overdueDays: -11 });
    expect(insights(db, "2026-10-29").some((i) => i.id === "ap-due")).toBe(true);
    addPayment(db, "purchase", p.id, { date: "2026-10-25", amount: 900_000 });
    expect(payables(db, "2026-10-29")).toHaveLength(0);
  });

  it("settles rental deposits: balance due, or deposit refund", () => {
    const ctx = shop();
    stockChairs(ctx, 4);
    const { db, chair } = ctx;
    const r = createRental(db, {
      kind: "sewa",
      project: "Wedding",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      lines: [{ itemId: chair.id, qty: 2, ratePerDay: 100_000 }],
      deposit: 1_000_000,
      extraCharges: [{ label: "Antar", amount: 150_000 }],
    });
    checkoutRental(db, r.id, undefined, "2026-10-01T08:00:00.000Z");
    returnRental(db, r.id, [{ checkoutId: r.checkouts[0]!.id, qty: 2, condition: "baik" }], "2026-10-02T18:00:00.000Z");
    const ch = rentalCharges(r, "2026-10-05");
    expect(ch.extra).toBe(150_000);
    expect(ch.total).toBe(400_000 + 150_000);
    expect(ch.balance).toBe(550_000 - 1_000_000);
    expect(refundsDue(db)).toHaveLength(1);
    expect(() => transact(db, (d) => addPayment(d, "rental", r.id, { date: "2026-10-05", amount: -500_000 }))).toThrow(/Refund/);
    addPayment(db, "rental", r.id, { date: "2026-10-05", amount: -450_000, method: "transfer", note: "Kembali deposit" });
    expect(billedAmount(db, "rental", r.id).balance).toBe(0);
    expect(refundsDue(db)).toHaveLength(0);
  });
});

// ------------------------------------------------------------------ S9–S10 sales

describe("S9–S10 · pesanan custom & jual material", () => {
  it("carries custom specs into the production order", () => {
    const ctx = shop();
    const so = createSalesOrder(ctx.db, {
      channel: "supply",
      date: "2026-10-01",
      currency: "IDR",
      exchangeRate: 1,
      lines: [{ itemId: ctx.chair.id, qty: 2, unitPrice: 2_000_000, spec: "Tinggi dudukan 48 cm, finishing walnut" }],
    });
    confirmSalesOrder(ctx.db, so.id);
    const [wo] = createWorkOrdersForShortage(ctx.db, so.id);
    expect(wo!.note).toContain("finishing walnut");
  });

  it("sells a remnant (material) and never plans production for plain materials", () => {
    const ctx = shop();
    const { db, teak } = ctx;
    const remnant = addOpeningStock(db, { itemId: teak.id, qty: 0.05, unitCost: 15_000_000, isRemnant: true });
    const so = createSalesOrder(db, { channel: "supply", date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: teak.id, qty: 0.05, unitPrice: 12_000_000 }] });
    confirmSalesOrder(db, so.id);
    expect(productionShortages(db, so)).toHaveLength(0);
    deliverSalesOrder(db, so.id, [{ itemId: teak.id, qty: 0.05, picks: [{ lotId: remnant.id, qty: 0.05 }] }]);
    const t = salesTotals(db, so);
    expect(t.cogs).toBe(750_000);
    expect(t.margin).toBe(600_000 - 750_000);
  });
});

// ------------------------------------------------------------------ S11 returns

describe("S11 · retur penjualan", () => {
  it("returns good and defective units at delivery cost and credits the customer", () => {
    const ctx = shop();
    stockChairs(ctx, 5);
    const { db, chair } = ctx;
    const so = createSalesOrder(db, { channel: "supply", date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 5, unitPrice: 2_000_000 }] });
    confirmSalesOrder(db, so.id);
    deliverSalesOrder(db, so.id, [{ itemId: chair.id, qty: 5 }]);
    returnSale(db, so.id, [
      { itemId: chair.id, qty: 1, condition: "baik" },
      { itemId: chair.id, qty: 2, condition: "rusak", note: "Finishing mengelupas" },
    ]);
    expect(stockOf(db, chair.id).available).toBe(1);
    expect(stockOf(db, chair.id).damaged).toBe(2);
    const t = salesTotals(db, so);
    expect(t.returnCredit).toBe(6_000_000);
    expect(t.total).toBe(4_000_000);
    expect(t.cogs).toBe(2 * 545_000);
    expect(billedAmount(db, "sale", so.id).balance).toBe(4_000_000);
    expect(() => transact(db, (d) => returnSale(d, so.id, [{ itemId: chair.id, qty: 3, condition: "baik" }]))).toThrow(/melebihi/);
    expectLedgerConsistent(db);
  });

  it("refuses returns before delivery", () => {
    const ctx = shop();
    const so = createSalesOrder(ctx.db, { channel: "supply", date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: ctx.chair.id, qty: 1, unitPrice: 1 }] });
    expect(() => returnSale(ctx.db, so.id, [{ itemId: ctx.chair.id, qty: 1, condition: "baik" }])).toThrow(/Belum ada barang/);
  });
});

// ------------------------------------------------------------------ S12 transfer

describe("S12 · transfer antar lokasi", () => {
  it("splits a lot to another location keeping its cost", () => {
    const { db, fabric } = shop();
    const lot = addOpeningStock(db, { itemId: fabric.id, qty: 50, unitCost: 90_000, location: "Gudang Utama" });
    const moved = transferLot(db, lot.id, 20, "Workshop");
    expect(moved.location).toBe("Workshop");
    expect(moved.qty).toBe(20);
    expect(moved.unitCost).toBe(90_000);
    expect(lot.qty).toBe(30);
    expect(stockOf(db, fabric.id).available).toBe(50);
    expect(() => transferLot(db, lot.id, 1, "Gudang Utama")).toThrow(/sama/);
    expect(() => transferLot(db, lot.id, 31, "Showroom")).toThrow(/melebihi/);
    const all = transferLot(db, lot.id, 30, "Showroom");
    expect(all.id).toBe(lot.id);
    expect(all.location).toBe("Showroom");
    expectLedgerConsistent(db);
  });

  it("refuses to move rented units", () => {
    const ctx = shop();
    stockChairs(ctx, 2);
    const r = createRental(ctx.db, { kind: "pinjam", project: "Foto", startDate: "2026-10-01", endDate: "2026-10-01", lines: [{ itemId: ctx.chair.id, qty: 2, ratePerDay: 0 }] });
    checkoutRental(ctx.db, r.id);
    const rented = ctx.db.lots.find((l) => l.status === "disewa")!;
    expect(() => transferLot(ctx.db, rented.id, 1, "Showroom")).toThrow(/berstatus disewa/);
  });
});

// ------------------------------------------------------------------ S13 rental utilisation

describe("S13 · utilisasi unit sewa", () => {
  it("measures unit-days out against units owned", () => {
    const ctx = shop();
    stockChairs(ctx, 4);
    const { db, chair } = ctx;
    const r = createRental(db, { kind: "sewa", project: "Expo", startDate: "2026-10-01", endDate: "2026-10-05", lines: [{ itemId: chair.id, qty: 2, ratePerDay: 100_000 }] });
    checkoutRental(db, r.id, undefined, "2026-10-01T08:00:00");
    returnRental(db, r.id, [{ checkoutId: r.checkouts[0]!.id, qty: 2, condition: "baik" }], "2026-10-05T17:00:00");
    const [row] = rentalUtilization(db, "2026-10-01", "2026-10-10");
    expect(row!.unitDays).toBe(10);
    expect(row!.owned).toBe(4);
    expect(row!.utilization).toBeCloseTo(10 / 40);
    expect(row!.rentals).toBe(1);
    expect(row!.revenue).toBe(1_000_000);
  });
});

// ------------------------------------------------------------------ S14 migration

describe("S14 · data lama (skema v1) tetap terbaca", () => {
  it("fills new fields when loading v1 data", () => {
    const v1 = {
      schemaVersion: 1,
      settings: { companyName: "Lama" },
      workOrders: [{ id: "w", code: "PK-0001", type: "produksi", status: "rencana", plannedOutputs: [], plannedInputs: [], issues: [], returns: [], outputs: [], extraCosts: [] }],
      sales: [{ id: "s", code: "SO-0001", lines: [], deliveries: [] }],
      purchases: [{ id: "p", code: "PB-0001", lines: [], extraCosts: [] }],
      rentals: [{ id: "r", code: "SW-0001", lines: [], checkouts: [], returns: [] }],
    };
    const db = migrate(v1);
    expect(db.schemaVersion).toBe(2);
    expect(db.workOrders[0]).toMatchObject({ stages: [], laborLogs: [], receipts: [] });
    expect(db.sales[0]).toMatchObject({ payments: [], returns: [] });
    expect(db.purchases[0]).toMatchObject({ payments: [] });
    expect(db.rentals[0]).toMatchObject({ payments: [], extraCharges: [] });
    expect(db.settings.defaultStages.length).toBeGreaterThan(0);
    expect(db.settings.companyName).toBe("Lama");
  });
});

// ------------------------------------------------------------------ atomicity across new operations

describe("atomicity", () => {
  it("leaves the database untouched when any new operation fails", () => {
    const ctx = shop();
    stockChairs(ctx, 2);
    const before = JSON.stringify(ctx.db);
    const wo = ctx.db.workOrders[0]!;
    const attempts: ((d: Db) => unknown)[] = [
      (d) => addLaborLog(d, wo.id, { worker: "A", hours: 1 }), // closed order
      (d) => receiveOutput(d, wo.id, { itemId: ctx.chair.id, qty: 1 }),
      (d) => transferLot(d, d.lots[0]!.id, 999, "Workshop"),
      (d) => addPayment(d, "purchase", "missing", { date: "2026-10-01", amount: 1 }),
      (d) => returnSale(d, "missing", []),
    ];
    for (const fn of attempts) expect(() => transact(ctx.db, fn)).toThrow();
    expect(JSON.stringify(ctx.db)).toBe(before);
  });
});

describe("guards on money & documents", () => {
  it("blocks payments on cancelled documents and cancelling paid ones", () => {
    const ctx = shop();
    const { db, fabric, chair } = ctx;
    const p = createPurchase(db, { date: "2026-10-01", lines: [{ itemId: fabric.id, qty: 1, unitPrice: 100 }] });
    addPayment(db, "purchase", p.id, { date: "2026-10-01", amount: 50 });
    expect(() => transact(db, (d) => {
      d.purchases.find((x) => x.id === p.id)!.payments = [];
      d.purchases.find((x) => x.id === p.id)!.status = "batal";
      return addPayment(d, "purchase", p.id, { date: "2026-10-02", amount: 10 });
    })).toThrow(/dibatalkan/);
    const r = createRental(db, { kind: "sewa", project: "x", startDate: "2026-10-01", endDate: "2026-10-01", lines: [{ itemId: chair.id, qty: 1, ratePerDay: 100 }] });
    addPayment(db, "rental", r.id, { date: "2026-10-01", amount: 100 });
    expect(() => transact(db, (d) => addPayment(d, "rental", r.id, { date: "2026-10-01", amount: 1 }))).toThrow(/melebihi/);
    expect(() => addPayment(db, "rental", r.id, { date: "2026-10-01", amount: 0 })).toThrow(/tidak boleh 0/);
    expect(() => addPayment(db, "rental", r.id, { date: "", amount: 1 })).toThrow(/Tanggal/);
  });

  it("rejects invalid sales terms", () => {
    const { db, chair } = shop();
    const base = { channel: "supply" as const, date: "2026-10-01", currency: "IDR" as const, exchangeRate: 1, lines: [{ itemId: chair.id, qty: 1, unitPrice: 100 }] };
    expect(() => createSalesOrder(db, { ...base, dpPercent: 120 })).toThrow(/DP/);
    expect(() => createSalesOrder(db, { ...base, discount: 500 })).toThrow(/Diskon melebihi/);
    expect(() => createSalesOrder(db, { ...base, currency: "USD", exchangeRate: 0 })).toThrow(/Kurs/);
  });

  it("refuses to use a work order's own partial output as its input", () => {
    const ctx = shop();
    const { db, chair, frame, fabric } = ctx;
    addOpeningStock(db, { itemId: frame.id, qty: 2, unitCost: 500_000 });
    addOpeningStock(db, { itemId: fabric.id, qty: 2, unitCost: 90_000 });
    const wo = createWorkOrder(db, { type: "konversi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 2 }], plannedInputs: [{ itemId: frame.id, qty: 2 }] });
    issueAll(db, wo);
    const rec = receiveOutput(db, wo.id, { itemId: chair.id, qty: 1 });
    expect(() => issueMaterials(db, wo.id, [{ lotId: rec.lotId, qty: 1 }])).toThrow(/bahannya sendiri/);
  });
});

describe("planning & closing rules", () => {
  it("never suggests buying an in-house component, and does not count undelivered, not-yet-due orders as receivables", () => {
    const ctx = shop();
    const { db, chair, frame } = ctx;
    frame.reorderPoint = 10;
    createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 4 }] });
    const ins = insights(db, "2026-10-01");
    expect(ins.find((i) => i.id === "reorder")?.detail ?? "").not.toContain("Rangka");
    const so = createSalesOrder(db, { channel: "supply", date: "2026-10-01", paymentDueDate: "2026-10-20", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 1, unitPrice: 1_000 }] });
    confirmSalesOrder(db, so.id);
    expect(receivables(db, "2026-10-10")).toHaveLength(0);
    expect(receivables(db, "2026-10-25")).toHaveLength(1);
  });

  it("closes a sales order only when fully paid", async () => {
    const { completeSalesOrder } = await import("./sales");
    const ctx = shop();
    stockChairs(ctx, 1);
    const so = createSalesOrder(ctx.db, { channel: "supply", date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: ctx.chair.id, qty: 1, unitPrice: 1_000 }] });
    confirmSalesOrder(ctx.db, so.id);
    deliverSalesOrder(ctx.db, so.id, [{ itemId: ctx.chair.id, qty: 1 }]);
    expect(() => transact(ctx.db, (d) => completeSalesOrder(d, so.id))).toThrow(/sisa tagihan/);
    addPayment(ctx.db, "sale", so.id, { date: "2026-10-02", amount: 1_000 });
    completeSalesOrder(ctx.db, so.id);
    expect(so.status).toBe("selesai");
  });
});
