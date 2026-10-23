/**
 * Recipes, merges and process maps. Flow graphs must conserve value: what goes into a process
 * node comes out of it (within rounding), so the picture never invents or loses money.
 */
import { describe, expect, it } from "vitest";
import {
  addOpeningStock,
  completeWorkOrder,
  confirmSalesOrder,
  createComponentOrders,
  createItem,
  createPartner,
  createRecipe,
  createSalesOrder,
  createWorkOrder,
  createWorkOrderFromRecipe,
  defaultCompletion,
  deliverSalesOrder,
  emptyDb,
  isProducibleIn,
  issueMaterials,
  lotTrace,
  mergeLots,
  plantFlow,
  recipeCost,
  recipeFlow,
  recipePerformance,
  removeRecipe,
  requirements,
  suggestIssue,
  sum,
  transact,
  workOrderFlow,
  type Db,
  type FlowGraph,
  type ID,
  type RecipeInput,
  type WorkOrder,
} from "./index";

function setup() {
  const db = emptyDb();
  db.settings.laborRatePerHour = 10_000;
  db.settings.overheadPerLaborHour = 0;
  const wood = createItem(db, { name: "Jati", kind: "material", category: "kayu_solid", uom: "m3", standardCost: 10_000_000, trackRemnant: true });
  const glue = createItem(db, { name: "Lem", kind: "material", category: "finishing", uom: "liter", standardCost: 50_000 });
  const panel = createItem(db, { name: "Panel laminasi", kind: "material", category: "kayu_solid", uom: "lembar", standardCost: 0 });
  const chair = createItem(db, { name: "Kursi", kind: "product", category: "kursi", uom: "pcs", standardCost: 400_000, salePrice: 1_000_000, bom: [{ materialId: wood.id, qty: 0.02 }] });
  const table = createItem(db, { name: "Meja", kind: "product", category: "meja", uom: "pcs", standardCost: 1_500_000, salePrice: 3_000_000 });
  const set = createItem(db, { name: "Set Makan", kind: "product", category: "meja", uom: "set", standardCost: 0, salePrice: 8_000_000 });
  const stool = createItem(db, { name: "Bangku", kind: "product", category: "kursi", uom: "pcs", standardCost: 200_000, salePrice: 500_000 });
  addOpeningStock(db, { itemId: wood.id, qty: 1, unitCost: 10_000_000 });
  addOpeningStock(db, { itemId: glue.id, qty: 5, unitCost: 50_000 });
  addOpeningStock(db, { itemId: chair.id, qty: 6, unitCost: 400_000 });
  addOpeningStock(db, { itemId: table.id, qty: 1, unitCost: 1_500_000 });
  const buyer = createPartner(db, { role: "customer", name: "Toko" });
  return { db, wood, glue, panel, chair, table, set, stool, buyer };
}

function rejects(db: Db, fn: (d: Db) => unknown, match: RegExp) {
  const before = JSON.stringify(db);
  expect(() => transact(db, fn)).toThrow(match);
  expect(JSON.stringify(db)).toBe(before);
}

/** Value into and out of every process node. */
function balance(g: FlowGraph, nodeId: string) {
  const into = sum(g.links.filter((l) => l.target === nodeId).map((l) => l.value));
  const out = sum(g.links.filter((l) => l.source === nodeId).map((l) => l.value));
  return { into, out };
}

const issueAll = (db: Db, wo: WorkOrder) => {
  for (const r of requirements(db, wo)) if (r.remaining > 0) issueMaterials(db, wo.id, suggestIssue(db, wo, r.itemId, r.remaining).picks);
};

describe("recipes", () => {
  const base = (ctx: ReturnType<typeof setup>): RecipeInput => ({
    name: "Kursi jati (potong efisien)",
    type: "produksi",
    inputs: [{ itemId: ctx.wood.id, qty: 0.03 }],
    outputs: [{ itemId: ctx.chair.id, qty: 1 }],
    laborHours: 2,
    expectedRemnantPct: 10,
  });

  it("rejects recipes that cannot work", () => {
    const ctx = setup();
    const { db } = ctx;
    rejects(db, (d) => createRecipe(d, { ...base(ctx), inputs: [] }), /input material/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), outputs: [] }), /at least one output/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), inputs: [{ itemId: ctx.wood.id, qty: Number.NaN }] }), /more than 0/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), inputs: [{ itemId: ctx.wood.id, qty: 1 }, { itemId: ctx.wood.id, qty: 2 }] }), /twice/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), inputs: [{ itemId: ctx.chair.id, qty: 1 }] }), /both an input and an output/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), outputs: [{ itemId: ctx.chair.id, qty: 1, sharePct: 60 }, { itemId: ctx.stool.id, qty: 1, sharePct: 30 }] }), /100%/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), outputs: [{ itemId: ctx.chair.id, qty: 1, sharePct: 100 }, { itemId: ctx.stool.id, qty: 1 }] }), /set it for every output/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), expectedRemnantPct: 60, expectedWastePct: 40 }), /must be under 100%/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), type: "gabung", outputs: [{ itemId: ctx.chair.id, qty: 1 }, { itemId: ctx.stool.id, qty: 1 }] }), /exactly one/);
    rejects(db, (d) => createRecipe(d, { ...base(ctx), name: " " }), /name/i);
  });

  it("replaces the BOM and scales by batch", () => {
    const ctx = setup();
    const r = createRecipe(ctx.db, base(ctx));
    const wo = createWorkOrderFromRecipe(ctx.db, r.id, { batches: 3 });
    expect(wo).toMatchObject({ recipeId: r.id, batches: 3, laborHours: 6, title: "Kursi jati (potong efisien) ×3" });
    // 3 × 0.03 from the recipe, not 3 × 0.02 from the chair's BOM.
    expect(requirements(ctx.db, wo).map((q) => [q.itemId, q.required])).toEqual([[ctx.wood.id, 0.09]]);
    rejects(ctx.db, (d) => createWorkOrderFromRecipe(d, r.id, { batches: 0 }), /batch/);
  });

  it("estimates standard cost with the expected offcut credited back", () => {
    const ctx = setup();
    const r = createRecipe(ctx.db, base(ctx));
    const c = recipeCost(ctx.db, r, 2);
    expect(c.material).toBe(600_000);
    expect(c.remnantCredit).toBe(60_000);
    expect(c.labor).toBe(40_000);
    expect(c.outputs[0]).toMatchObject({ qty: 2, total: 580_000, unitCost: 290_000 });
  });

  it("splits cost by the recipe's fixed shares and reports how runs compare", () => {
    const ctx = setup();
    const r = createRecipe(ctx.db, {
      name: "Papan → kursi + bangku",
      type: "produksi",
      inputs: [{ itemId: ctx.wood.id, qty: 0.05 }],
      outputs: [
        { itemId: ctx.chair.id, qty: 1, sharePct: 70 },
        { itemId: ctx.stool.id, qty: 1, sharePct: 30 },
      ],
      laborHours: 0,
    });
    const wo = createWorkOrderFromRecipe(ctx.db, r.id, { batches: 2 });
    issueAll(ctx.db, wo);
    completeWorkOrder(ctx.db, wo.id, defaultCompletion(ctx.db, wo));
    const done = ctx.db.workOrders.find((w) => w.id === wo.id)!;
    const byItem = new Map(done.cost!.outputs.map((o) => [o.itemId, o.allocated]));
    expect(byItem.get(ctx.chair.id)).toBe(700_000);
    expect(byItem.get(ctx.stool.id)).toBe(300_000);
    const perf = recipePerformance(ctx.db, r.id);
    expect(perf.runs).toHaveLength(1);
    expect(perf.avgYield).toBe(1);
    expect(perf.avgMaterialUse).toBeCloseTo(1, 5);
    // A recipe behind a work order is archived, not deleted.
    expect(removeRecipe(ctx.db, r.id)).toBe("archived");
  });

  it("makes a material producible and drives component orders in whole batches", () => {
    const ctx = setup();
    const { db, panel, glue, wood } = ctx;
    expect(isProducibleIn(db, panel)).toBe(false);
    const r = createRecipe(db, { name: "Laminasi panel", type: "gabung", inputs: [{ itemId: wood.id, qty: 0.04 }, { itemId: glue.id, qty: 0.5 }], outputs: [{ itemId: panel.id, qty: 2 }], laborHours: 1 });
    expect(isProducibleIn(db, panel)).toBe(true);
    // A dismantling recipe that yields timber does not make timber something to "produce".
    createRecipe(db, { name: "Bongkar kursi", type: "dekonstruksi", inputs: [{ itemId: ctx.chair.id, qty: 1 }], outputs: [{ itemId: wood.id, qty: 0.01 }] });
    expect(isProducibleIn(db, wood)).toBe(false);
    const cabinet = createItem(db, { name: "Lemari", kind: "product", category: "lemari", uom: "pcs", standardCost: 0, bom: [{ materialId: panel.id, qty: 3 }] });
    const parent = createWorkOrder(db, { type: "produksi", title: "Lemari", plannedOutputs: [{ itemId: cabinet.id, qty: 1 }] });
    const [child] = createComponentOrders(db, parent.id);
    // 3 panels needed, 2 per batch → 2 batches.
    expect(child).toMatchObject({ recipeId: r.id, batches: 2, type: "gabung", parentWoId: parent.id });
    expect(child!.plannedOutputs[0]!.qty).toBe(4);
  });
});

describe("merge", () => {
  it("assembles a dining set from stock and carries their full cost", () => {
    const ctx = setup();
    const { db, chair, table, set } = ctx;
    const wo = createWorkOrder(db, {
      type: "gabung",
      title: "Set makan",
      plannedOutputs: [{ itemId: set.id, qty: 1 }],
      plannedInputs: [
        { itemId: table.id, qty: 1 },
        { itemId: chair.id, qty: 4 },
      ],
      laborHours: 1,
      overhead: 0,
    });
    expect(wo.stages.map((s) => s.name)).toEqual(["Prepare parts", "Join", "QC"]);
    issueAll(db, wo);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: set.id, qty: 1 }], returns: [] });
    const setLot = db.lots.find((l) => l.itemId === set.id)!;
    expect(setLot.unitCost).toBe(1_500_000 + 4 * 400_000 + 10_000);
    expect(sum(db.lots.filter((l) => l.itemId === chair.id).map((l) => l.qty))).toBe(2);
  });

  it("rejects merges that are not merges", () => {
    const ctx = setup();
    const { db, chair, table, set, stool } = ctx;
    const plan = (o: { itemId: ID; qty: number }[], i: { itemId: ID; qty: number }[]) => (d: Db) =>
      createWorkOrder(d, { type: "gabung", title: "x", plannedOutputs: o, plannedInputs: i });
    rejects(db, plan([{ itemId: set.id, qty: 1 }, { itemId: stool.id, qty: 1 }], [{ itemId: table.id, qty: 1 }, { itemId: chair.id, qty: 1 }]), /exactly one/);
    rejects(db, plan([{ itemId: set.id, qty: 1 }], [{ itemId: table.id, qty: 1 }]), /at least two/);
    rejects(db, plan([{ itemId: set.id, qty: 1 }], [{ itemId: set.id, qty: 1 }, { itemId: chair.id, qty: 1 }]), /its own/);
    rejects(db, plan([{ itemId: set.id, qty: 1 }], []), /source item/);
  });

  it("merges offcut lots into one at weighted cost, keeping the ledger whole", () => {
    const ctx = setup();
    const { db, wood } = ctx;
    const a = addOpeningStock(db, { itemId: wood.id, qty: 0.01, unitCost: 9_000_000, isRemnant: true });
    const b = addOpeningStock(db, { itemId: wood.id, qty: 0.03, unitCost: 11_000_000, isRemnant: true });
    const merged = mergeLots(db, [a.id, b.id], { location: "Workshop", dimensions: { length: 1200, width: 300, thickness: 30 } });
    expect(merged).toMatchObject({ qty: 0.04, unitCost: 10_500_000, isRemnant: true, origin: "gabung", location: "Workshop", mergedFrom: [a.id, b.id] });
    expect(merged.createdAt).toBe(a.createdAt);
    for (const lot of db.lots) {
      const moved = sum(db.moves.filter((m) => m.lotId === lot.id).map((m) => m.qty));
      expect(moved).toBeCloseTo(lot.qty, 6);
    }
  });

  it("refuses merges across items, kinds of stock, statuses and unknown places", () => {
    const ctx = setup();
    const { db, wood, glue } = ctx;
    const r1 = addOpeningStock(db, { itemId: wood.id, qty: 0.01, unitCost: 1, isRemnant: true });
    const r2 = addOpeningStock(db, { itemId: wood.id, qty: 0.01, unitCost: 1, isRemnant: true });
    const regular = db.lots.find((l) => l.itemId === wood.id && !l.isRemnant)!;
    const glueLot = db.lots.find((l) => l.itemId === glue.id)!;
    rejects(db, (d) => mergeLots(d, [r1.id]), /at least two/);
    rejects(db, (d) => mergeLots(d, [r1.id, r1.id]), /at least two/);
    rejects(db, (d) => mergeLots(d, [r1.id, glueLot.id]), /same item/);
    rejects(db, (d) => mergeLots(d, [r1.id, regular.id]), /Offcuts cannot/);
    rejects(db, (d) => mergeLots(d, [r1.id, r2.id], { location: "Loteng" }), /unknown/i);
  });
});

describe("process maps", () => {
  it("a closed work order conserves value and shows where its output went", () => {
    const ctx = setup();
    const { db, chair, wood, buyer } = ctx;
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 10 }], laborHours: 5 });
    issueAll(db, wo);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: 10 }], returns: [{ itemId: wood.id, kind: "sisa", qty: 0.02 }] });
    const so = createSalesOrder(db, { channel: "supply", customerId: buyer.id, date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 6, unitPrice: 1_000_000 }] });
    confirmSalesOrder(db, so.id);
    deliverSalesOrder(db, so.id, [{ itemId: chair.id, qty: 6 }]);

    const g = workOrderFlow(db, db.workOrders.find((w) => w.id === wo.id)!);
    const { into, out } = balance(g, `wo:${wo.id}`);
    expect(into).toBe(0.2 * 10_000_000 + 5 * 10_000);
    expect(out).toBeCloseTo(into, 0);
    expect(g.nodes.find((n) => n.id === `sisa:${wood.id}`)?.kind).toBe("sisa");
    expect(g.estimated).toBeFalsy();
    // Opening stock (6 chairs) sells first under FIFO, so these chairs are still in the warehouse.
    expect(g.nodes.some((n) => n.label === "In stock")).toBe(true);
    expect(Math.max(...g.nodes.map((n) => n.column))).toBe(3);
  });

  it("a plan with nothing issued is drawn at standard and marked as an estimate", () => {
    const ctx = setup();
    const wo = createWorkOrder(ctx.db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: ctx.chair.id, qty: 5 }], laborHours: 2 });
    const g = workOrderFlow(ctx.db, wo);
    expect(g.estimated).toBe(true);
    expect(g.links.every((l) => l.estimated)).toBe(true);
    const { into, out } = balance(g, `wo:${wo.id}`);
    expect(out).toBeCloseTo(into, 0);
  });

  it("a recipe map balances: material + labour = outputs + expected offcut", () => {
    const ctx = setup();
    const r = createRecipe(ctx.db, { name: "Kursi", type: "produksi", inputs: [{ itemId: ctx.wood.id, qty: 0.03 }], outputs: [{ itemId: ctx.chair.id, qty: 1 }], laborHours: 2, expectedRemnantPct: 10 });
    const g = recipeFlow(ctx.db, r, 4);
    const { into, out } = balance(g, "recipe");
    expect(into).toBe(4 * 300_000 + 8 * 10_000);
    expect(out).toBeCloseTo(into, 0);
  });

  it("traces a lot from its purchase to the products made from it and their sale", () => {
    const ctx = setup();
    const { db, chair, wood, buyer } = ctx;
    const woodLot = db.lots.find((l) => l.itemId === wood.id)!;
    // Use up the chairs already in stock so the new ones are the ones sold.
    const so0 = createSalesOrder(db, { channel: "supply", customerId: buyer.id, date: "2026-10-01", currency: "IDR", exchangeRate: 1, lines: [{ itemId: chair.id, qty: 6, unitPrice: 1 }] });
    confirmSalesOrder(db, so0.id);
    deliverSalesOrder(db, so0.id, [{ itemId: chair.id, qty: 6 }]);
    const wo = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 10 }], laborHours: 0 });
    issueAll(db, wo);
    completeWorkOrder(db, wo.id, { outputs: [{ itemId: chair.id, qty: 10 }], returns: [] });

    const up = lotTrace(db, woodLot.id);
    expect(up.nodes.find((n) => n.id === `lot:${woodLot.id}`)).toBeTruthy();
    expect(up.nodes.some((n) => n.id === `doc:${wo.id}`)).toBe(true);
    expect(up.nodes.some((n) => n.id === `out:${chair.id}`)).toBe(true);

    const chairLot = db.lots.find((l) => l.itemId === chair.id && l.originRef?.id === wo.id)!;
    const down = lotTrace(db, chairLot.id);
    const cols = new Map(down.nodes.map((n) => [n.id, n.column]));
    expect(cols.get(`in:${wood.id}`)).toBeLessThan(cols.get(`doc:${wo.id}`)!);
    expect(cols.get(`doc:${wo.id}`)).toBeLessThan(cols.get(`lot:${chairLot.id}`)!);
  });

  it("the workshop map balances production: in = out + work in progress", () => {
    const ctx = setup();
    const { db, chair } = ctx;
    const done = createWorkOrder(db, { type: "produksi", title: "Kursi", plannedOutputs: [{ itemId: chair.id, qty: 10 }], laborHours: 3 });
    issueAll(db, done);
    completeWorkOrder(db, done.id, { outputs: [{ itemId: chair.id, qty: 10 }], returns: [] });
    const open = createWorkOrder(db, { type: "produksi", title: "Kursi 2", plannedOutputs: [{ itemId: chair.id, qty: 5 }] });
    issueAll(db, open);
    const g = plantFlow(db);
    const { into, out } = balance(g, "prod");
    expect(out).toBeCloseTo(into, 0);
    const wip = g.links.find((l) => l.target === "out:wip");
    expect(wip?.value).toBeCloseTo(5 * 0.02 * 10_000_000, 0);
    expect(g.nodes.map((n) => n.column).every((c) => c >= 0 && c <= 4)).toBe(true);
  });
});
