/**
 * Production routes: a chair can be made from new teak (BOM), from reclaimed teak processed out of
 * dismantled furniture (recipe chain), and a component can be made in-house or bought.
 */
import { describe, expect, it } from "vitest";
import {
  addOpeningStock,
  cheapestRoute,
  completeWorkOrder,
  createItem,
  createPartner,
  createPurchase,
  createRecipe,
  createWorkOrder,
  createWorkOrderFromRecipe,
  defaultCompletion,
  emptyDb,
  issueMaterials,
  itemFlow,
  productionRoutes,
  receivePurchase,
  requirements,
  routeGraph,
  suggestIssue,
  sum,
  type Db,
  type WorkOrder,
} from "./index";

function setup() {
  const db = emptyDb();
  db.settings.laborRatePerHour = 10_000;
  db.settings.overheadPerLaborHour = 0;
  const teak = createItem(db, { name: "Jati baru", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 14_000_000 });
  const raw = createItem(db, { name: "Jati bongkaran", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 5_000_000 });
  const reclaimed = createItem(db, { name: "Jati reclaimed", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 0 });
  const screw = createItem(db, { name: "Sekrup", kind: "material", category: "hardware", uom: "pcs", standardCost: 100 });
  const frame = createItem(db, { name: "Rangka", kind: "material", category: "kayu_solid", uom: "pcs", standardCost: 0, bom: [{ materialId: teak.id, qty: 0.02 }], laborHours: 1 });
  const chair = createItem(db, {
    name: "Kursi",
    kind: "product",
    category: "kursi",
    uom: "pcs",
    standardCost: 0,
    salePrice: 2_000_000,
    bom: [
      { materialId: teak.id, qty: 0.03 },
      { materialId: screw.id, qty: 10 },
    ],
    laborHours: 4,
  });
  const process = createRecipe(db, { name: "Olah bongkaran", type: "produksi", inputs: [{ itemId: raw.id, qty: 1.25 }], outputs: [{ itemId: reclaimed.id, qty: 1 }], laborHours: 6 });
  const viaReclaimed = createRecipe(db, {
    name: "Kursi dari reclaimed",
    type: "produksi",
    inputs: [
      { itemId: reclaimed.id, qty: 0.032 },
      { itemId: screw.id, qty: 10 },
    ],
    outputs: [{ itemId: chair.id, qty: 1 }],
    laborHours: 5,
  });
  const dismantle = createRecipe(db, { name: "Bongkar kursi rusak", type: "dekonstruksi", inputs: [{ itemId: chair.id, qty: 1 }], outputs: [{ itemId: raw.id, qty: 0.02 }], laborHours: 1 });
  const vendor = createPartner(db, { role: "supplier", name: "UD Rangka" });
  return { db, teak, raw, reclaimed, screw, frame, chair, process, viaReclaimed, dismantle, vendor };
}

const run = (db: Db, wo: WorkOrder) => {
  for (const r of requirements(db, wo)) if (r.remaining > 0) issueMaterials(db, wo.id, suggestIssue(db, wo, r.itemId, r.remaining).picks);
  completeWorkOrder(db, wo.id, defaultCompletion(db, wo));
};

describe("production routes", () => {
  it("lists every way to get a chair, with standard cost per unit", () => {
    const ctx = setup();
    const routes = productionRoutes(ctx.db, ctx.chair.id);
    expect(routes.map((r) => [r.kind, r.label])).toEqual([
      ["bom", "BOM standar"],
      ["resep", "Kursi dari reclaimed"],
    ]);
    expect(routes[0]!.unitCost).toBe(0.03 * 14_000_000 + 10 * 100 + 4 * 10_000);
    // A product nobody bought has no buying route.
    expect(routes.some((r) => r.kind === "beli")).toBe(false);
  });

  it("shows recovered timber as a by-product of dismantling, and still buyable", () => {
    const ctx = setup();
    const routes = productionRoutes(ctx.db, ctx.raw.id);
    expect(routes.find((r) => r.kind === "bongkar")).toMatchObject({ byProduct: true, recipeId: ctx.dismantle.id });
    expect(routes.find((r) => r.kind === "beli")).toBeTruthy();
    // By-products never win "cheapest".
    expect(cheapestRoute(routes)?.kind).toBe("beli");
  });

  it("knows a component that is both made in-house and bought from a vendor", () => {
    const ctx = setup();
    const p = createPurchase(ctx.db, { supplierId: ctx.vendor.id, date: "2026-10-01", lines: [{ itemId: ctx.frame.id, qty: 4, unitPrice: 250_000 }] });
    receivePurchase(ctx.db, p.id);
    const routes = productionRoutes(ctx.db, ctx.frame.id);
    expect(routes.map((r) => r.kind)).toEqual(["bom", "beli"]);
    expect(routes[1]).toMatchObject({ uses: 1, qtyMade: 4, unitCost: 250_000, label: "Beli · UD Rangka" });
    expect(routes[1]!.suppliers![0]).toMatchObject({ name: "UD Rangka", count: 1 });
  });

  it("counts how often each route was actually used", () => {
    const ctx = setup();
    addOpeningStock(ctx.db, { itemId: ctx.teak.id, qty: 1, unitCost: 14_000_000 });
    addOpeningStock(ctx.db, { itemId: ctx.raw.id, qty: 1, unitCost: 5_000_000 });
    addOpeningStock(ctx.db, { itemId: ctx.screw.id, qty: 500, unitCost: 100 });
    run(ctx.db, createWorkOrder(ctx.db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: ctx.chair.id, qty: 5 }] }));
    run(ctx.db, createWorkOrderFromRecipe(ctx.db, ctx.process.id, { batches: 0.4 }));
    run(ctx.db, createWorkOrderFromRecipe(ctx.db, ctx.viaReclaimed.id, { batches: 3 }));
    const routes = productionRoutes(ctx.db, ctx.chair.id);
    expect(routes.map((r) => [r.kind, r.uses, r.qtyMade])).toEqual([
      ["bom", 1, 5],
      ["resep", 1, 3],
    ]);
  });

  it("records past conversions without a recipe as a route of their own", () => {
    const ctx = setup();
    const desk = createItem(ctx.db, { name: "Meja kerja", kind: "product", category: "meja", uom: "pcs", standardCost: 0, salePrice: 3_000_000 });
    addOpeningStock(ctx.db, { itemId: ctx.chair.id, qty: 2, unitCost: 600_000 });
    addOpeningStock(ctx.db, { itemId: ctx.teak.id, qty: 1, unitCost: 14_000_000 });
    const wo = createWorkOrder(ctx.db, { type: "konversi", title: "Kursi → meja", plannedOutputs: [{ itemId: desk.id, qty: 1 }], plannedInputs: [{ itemId: ctx.chair.id, qty: 2 }, { itemId: ctx.teak.id, qty: 0.01 }], laborHours: 0 });
    run(ctx.db, wo);
    const [route] = productionRoutes(ctx.db, desk.id);
    expect(route).toMatchObject({ kind: "riwayat", processType: "konversi", label: "Konversi dari Kursi", uses: 1, qtyMade: 1 });
    expect(route!.inputs.find((i) => i.itemId === ctx.chair.id)?.qty).toBe(2);
    expect(route!.unitCost).toBe(2 * 600_000 + 140_000);
  });
});

describe("route graph", () => {
  it("expands the chain teak ← reclaimed ← dismantled chair and stops at the loop", () => {
    const ctx = setup();
    const g = routeGraph(ctx.db, ctx.chair.id, { depth: 4 });
    const ids = new Set(g.nodes.map((n) => n.id));
    expect(ids.has(`item:${ctx.reclaimed.id}`)).toBe(true);
    expect(ids.has(`item:${ctx.raw.id}`)).toBe(true);
    expect(ids.has(`route:resep:${ctx.dismantle.id}`)).toBe(true);
    // Dismantling needs a chair — the chair we are mapping. That is a loop, not an infinite tree.
    expect(g.nodes.some((n) => n.type === "cycle" && n.itemId === ctx.chair.id)).toBe(true);
    // Every edge points from a higher level (left) to a lower one (right).
    const level = new Map(g.nodes.map((n) => [n.id, n.level]));
    for (const e of g.edges) expect(level.get(e.from)!).toBeGreaterThan(level.get(e.to)!);
    // Shared inputs appear once.
    expect(g.nodes.filter((n) => n.id === `item:${ctx.teak.id}`)).toHaveLength(1);
  });

  it("hides hardware unless asked, and puts buy-only materials on the card", () => {
    const ctx = setup();
    const lean = routeGraph(ctx.db, ctx.chair.id);
    expect(lean.nodes.some((n) => n.itemId === ctx.screw.id)).toBe(false);
    expect(lean.nodes.find((n) => n.id === `route:bom:${ctx.chair.id}`)?.hiddenAux).toBe(1);
    const full = routeGraph(ctx.db, ctx.chair.id, { showAux: true });
    const screw = full.nodes.find((n) => n.itemId === ctx.screw.id)!;
    expect(screw.buyOnly?.kind).toBe("beli");
    expect(full.nodes.some((n) => n.id === `route:beli:${ctx.screw.id}`)).toBe(false);
  });

  it("stops at the requested depth and flags what lies beyond", () => {
    const ctx = setup();
    const g = routeGraph(ctx.db, ctx.chair.id, { depth: 1 });
    expect(g.nodes.find((n) => n.itemId === ctx.reclaimed.id)?.more).toBe(true);
    expect(g.nodes.some((n) => n.itemId === ctx.raw.id)).toBe(false);
  });
});

describe("item history", () => {
  it("shows where an item came from and what it became, without losing value", () => {
    const ctx = setup();
    const p = createPurchase(ctx.db, { supplierId: ctx.vendor.id, date: "2026-10-01", lines: [{ itemId: ctx.teak.id, qty: 1, unitPrice: 14_000_000 }] });
    receivePurchase(ctx.db, p.id);
    addOpeningStock(ctx.db, { itemId: ctx.screw.id, qty: 500, unitCost: 100 });
    run(ctx.db, createWorkOrder(ctx.db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: ctx.chair.id, qty: 5 }] }));
    const g = itemFlow(ctx.db, ctx.teak.id);
    const center = `item:${ctx.teak.id}`;
    const into = sum(g.links.filter((l) => l.target === center).map((l) => l.value));
    const out = sum(g.links.filter((l) => l.source === center).map((l) => l.value));
    expect(g.nodes.find((n) => n.label === "Beli · UD Rangka")).toBeTruthy();
    expect(g.nodes.find((n) => n.label === "Jadi Kursi")).toBeTruthy();
    expect(out).toBeCloseTo(into, 0);
  });
});
