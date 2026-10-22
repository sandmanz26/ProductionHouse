import { describe, expect, it } from "vitest";
import {
  addOpeningStock,
  availableForRange,
  checkoutRental,
  completeWorkOrder,
  computeCost,
  confirmSalesOrder,
  createItem,
  createPurchase,
  createRental,
  createRepairsFromRental,
  createSalesOrder,
  createWorkOrder,
  createWorkOrdersForShortage,
  deliverSalesOrder,
  emptyDb,
  issueMaterials,
  landedUnitCosts,
  migrate,
  parseBackup,
  receivePurchase,
  rentalCharges,
  requirements,
  returnRental,
  salesTotals,
  serializeBackup,
  stockOf,
  suggestIssue,
  suggestLots,
  transact,
  unissue,
  cancelWorkOrder,
  createPartner,
  type Db,
  type Item,
} from "./index";

function setup() {
  const db = emptyDb();
  db.settings.laborRatePerHour = 20_000;
  db.settings.overheadPerLaborHour = 5_000;
  const ply = createItem(db, {
    name: "Plywood 18mm",
    kind: "material",
    category: "panel",
    uom: "lembar",
    standardCost: 300_000,
    trackRemnant: true,
    minRemnantQty: 0.1,
  });
  const teak = createItem(db, {
    name: "Kayu Jati",
    kind: "material",
    category: "kayu_solid",
    uom: "m3",
    standardCost: 15_000_000,
    trackRemnant: true,
  });
  const screw = createItem(db, { name: "Sekrup", kind: "material", category: "hardware", uom: "pcs", standardCost: 200 });
  const cabinet = createItem(db, {
    name: "Lemari",
    kind: "product",
    category: "lemari",
    uom: "pcs",
    standardCost: 0,
    salePrice: 2_000_000,
    laborHours: 10,
    rentalRatePerDay: 100_000,
    bom: [
      { materialId: ply.id, qty: 2 },
      { materialId: screw.id, qty: 20 },
    ],
  });
  const shelf = createItem(db, {
    name: "Rak",
    kind: "product",
    category: "lainnya",
    uom: "pcs",
    standardCost: 0,
    salePrice: 500_000,
    bom: [{ materialId: ply.id, qty: 0.5 }],
  });
  return { db, ply, teak, screw, cabinet, shelf };
}

/** Every lot's quantity must equal the sum of its ledger moves. */
function expectLedgerConsistent(db: Db) {
  for (const lot of db.lots) {
    const moved = db.moves.filter((m) => m.lotId === lot.id).reduce((a, m) => a + m.qty, 0);
    expect(Math.round(moved * 10_000) / 10_000, `lot ${lot.code}`).toBeCloseTo(lot.qty, 4);
  }
}

describe("purchasing", () => {
  it("allocates extra costs to lines by value (landed cost)", () => {
    const costs = landedUnitCosts({
      lines: [
        { id: "a", itemId: "x", qty: 10, unitPrice: 100 },
        { id: "b", itemId: "y", qty: 5, unitPrice: 200 },
      ],
      extraCosts: [{ id: "c", label: "Ongkir", amount: 200 }],
    });
    // goods 1000 + 1000; each line carries 100 of freight
    expect(costs).toEqual([110, 220]);
  });

  it("receives lots, updates standard cost and reserves for the linked work order", () => {
    const { db, ply, cabinet } = setup();
    const wo = createWorkOrder(db, { type: "produksi", title: "Lemari", plannedOutputs: [{ itemId: cabinet.id, qty: 1 }] });
    const p = createPurchase(db, {
      date: "2026-10-01",
      lines: [{ itemId: ply.id, qty: 3, unitPrice: 280_000 }],
      extraCosts: [{ label: "Ongkir", amount: 60_000 }],
      workOrderId: wo.id,
    });
    receivePurchase(db, p.id);
    const lot = db.lots[0]!;
    expect(lot.unitCost).toBe(300_000);
    expect(lot.reservedForWo).toBe(wo.id);
    expect(ply.standardCost).toBe(300_000);
    expectLedgerConsistent(db);
  });
});

describe("lot suggestion", () => {
  it("prefers own reservation, then smallest remnant, then FIFO; skips others' reservations", () => {
    const { db, ply } = setup();
    const old = addOpeningStock(db, { itemId: ply.id, qty: 5, unitCost: 250_000 });
    old.createdAt = "2026-01-01T00:00:00.000Z";
    const big = addOpeningStock(db, { itemId: ply.id, qty: 0.6, unitCost: 250_000, isRemnant: true });
    const small = addOpeningStock(db, { itemId: ply.id, qty: 0.3, unitCost: 250_000, isRemnant: true });
    const mine = addOpeningStock(db, { itemId: ply.id, qty: 1, unitCost: 290_000 });
    mine.reservedForWo = "wo-1";
    const theirs = addOpeningStock(db, { itemId: ply.id, qty: 10, unitCost: 290_000 });
    theirs.reservedForWo = "wo-2";

    const s = suggestLots(db, ply.id, 3, { workOrderId: "wo-1" });
    expect(s.picks.map((p) => p.lotId)).toEqual([mine.id, small.id, big.id, old.id]);
    expect(s.picks.map((p) => p.qty)).toEqual([1, 0.3, 0.6, 1.1]);
    expect(s.remnantQty).toBeCloseTo(0.9);
    expect(s.shortage).toBe(0);

    const tooMuch = suggestLots(db, ply.id, 20, { workOrderId: "wo-1" });
    expect(tooMuch.shortage).toBeCloseTo(13.1);
  });
});

describe("production costing", () => {
  function runningCabinetWo() {
    const ctx = setup();
    const { db, ply, screw, cabinet } = ctx;
    addOpeningStock(db, { itemId: ply.id, qty: 4, unitCost: 300_000 });
    addOpeningStock(db, { itemId: screw.id, qty: 100, unitCost: 200 });
    const wo = createWorkOrder(db, { type: "produksi", title: "Lemari", plannedOutputs: [{ itemId: cabinet.id, qty: 1 }] });
    expect(wo.laborHours).toBe(10);
    expect(wo.overhead).toBe(50_000);
    const req = requirements(db, wo);
    expect(req.find((r) => r.itemId === ply.id)?.required).toBe(2);
    issueMaterials(db, wo.id, [
      ...suggestIssue(db, wo, ply.id, 3).picks,
      ...suggestIssue(db, wo, screw.id, 30).picks,
    ]);
    return { ...ctx, wo };
  }

  it("credits usable remnants and whole returns, deducts waste salvage, and books the remnant at average cost", () => {
    const { db, ply, screw, cabinet, wo } = runningCabinetWo();
    expect(wo.status).toBe("berjalan");
    completeWorkOrder(db, wo.id, {
      outputs: [{ itemId: cabinet.id, qty: 1 }],
      returns: [
        { itemId: ply.id, kind: "sisa", qty: 0.5, dimensions: { length: 1220, width: 600, thickness: 18 } },
        { itemId: ply.id, kind: "limbah", qty: 0.2, salvageValue: 10_000 },
        { itemId: screw.id, kind: "utuh", qty: 8 },
      ],
    });
    const cost = wo.cost!;
    // 3 × 300k + 30 × 200 = 906,000 gross
    expect(cost.materialGross).toBe(906_000);
    // remnant 0.5 × 300k + screws 8 × 200
    expect(cost.returnCredit).toBe(151_600);
    expect(cost.scrapRecovery).toBe(10_000);
    expect(cost.materialNet).toBe(744_400);
    expect(cost.labor).toBe(200_000);
    expect(cost.overhead).toBe(50_000);
    expect(cost.total).toBe(994_400);
    expect(cost.outputs[0]!.unitCost).toBe(994_400);

    const remnant = db.lots.find((l) => l.isRemnant)!;
    expect(remnant.qty).toBe(0.5);
    expect(remnant.unitCost).toBe(300_000);
    expect(remnant.dimensions?.width).toBe(600);
    expect(stockOf(db, screw.id).available).toBe(78);
    expect(stockOf(db, ply.id).available).toBeCloseTo(1.5);
    expect(stockOf(db, cabinet.id).available).toBe(1);
    expect(wo.status).toBe("selesai");
    expectLedgerConsistent(db);
  });

  it("rejects returning more than was issued, leaving the database untouched", () => {
    const { db, ply, cabinet, wo } = runningCabinetWo();
    const before = JSON.stringify(db);
    expect(() =>
      transact(db, (d) =>
        completeWorkOrder(d, wo.id, {
          outputs: [{ itemId: cabinet.id, qty: 1 }],
          returns: [{ itemId: ply.id, kind: "sisa", qty: 3.5 }],
        }),
      ),
    ).toThrow(/melebihi/);
    expect(JSON.stringify(db)).toBe(before);
  });

  it("allocates joint cost by relative sales value, or by manual share", () => {
    const { db, cabinet, shelf, wo } = runningCabinetWo();
    const auto = computeCost(db, wo, {
      outputs: [
        { itemId: cabinet.id, qty: 1 },
        { itemId: shelf.id, qty: 2 },
      ],
      returns: [],
    });
    // weights 2,000,000 : 1,000,000
    const [a, b] = auto.outputs;
    expect(a!.allocated + b!.allocated).toBeCloseTo(auto.total, 2);
    expect(a!.allocated / auto.total).toBeCloseTo(2 / 3, 4);
    expect(b!.unitCost).toBeCloseTo(auto.total / 3 / 2, 0);

    const manual = computeCost(db, wo, {
      outputs: [
        { itemId: cabinet.id, qty: 1, sharePct: 90 },
        { itemId: shelf.id, qty: 2, sharePct: 10 },
      ],
      returns: [],
    });
    expect(manual.outputs[0]!.allocated / manual.total).toBeCloseTo(0.9, 4);
    expect(() =>
      computeCost(db, wo, {
        outputs: [
          { itemId: cabinet.id, qty: 1, sharePct: 90 },
          { itemId: shelf.id, qty: 2, sharePct: 20 },
        ],
        returns: [],
      }),
    ).toThrow(/100%/);
  });

  it("caps deconstructed material at replacement value and writes off the excess", () => {
    const { db, teak, cabinet } = setup();
    const unit = addOpeningStock(db, { itemId: cabinet.id, qty: 1, unitCost: 3_000_000 });
    const wo = createWorkOrder(db, {
      type: "dekonstruksi",
      title: "Bongkar lemari",
      plannedOutputs: [{ itemId: teak.id, qty: 0.1 }],
      plannedInputs: [{ itemId: cabinet.id, qty: 1, lotId: unit.id }],
      laborHours: 2,
    });
    issueMaterials(db, wo.id, suggestIssue(db, wo, cabinet.id, 1).picks);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: teak.id, qty: 0.1 }], returns: [] });
    const c = wo.cost!;
    expect(c.total).toBe(3_000_000 + 40_000 + 10_000);
    // 0.1 m3 × 15,000,000 = 1,500,000 cap
    expect(c.capitalized).toBe(1_500_000);
    expect(c.writeOff).toBe(1_550_000);
    const recovered = db.lots.find((l) => l.itemId === teak.id)!;
    expect(recovered.origin).toBe("dekonstruksi");
    expect(recovered.unitCost).toBe(15_000_000);
    expectLedgerConsistent(db);
  });

  it("releases leftovers of a dedicated purchase so the next work order uses them at original cost", () => {
    const { db, ply, cabinet, shelf } = setup();
    const wo1 = createWorkOrder(db, { type: "produksi", title: "A", plannedOutputs: [{ itemId: cabinet.id, qty: 1 }] });
    const p = createPurchase(db, {
      date: "2026-10-01",
      lines: [{ itemId: ply.id, qty: 5, unitPrice: 320_000 }],
      workOrderId: wo1.id,
    });
    receivePurchase(db, p.id);
    const wo2 = createWorkOrder(db, { type: "produksi", title: "B", plannedOutputs: [{ itemId: shelf.id, qty: 2 }] });
    // While reserved, the second work order sees a shortage.
    expect(requirements(db, wo2).find((r) => r.itemId === ply.id)?.shortage).toBe(1);

    issueMaterials(db, wo1.id, suggestIssue(db, wo1, ply.id, 2).picks);
    completeWorkOrder(db, wo1.id, { outputs: [{ itemId: cabinet.id, qty: 1 }], returns: [] });
    expect(db.lots.some((l) => l.reservedForWo)).toBe(false);

    expect(requirements(db, wo2).find((r) => r.itemId === ply.id)?.shortage).toBe(0);
    issueMaterials(db, wo2.id, suggestIssue(db, wo2, ply.id, 1).picks);
    expect(wo2.issues[0]!.unitCost).toBe(320_000);
    expect(wo1.cost!.materialGross).toBe(640_000);
  });

  it("returns issued material to stock when cancelled or un-issued", () => {
    const { db, ply, wo } = runningCabinetWo();
    const issue = wo.issues.find((i) => i.itemId === ply.id)!;
    unissue(db, wo.id, issue.id, 1);
    expect(stockOf(db, ply.id).available).toBeCloseTo(2);
    cancelWorkOrder(db, wo.id);
    expect(stockOf(db, ply.id).available).toBeCloseTo(4);
    expect(wo.status).toBe("batal");
    expectLedgerConsistent(db);
  });
});

describe("sales", () => {
  it("captures COGS from lots and blocks over-delivery", () => {
    const { db, cabinet } = setup();
    addOpeningStock(db, { itemId: cabinet.id, qty: 3, unitCost: 1_200_000 });
    const so = createSalesOrder(db, { customerId: buyerOf(db),
      channel: "ekspor",
      date: "2026-10-01",
      currency: "USD",
      exchangeRate: 16_000,
      lines: [{ itemId: cabinet.id, qty: 5, unitPrice: 150 }],
      export: {
        incoterm: "FOB",
        portOfLoading: "Tanjung Emas",
        portOfDischarge: "Rotterdam",
        destinationCountry: "Belanda",
        containerType: "20GP",
      },
    });
    confirmSalesOrder(db, so.id);
    const wos = createWorkOrdersForShortage(db, so.id);
    expect(wos[0]!.plannedOutputs[0]!.qty).toBe(2);
    expect(wos[0]!.salesOrderId).toBe(so.id);

    expect(() => transact(db, (d) => deliverSalesOrder(d, so.id, [{ itemId: cabinet.id, qty: 4 }]))).toThrow(/tidak cukup/);
    deliverSalesOrder(db, so.id, [{ itemId: cabinet.id, qty: 3 }]);
    expect(so.status).toBe("dikirim_sebagian");
    const t = salesTotals(db, so);
    expect(t.cogs).toBe(3_600_000);
    expect(t.totalIdr).toBe(5 * 150 * 16_000);
    expect(() => transact(db, (d) => deliverSalesOrder(d, so.id, [{ itemId: cabinet.id, qty: 3 }]))).toThrow(/melebihi/);
    expectLedgerConsistent(db);
  });
});

describe("rentals", () => {
  function rentalSetup() {
    const ctx = setup();
    addOpeningStock(ctx.db, { itemId: ctx.cabinet.id, qty: 4, unitCost: 1_000_000 });
    return ctx;
  }

  it("computes availability from overlapping bookings", () => {
    const { db, cabinet } = rentalSetup();
    createRental(db, {
      kind: "sewa",
      project: "Syuting A",
      startDate: "2026-11-01",
      endDate: "2026-11-05",
      lines: [{ itemId: cabinet.id, qty: 3, ratePerDay: 100_000 }],
    });
    expect(availableForRange(db, cabinet.id, "2026-11-04", "2026-11-06", { asOf: "2026-10-20" }).available).toBe(1);
    expect(availableForRange(db, cabinet.id, "2026-11-06", "2026-11-08", { asOf: "2026-10-20" }).available).toBe(4);
  });

  it("tracks checkout, partial returns by condition, late fee, and repair", () => {
    const { db, cabinet } = rentalSetup();
    const r = createRental(db, {
      kind: "sewa",
      project: "Event B",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      lines: [{ itemId: cabinet.id, qty: 3, ratePerDay: 100_000 }],
      deposit: 500_000,
    });
    checkoutRental(db, r.id, undefined, "2026-10-01T08:00:00.000Z");
    expect(stockOf(db, cabinet.id).rented).toBe(3);
    expect(stockOf(db, cabinet.id).available).toBe(1);
    const co = r.checkouts[0]!;
    returnRental(
      db,
      r.id,
      [
        { checkoutId: co.id, qty: 1, condition: "baik" },
        { checkoutId: co.id, qty: 1, condition: "rusak", fee: 200_000 },
      ],
      "2026-10-03T10:00:00.000Z",
    );
    expect(r.status).toBe("berjalan");
    // last unit returned 2 days late and lost
    returnRental(db, r.id, [{ checkoutId: co.id, qty: 1, condition: "hilang", fee: 1_500_000 }], "2026-10-05T10:00:00.000Z");
    expect(r.status).toBe("selesai");

    const s = stockOf(db, cabinet.id);
    expect(s.available).toBe(2);
    expect(s.damaged).toBe(1);
    expect(s.rented).toBe(0);
    expect(s.total).toBe(3);

    const ch = rentalCharges(r, "2026-10-10");
    expect(ch.days).toBe(3);
    expect(ch.base).toBe(900_000);
    expect(ch.lateFee).toBe(200_000);
    expect(ch.damageFee).toBe(1_700_000);
    expect(ch.balance).toBe(900_000 + 200_000 + 1_700_000 - 500_000);

    const [repair] = createRepairsFromRental(db, r.id);
    expect(repair!.type).toBe("perbaikan");
    issueMaterials(db, repair!.id, suggestIssue(db, repair!, cabinet.id, 1).picks);
    completeWorkOrder(db, repair!.id, { outputs: [{ itemId: cabinet.id, qty: 1 }], returns: [], laborHours: 2 });
    const after = stockOf(db, cabinet.id);
    expect(after.damaged).toBe(0);
    expect(after.available).toBe(3);
    // repaired unit carries original cost + labour + overhead
    expect(repair!.cost!.total).toBe(1_000_000 + 2 * 20_000);
    expect(() => createRepairsFromRental(db, r.id)).toThrow();
    expectLedgerConsistent(db);
  });

  it("projects late fees for units still out", () => {
    const { db, cabinet } = rentalSetup();
    const r = createRental(db, {
      kind: "sewa",
      project: "C",
      startDate: "2026-10-01",
      endDate: "2026-10-02",
      lines: [{ itemId: cabinet.id, qty: 2, ratePerDay: 50_000 }],
    });
    checkoutRental(db, r.id);
    const ch = rentalCharges(r, "2026-10-05");
    expect(ch.isOverdue).toBe(true);
    expect(ch.lateDays).toBe(3);
    expect(ch.lateFee).toBe(3 * 2 * 50_000);
  });
});

describe("persistence", () => {
  it("round-trips a backup and rejects newer schemas", () => {
    const { db } = setup();
    const restored = parseBackup(serializeBackup(db));
    expect(restored.items.length).toBe(db.items.length);
    expect(() => migrate({ ...db, schemaVersion: 999 })).toThrow(/lebih baru/);
    expect(() => parseBackup("not json")).toThrow();
    const partial = migrate({ items: [] as Item[] });
    expect(partial.lots).toEqual([]);
    expect(partial.settings.locations.length).toBeGreaterThan(0);
  });
});

describe("demo seed", () => {
  it("builds a consistent dataset through domain operations", async () => {
    const { buildDemoDb } = await import("./seed");
    const { insights } = await import("./analytics");
    const db = buildDemoDb();
    expectLedgerConsistent(db);
    expect(db.lots.every((l) => l.qty >= 0)).toBe(true);
    expect(db.workOrders.filter((w) => w.status === "selesai").length).toBe(4);
    expect(db.lots.some((l) => l.isRemnant && l.qty > 0)).toBe(true);
    expect(insights(db).length).toBeGreaterThan(0);
    // migrate is idempotent on its own output
    expect(migrate(JSON.parse(JSON.stringify(db)))).toEqual(db);
  });
});

/** Sales orders need a customer before they can be confirmed. */
function buyerOf(db: Db) {
  return (db.partners.find((p) => p.role === "customer") ?? createPartner(db, { role: "customer", name: "Pembeli" })).id;
}
