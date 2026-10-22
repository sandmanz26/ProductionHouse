import { assert, assertAmount, EPS, getItem, getUsableItem, newId, nextCode, nowIso, roundMoney, roundQty, sum } from "./core";
import { allocationBasis, createWorkOrder, standardProductCost } from "./production";
import type { Db, ID, ISODate, Recipe, RecipeType, WorkOrder } from "./types";

export interface RecipeInput {
  name: string;
  type: RecipeType;
  inputs: { itemId: ID; qty: number; note?: string }[];
  outputs: { itemId: ID; qty: number; sharePct?: number }[];
  expectedRemnantPct?: number;
  expectedWastePct?: number;
  laborHours?: number;
  stages?: string[];
  note?: string;
}

export function getRecipe(db: Db, id: ID): Recipe {
  const r = db.recipes.find((x) => x.id === id);
  assert(r, "Resep tidak ditemukan.");
  return r;
}

function validateRecipe(db: Db, input: RecipeInput, keep?: ReadonlySet<ID>) {
  assert(input.name?.trim(), "Nama resep wajib diisi.");
  assert(["produksi", "konversi", "gabung", "dekonstruksi"].includes(input.type), "Jenis resep tidak dikenal.");
  assert(input.inputs.length > 0, "Tambahkan minimal satu bahan masuk.");
  assert(input.outputs.length > 0, "Tambahkan minimal satu hasil.");
  const inIds = new Set<ID>();
  for (const l of input.inputs) {
    const item = getUsableItem(db, l.itemId, keep);
    assert(Number.isFinite(l.qty) && l.qty > EPS, `Qty ${item.name} harus lebih dari 0.`);
    assert(!inIds.has(l.itemId), `${item.name} tercantum dua kali di bahan masuk.`);
    inIds.add(l.itemId);
  }
  const outIds = new Set<ID>();
  for (const o of input.outputs) {
    const item = getUsableItem(db, o.itemId, keep);
    assert(Number.isFinite(o.qty) && o.qty > EPS, `Qty hasil ${item.name} harus lebih dari 0.`);
    assert(!outIds.has(o.itemId), `${item.name} tercantum dua kali di hasil.`);
    assert(!inIds.has(o.itemId), `${item.name} tidak boleh menjadi bahan sekaligus hasil.`);
    outIds.add(o.itemId);
  }
  if (input.type === "gabung") {
    assert(input.outputs.length === 1, "Resep gabung menghasilkan tepat satu jenis barang.");
    assert(
      input.inputs.length >= 2 || sum(input.inputs.map((l) => l.qty)) >= 2 - EPS,
      "Resep gabung butuh minimal dua barang (atau dua unit) yang disatukan.",
    );
  }
  const shares = input.outputs.filter((o) => o.sharePct !== undefined);
  if (shares.length) {
    assert(shares.length === input.outputs.length, "Bila porsi biaya diisi, semua hasil harus diisi.");
    for (const o of shares) assertAmount(o.sharePct, "Porsi biaya");
    const total = sum(shares.map((o) => o.sharePct ?? 0));
    assert(Math.abs(total - 100) < 0.01, `Total porsi biaya harus 100% (sekarang ${roundQty(total)}%).`);
  }
  const remnant = input.expectedRemnantPct ?? 0;
  const waste = input.expectedWastePct ?? 0;
  assertAmount(remnant, "Perkiraan sisa");
  assertAmount(waste, "Perkiraan limbah");
  assert(remnant + waste < 100, "Perkiraan sisa + limbah harus di bawah 100%.");
  assertAmount(input.laborHours ?? 0, "Jam kerja");
}

function normalize(input: RecipeInput) {
  return {
    name: input.name.trim(),
    type: input.type,
    inputs: input.inputs.map((l) => ({ id: newId(), itemId: l.itemId, qty: roundQty(l.qty), note: l.note?.trim() || undefined })),
    outputs: input.outputs.map((o) => ({ id: newId(), itemId: o.itemId, qty: roundQty(o.qty), sharePct: o.sharePct })),
    expectedRemnantPct: input.expectedRemnantPct ?? 0,
    expectedWastePct: input.expectedWastePct ?? 0,
    laborHours: input.laborHours ?? 0,
    stages: (input.stages ?? []).map((s) => s.trim()).filter(Boolean),
    note: input.note?.trim() || undefined,
  };
}

export function createRecipe(db: Db, input: RecipeInput): Recipe {
  validateRecipe(db, input);
  const r: Recipe = { id: newId(), code: nextCode(db, "recipe"), createdAt: nowIso(), ...normalize(input) };
  db.recipes.push(r);
  return r;
}

export function updateRecipe(db: Db, id: ID, input: RecipeInput): Recipe {
  const r = getRecipe(db, id);
  validateRecipe(db, input, new Set([...r.inputs, ...r.outputs].map((l) => l.itemId)));
  Object.assign(r, normalize(input));
  return r;
}

/** Unused recipes are deleted; recipes behind a work order are archived to keep history readable. */
export function removeRecipe(db: Db, id: ID): "deleted" | "archived" {
  const r = getRecipe(db, id);
  if (db.workOrders.some((w) => w.recipeId === id)) {
    r.archived = true;
    return "archived";
  }
  db.recipes = db.recipes.filter((x) => x.id !== id);
  return "deleted";
}

export function restoreRecipe(db: Db, id: ID) {
  getRecipe(db, id).archived = false;
}

export interface RecipeCost {
  material: number;
  /** Value expected back as usable offcuts. */
  remnantCredit: number;
  labor: number;
  overhead: number;
  total: number;
  outputs: { itemId: ID; qty: number; share: number; total: number; unitCost: number }[];
}

/** Unit value of an input at standard: materials at replacement cost, products at standard HPP. */
export function standardValue(db: Db, itemId: ID): number {
  const item = getItem(db, itemId);
  if (item.standardCost > 0) return item.standardCost;
  return item.kind === "product" ? standardProductCost(db, item) : 0;
}

/** Standard cost of one run of the recipe × batches, split over its outputs. */
export function recipeCost(db: Db, recipe: Pick<Recipe, "inputs" | "outputs" | "laborHours" | "expectedRemnantPct">, batches = 1): RecipeCost {
  const material = roundMoney(sum(recipe.inputs.map((l) => l.qty * batches * standardValue(db, l.itemId))));
  const remnantCredit = roundMoney((material * (recipe.expectedRemnantPct ?? 0)) / 100);
  const hours = recipe.laborHours * batches;
  const labor = roundMoney(hours * db.settings.laborRatePerHour);
  const overhead = roundMoney(hours * db.settings.overheadPerLaborHour);
  const total = roundMoney(material - remnantCredit + labor + overhead);
  const manual = recipe.outputs.every((o) => o.sharePct !== undefined) && recipe.outputs.length > 0;
  let weights = recipe.outputs.map((o) => (manual ? (o.sharePct ?? 0) : o.qty * allocationBasis(getItem(db, o.itemId))));
  if (sum(weights) <= EPS) weights = recipe.outputs.map((o) => o.qty);
  const totalWeight = sum(weights) || 1;
  const outputs = recipe.outputs.map((o, i) => {
    const share = (weights[i] ?? 0) / totalWeight;
    const t = roundMoney(total * share);
    const qty = roundQty(o.qty * batches);
    return { itemId: o.itemId, qty, share, total: t, unitCost: qty > EPS ? roundMoney(t / qty) : 0 };
  });
  return { material, remnantCredit, labor, overhead, total, outputs };
}

/** Opens a work order that follows the recipe, scaled by the number of batches. */
export function createWorkOrderFromRecipe(
  db: Db,
  recipeId: ID,
  opts: { batches: number; title?: string; dueDate?: ISODate; salesOrderId?: ID; parentWoId?: ID; note?: string },
): WorkOrder {
  const r = getRecipe(db, recipeId);
  assert(!r.archived, `Resep ${r.name} sudah diarsipkan.`);
  assert(Number.isFinite(opts.batches) && opts.batches > EPS, "Jumlah batch harus lebih dari 0.");
  const b = opts.batches;
  return createWorkOrder(db, {
    type: r.type,
    title: opts.title?.trim() || `${r.name}${b !== 1 ? ` ×${roundQty(b)}` : ""}`,
    dueDate: opts.dueDate,
    salesOrderId: opts.salesOrderId,
    parentWoId: opts.parentWoId,
    plannedOutputs: r.outputs.map((o) => ({ itemId: o.itemId, qty: roundQty(o.qty * b) })),
    plannedInputs: r.inputs.map((l) => ({ itemId: l.itemId, qty: roundQty(l.qty * b) })),
    laborHours: roundQty(r.laborHours * b),
    stages: r.stages.length ? r.stages : undefined,
    note: opts.note ?? r.note,
    recipeId: r.id,
    batches: b,
  });
}

/** Active recipes that produce an item, best first (fewest other outputs). */
export function recipesFor(db: Db, itemId: ID): Recipe[] {
  return db.recipes
    .filter((r) => !r.archived && r.type !== "dekonstruksi" && r.outputs.some((o) => o.itemId === itemId))
    .sort((a, b) => a.outputs.length - b.outputs.length);
}

export interface RecipeRun {
  woId: ID;
  code: string;
  batches: number;
  plannedQty: number;
  actualQty: number;
  /** Actual output ÷ planned output. */
  yield: number;
  /** Net material used ÷ standard material (by value at standard). 1.05 = 5% over. */
  materialUse: number;
  remnantPct: number;
  unitCost: number;
  standardUnitCost: number;
}

/** How completed work orders made from the recipe compare with it. */
export function recipePerformance(db: Db, recipeId: ID): { runs: RecipeRun[]; avgYield: number; avgMaterialUse: number; avgRemnantPct: number } {
  const r = getRecipe(db, recipeId);
  const main = r.outputs[0];
  const runs: RecipeRun[] = [];
  for (const wo of db.workOrders) {
    if (wo.recipeId !== recipeId || wo.status !== "selesai" || !wo.cost || !main) continue;
    const b = wo.batches ?? 1;
    const plannedQty = roundQty(main.qty * b);
    const actualQty = roundQty(sum(wo.cost.outputs.filter((o) => o.itemId === main.itemId).map((o) => o.qty)));
    const stdMaterial = sum(r.inputs.map((l) => l.qty * b * standardValue(db, l.itemId)));
    const usedMaterial = sum(wo.cost.lines.map((l) => (l.issuedQty - l.returnedQty) * standardValue(db, l.itemId)));
    const issuedValue = sum(wo.cost.lines.map((l) => l.issuedValue));
    const std = recipeCost(db, r, b).outputs.find((o) => o.itemId === main.itemId);
    runs.push({
      woId: wo.id,
      code: wo.code,
      batches: b,
      plannedQty,
      actualQty,
      yield: plannedQty > EPS ? actualQty / plannedQty : 0,
      materialUse: stdMaterial > EPS ? usedMaterial / stdMaterial : 0,
      remnantPct: issuedValue > EPS ? (wo.cost.returnCredit / issuedValue) * 100 : 0,
      unitCost: wo.cost.outputs.find((o) => o.itemId === main.itemId)?.unitCost ?? 0,
      standardUnitCost: std?.unitCost ?? 0,
    });
  }
  const avg = (xs: number[]) => (xs.length ? sum(xs) / xs.length : 0);
  return {
    runs,
    avgYield: avg(runs.map((x) => x.yield)),
    avgMaterialUse: avg(runs.map((x) => x.materialUse)),
    avgRemnantPct: avg(runs.map((x) => x.remnantPct)),
  };
}
