/**
 * Negative cases: wrong input, wrong order of actions, wrong references and corrupted data.
 * Every rejected operation must leave the database byte-for-byte unchanged.
 */
import { describe, expect, it } from "vitest";
import {
  addLaborLog,
  addOpeningStock,
  addPayment,
  adjustLotQty,
  cancelWorkOrder,
  checkoutRental,
  completeWorkOrder,
  confirmSalesOrder,
  createComponentOrders,
  createItem,
  createPartner,
  createPurchase,
  createRental,
  createSalesOrder,
  createWorkOrder,
  deliverSalesOrder,
  emptyDb,
  extendRental,
  issueMaterials,
  parseBackup,
  receiveOutput,
  receivePurchase,
  removeItem,
  returnRental,
  returnSale,
  scrapLot,
  serializeBackup,
  setStageStatus,
  suggestIssue,
  transact,
  transferLot,
  updateItem,
  updateLotInfo,
  updateRental,
  updateSalesOrder,
  updateSettings,
  updateWorkOrder,
  type Db,
} from "./index";

function base() {
  const db = emptyDb();
  db.settings.laborRatePerHour = 10_000;
  db.settings.overheadPerLaborHour = 0;
  const wood = createItem(db, { name: "Kayu", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 10_000_000 });
  const screw = createItem(db, { name: "Sekrup", kind: "material", category: "hardware", uom: "pcs", standardCost: 100 });
  const chair = createItem(db, {
    name: "Kursi",
    kind: "product",
    category: "kursi",
    uom: "pcs",
    standardCost: 500_000,
    salePrice: 1_000_000,
    rentalRatePerDay: 50_000,
    bom: [{ materialId: wood.id, qty: 0.02 }],
  });
  const buyer = createPartner(db, { role: "customer", name: "Pembeli" });
  const supplier = createPartner(db, { role: "supplier", name: "Pemasok" });
  addOpeningStock(db, { itemId: wood.id, qty: 1, unitCost: 10_000_000 });
  addOpeningStock(db, { itemId: chair.id, qty: 3, unitCost: 500_000 });
  return { db, wood, screw, chair, buyer, supplier };
}

/** Asserts the operation throws (optionally matching) and that nothing changed. */
function rejects(db: Db, fn: (d: Db) => unknown, match?: RegExp) {
  const before = JSON.stringify(db);
  const run = () => transact(db, fn);
  if (match) expect(run).toThrow(match);
  else expect(run).toThrow();
  expect(JSON.stringify(db)).toBe(before);
}

const so = (ctx: ReturnType<typeof base>, extra: Partial<Parameters<typeof createSalesOrder>[1]> = {}) =>
  createSalesOrder(ctx.db, {
    channel: "supply",
    customerId: ctx.buyer.id,
    date: "2026-10-01",
    currency: "IDR",
    exchangeRate: 1,
    lines: [{ itemId: ctx.chair.id, qty: 2, unitPrice: 1_000_000 }],
    ...extra,
  });

describe("master data", () => {
  it("rejects non-numeric and negative values", () => {
    const { db } = base();
    rejects(db, (d) => createItem(d, { name: "X", kind: "material", category: "lainnya", uom: "pcs", standardCost: Number.NaN }));
    rejects(db, (d) => createItem(d, { name: "X", kind: "material", category: "lainnya", uom: "pcs", standardCost: -1 }));
    rejects(db, (d) => createItem(d, { name: "  ", kind: "material", category: "lainnya", uom: "pcs", standardCost: 1 }), /Nama/);
  });

  it("rejects duplicate codes and circular recipes", () => {
    const { db, wood, chair } = base();
    rejects(db, (d) => createItem(d, { sku: wood.sku.toLowerCase(), name: "Dup", kind: "material", category: "lainnya", uom: "pcs", standardCost: 1 }), /sudah dipakai/);
    const frame = createItem(db, { name: "Rangka", kind: "material", category: "kayu_solid", uom: "pcs", standardCost: 1, bom: [{ materialId: chair.id, qty: 1 }] });
    // chair → frame → chair would loop forever in planning
    rejects(db, (d) => updateItem(d, chair.id, { ...chair, bom: [{ materialId: frame.id, qty: 1 }] }), /melingkar/);
    rejects(db, (d) => updateItem(d, chair.id, { ...chair, bom: [{ materialId: chair.id, qty: 1 }] }), /dirinya sendiri/);
  });

  it("refuses to change the unit of an item that already has stock", () => {
    const { db, wood } = base();
    rejects(db, (d) => updateItem(d, wood.id, { ...wood, uom: "batang" }), /Satuan/);
  });

  it("blocks archived items in new documents", () => {
    const ctx = base();
    const { db, chair, screw } = ctx;
    removeItem(db, screw.id); // never used → deleted
    expect(db.items.some((i) => i.id === screw.id)).toBe(false);
    removeItem(db, chair.id); // has stock → archived
    rejects(db, (d) => so({ ...ctx, db: d }), /diarsipkan/);
    rejects(db, (d) => createWorkOrder(d, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }] }), /diarsipkan/);
    rejects(db, (d) => createRental(d, { kind: "sewa", project: "x", startDate: "2026-10-01", endDate: "2026-10-01", lines: [{ itemId: chair.id, qty: 1, ratePerDay: 1 }] }), /diarsipkan/);
  });

  it("validates settings", () => {
    const { db } = base();
    rejects(db, (d) => updateSettings(d, { laborRatePerHour: Number.NaN }));
    rejects(db, (d) => updateSettings(d, { remnantAgingDays: 0 }), /hari/);
    rejects(db, (d) => updateSettings(d, { locations: ["Showroom"] }), /masih ada stok/);
    rejects(db, (d) => updateSettings(d, { locations: [] }), /lokasi/);
    const s = updateSettings(db, { locations: ["Gudang Utama", " Gudang Utama ", "Workshop", ""] });
    expect(s.locations).toEqual(["Gudang Utama", "Workshop"]);
  });
});

describe("partners", () => {
  it("does not let a customer act as a supplier or vice versa", () => {
    const ctx = base();
    const { db, wood, buyer, supplier, chair } = ctx;
    rejects(db, (d) => createPurchase(d, { supplierId: buyer.id, date: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }] }), /pemasok/);
    rejects(db, (d) => so({ ...ctx, db: d }, { customerId: supplier.id }), /pelanggan/);
    rejects(db, (d) => createRental(d, { kind: "sewa", customerId: supplier.id, project: "x", startDate: "2026-10-01", endDate: "2026-10-01", lines: [{ itemId: chair.id, qty: 1, ratePerDay: 1 }] }), /pelanggan/);
    rejects(db, (d) => createPurchase(d, { supplierId: "ghost", date: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }] }), /tidak ditemukan/);
  });
});

describe("purchasing", () => {
  it("rejects bad dates, quantities and double receipt", () => {
    const { db, wood } = base();
    rejects(db, (d) => createPurchase(d, { date: "", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }] }), /Tanggal/);
    rejects(db, (d) => createPurchase(d, { date: "2026-10-10", dueDate: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }] }), /jatuh tempo/);
    rejects(db, (d) => createPurchase(d, { date: "2026-10-01", lines: [{ itemId: wood.id, qty: Number.NaN, unitPrice: 1 }] }));
    rejects(db, (d) => createPurchase(d, { date: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: -5 }] }), /negatif/);
    rejects(db, (d) => createPurchase(d, { date: "2026-10-01", lines: [] }), /minimal/);
    rejects(db, (d) => createPurchase(d, { date: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }], extraCosts: [{ label: "x", amount: -1 }] }), /negatif/);
    const p = createPurchase(db, { date: "2026-10-01", lines: [{ itemId: wood.id, qty: 1, unitPrice: 1 }] });
    receivePurchase(db, p.id);
    rejects(db, (d) => receivePurchase(d, p.id), /sudah/);
  });
});

describe("production", () => {
  it("rejects negative or non-numeric labour and overhead", () => {
    const { db, chair } = base();
    rejects(db, (d) => createWorkOrder(d, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }], laborHours: -1 }), /negatif/);
    rejects(db, (d) => createWorkOrder(d, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }], overhead: Number.NaN }));
    const wo = createWorkOrder(db, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }] });
    rejects(db, (d) => updateWorkOrder(d, wo.id, { laborRate: Number.NaN }));
  });

  it("refuses outputs that cannot be produced", () => {
    const { db, chair, wood, screw } = base();
    const wo = createWorkOrder(db, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }], laborHours: 0 });
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 0.02).picks);
    rejects(db, (d) => completeWorkOrder(d, wo.id, { outputs: [{ itemId: screw.id, qty: 5 }], returns: [] }), /tidak bisa diproduksi/);
    rejects(db, (d) => completeWorkOrder(d, wo.id, { outputs: [{ itemId: chair.id, qty: 1 }], returns: [{ itemId: wood.id, kind: "sisa", qty: 0.01, dimensions: { length: -1, width: 10 } }] }), /Ukuran/);
  });

  it("caps partial receipts at the planned quantity", () => {
    const { db, chair } = base();
    const wo = createWorkOrder(db, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 2 }] });
    receiveOutput(db, wo.id, { itemId: chair.id, qty: 2 });
    rejects(db, (d) => receiveOutput(d, wo.id, { itemId: chair.id, qty: 1 }), /melebihi rencana/);
  });

  it("guards the order of actions on a work order", () => {
    const { db, chair, wood } = base();
    const wo = createWorkOrder(db, { type: "produksi", title: "x", plannedOutputs: [{ itemId: chair.id, qty: 1 }], laborHours: 0 });
    rejects(db, (d) => completeWorkOrder(d, wo.id, { outputs: [{ itemId: chair.id, qty: 1 }], returns: [] }), /Belum ada bahan/);
    issueMaterials(db, wo.id, suggestIssue(db, wo, wood.id, 0.02).picks);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: 1 }], returns: [] });
    rejects(db, (d) => issueMaterials(d, wo.id, suggestIssue(d, d.workOrders[0]!, wood.id, 0.01).picks), /ditutup/);
    rejects(db, (d) => addLaborLog(d, wo.id, { worker: "A", hours: 1 }), /ditutup/);
    rejects(db, (d) => setStageStatus(d, wo.id, wo.stages[0]!.id, "menunggu"), /ditutup/);
    rejects(db, (d) => cancelWorkOrder(d, wo.id), /ditutup/);
    rejects(db, (d) => completeWorkOrder(d, wo.id, { outputs: [{ itemId: chair.id, qty: 1 }], returns: [] }), /ditutup/);
  });

  it("does not cancel a parent while component orders are still open", () => {
    const { db, chair, wood } = base();
    const frame = createItem(db, { name: "Rangka", kind: "material", category: "kayu_solid", uom: "pcs", standardCost: 1, bom: [{ materialId: wood.id, qty: 0.01 }] });
    const product = createItem(db, { name: "Bangku", kind: "product", category: "lainnya", uom: "pcs", standardCost: 1, bom: [{ materialId: frame.id, qty: 1 }] });
    const parent = createWorkOrder(db, { type: "produksi", title: "Bangku", plannedOutputs: [{ itemId: product.id, qty: 2 }] });
    createComponentOrders(db, parent.id);
    rejects(db, (d) => cancelWorkOrder(d, parent.id), /perintah komponen/);
    expect(chair).toBeDefined();
  });
});

describe("inventory", () => {
  it("does not count, move or scrap units that are out on rent", () => {
    const ctx = base();
    const { db, chair } = ctx;
    const r = createRental(db, { kind: "sewa", project: "x", startDate: "2026-10-01", endDate: "2026-10-02", lines: [{ itemId: chair.id, qty: 1, ratePerDay: 1 }] });
    checkoutRental(db, r.id);
    const rented = db.lots.find((l) => l.status === "disewa")!;
    rejects(db, (d) => adjustLotQty(d, rented.id, 0), /disewa/);
    rejects(db, (d) => transferLot(d, rented.id, 1, "Workshop"), /disewa/);
    rejects(db, (d) => scrapLot(d, rented.id), /disewa/);
  });

  it("only accepts known locations", () => {
    const { db, wood } = base();
    const lot = db.lots.find((l) => l.itemId === wood.id)!;
    rejects(db, (d) => transferLot(d, lot.id, 0.5, "Gudang Hantu"), /tidak dikenal/);
    rejects(db, (d) => updateLotInfo(d, lot.id, { location: "Gudang Hantu" }), /tidak dikenal/);
    rejects(db, (d) => adjustLotQty(d, lot.id, -1), /negatif/);
    rejects(db, (d) => adjustLotQty(d, lot.id, Number.NaN));
    rejects(db, (d) => addOpeningStock(d, { itemId: wood.id, qty: 1, unitCost: 1, dimensions: { length: 100, width: -2 } }), /Ukuran/);
  });
});

describe("sales", () => {
  it("needs a customer before confirming and keeps totals above what was paid", () => {
    const ctx = base();
    const { db } = ctx;
    const s = so(ctx, { customerId: undefined });
    rejects(db, (d) => confirmSalesOrder(d, s.id), /pelanggan/);
    const s2 = so(ctx);
    addPayment(db, "sale", s2.id, { date: "2026-10-02", amount: 1_500_000 });
    rejects(db, (d) => updateSalesOrder(d, s2.id, { channel: "supply", customerId: ctx.buyer.id, date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: ctx.chair.id, qty: 1, unitPrice: 1_000_000 }] }), /sudah dibayar/);
    rejects(db, (d) => so({ ...ctx, db: d }, { dueDate: "2026-09-01" }), /Target kirim/);
  });

  it("blocks shipping before confirmation and returning more than shipped", () => {
    const ctx = base();
    const { db, chair } = ctx;
    const s = so(ctx);
    rejects(db, (d) => deliverSalesOrder(d, s.id, [{ itemId: chair.id, qty: 1 }]), /Konfirmasi/);
    confirmSalesOrder(db, s.id);
    rejects(db, (d) => deliverSalesOrder(d, s.id, [{ itemId: chair.id, qty: 3 }]), /melebihi/);
    rejects(db, (d) => deliverSalesOrder(d, s.id, [{ itemId: chair.id, qty: 0 }]), /Isi qty/);
    deliverSalesOrder(db, s.id, [{ itemId: chair.id, qty: 1 }]);
    rejects(db, (d) => returnSale(d, s.id, [{ itemId: chair.id, qty: 2, condition: "baik" }]), /melebihi/);
    rejects(db, (d) => returnSale(d, s.id, [{ itemId: ctx.wood.id, qty: 1, condition: "baik" }]), /melebihi/);
  });

  it("rejects payments that are zero, non-numeric or for unknown documents", () => {
    const ctx = base();
    const s = so(ctx);
    rejects(ctx.db, (d) => addPayment(d, "sale", s.id, { date: "2026-10-02", amount: Number.NaN }));
    rejects(ctx.db, (d) => addPayment(d, "sale", s.id, { date: "2026-10-02", amount: 0 }), /tidak boleh 0/);
    rejects(ctx.db, (d) => addPayment(d, "sale", "ghost", { date: "2026-10-02", amount: 1 }), /tidak ditemukan/);
  });
});

describe("rentals", () => {
  const book = (ctx: ReturnType<typeof base>, extra: Partial<Parameters<typeof createRental>[1]> = {}) =>
    createRental(ctx.db, {
      kind: "sewa",
      customerId: ctx.buyer.id,
      project: "Event",
      startDate: "2026-10-01",
      endDate: "2026-10-03",
      lines: [{ itemId: ctx.chair.id, qty: 2, ratePerDay: 50_000 }],
      ...extra,
    });

  it("rejects impossible bookings", () => {
    const ctx = base();
    rejects(ctx.db, (d) => book({ ...ctx, db: d }, { endDate: "2026-09-30" }), /sebelum/);
    rejects(ctx.db, (d) => book({ ...ctx, db: d }, { lines: [{ itemId: ctx.chair.id, qty: 1.5, ratePerDay: 1 }] }), /bulat/);
    rejects(ctx.db, (d) => book({ ...ctx, db: d }, { lines: [{ itemId: ctx.wood.id, qty: 1, ratePerDay: 1 }] }), /bukan produk/);
    rejects(ctx.db, (d) => book({ ...ctx, db: d }, { project: " " }), /acara/);
    rejects(ctx.db, (d) => book({ ...ctx, db: d }, { deposit: -1 }), /negatif/);
  });

  it("guards the sequence: no return before checkout, no double checkout, no early end", () => {
    const ctx = base();
    const { db } = ctx;
    const r = book(ctx);
    rejects(db, (d) => returnRental(d, r.id, [{ checkoutId: "x", qty: 1, condition: "baik" }]), /tidak sedang berjalan/);
    checkoutRental(db, r.id);
    rejects(db, (d) => checkoutRental(d, r.id), /sudah diserahkan/);
    rejects(db, (d) => returnRental(d, r.id, [{ checkoutId: r.checkouts[0]!.id, qty: 3, condition: "baik" }]), /melebihi/);
    rejects(db, (d) => extendRental(d, r.id, "2026-09-01"), /sebelum/);
    rejects(db, (d) => updateRental(d, r.id, { kind: "sewa", project: "x", startDate: "2026-10-01", endDate: "2026-10-02", lines: [{ itemId: ctx.chair.id, qty: 1, ratePerDay: 1 }] }), /belum diserahkan/);
  });

  it("refuses a checkout when stock is short", () => {
    const ctx = base();
    const r = book(ctx, { lines: [{ itemId: ctx.chair.id, qty: 5, ratePerDay: 1 }] });
    rejects(ctx.db, (d) => checkoutRental(d, r.id), /kurang/);
  });

  it("keeps an edited booking above what was already paid", () => {
    const ctx = base();
    const r = book(ctx);
    addPayment(ctx.db, "rental", r.id, { date: "2026-09-25", amount: 300_000 });
    rejects(ctx.db, (d) => updateRental(d, r.id, { kind: "pinjam", customerId: ctx.buyer.id, project: "Event", startDate: "2026-10-01", endDate: "2026-10-03", lines: [{ itemId: ctx.chair.id, qty: 2, ratePerDay: 0 }] }), /sudah dibayar/);
  });
});

describe("backup files", () => {
  it("rejects files with broken references or malformed records", () => {
    const { db } = base();
    const good = serializeBackup(db);
    expect(() => parseBackup(good)).not.toThrow();

    const orphan = JSON.parse(good);
    orphan.data.lots[0].itemId = "ghost";
    expect(() => parseBackup(JSON.stringify(orphan))).toThrow(/rusak/);

    const badQty = JSON.parse(good);
    badQty.data.lots[0].qty = "banyak";
    expect(() => parseBackup(JSON.stringify(badQty))).toThrow(/rusak/);

    const badItem = JSON.parse(good);
    delete badItem.data.items[0].name;
    expect(() => parseBackup(JSON.stringify(badItem))).toThrow(/rusak/);

    const dupId = JSON.parse(good);
    dupId.data.items.push({ ...dupId.data.items[0] });
    expect(() => parseBackup(JSON.stringify(dupId))).toThrow(/rusak/);

    expect(() => parseBackup("[]")).toThrow();
    expect(() => parseBackup("null")).toThrow();
  });
});
