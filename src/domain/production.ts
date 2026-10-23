import {
  assert,
  assertAmount,
  assertDimensions,
  createLot,
  EPS,
  findItem,
  freeQtyFor,
  getItem,
  getLot,
  getUsableItem,
  newId,
  returnToLot,
  nextCode,
  nowIso,
  recordMove,
  roundMoney,
  roundQty,
  suggestLots,
  sum,
  takeFromLot,
  type LotSuggestion,
} from "./core";
import { assertCostOrder, orderPicks } from "./costing";
import { createWorkOrderFromRecipe, recipesFor } from "./recipes";
import type {
  CostLine,
  CostSummary,
  Db,
  Dimensions,
  DocRef,
  ExtraCost,
  ID,
  ISODate,
  Item,
  LaborLog,
  Lot,
  OutputCost,
  OutputEntry,
  OutputGrade,
  OutputReceipt,
  ReturnEntry,
  ReturnKind,
  StageStatus,
  WoStage,
  WorkOrder,
  WorkOrderType,
} from "./types";

export const woRef = (wo: WorkOrder): DocRef => ({ type: "workOrder", id: wo.id, code: wo.code });

export const isOpenWo = (wo: WorkOrder) => wo.status === "rencana" || wo.status === "berjalan";

/** Items that can be the output of a production order: products, and materials with a BOM. */
export const isProducible = (item: Item) => item.kind === "product" || (item.bom?.length ?? 0) > 0;

/**
 * Like isProducible, but also counts materials an active recipe makes (e.g. a laminated panel).
 * Dismantling recipes don't count: recovered timber is a by-product, never something to plan for.
 */
export const isProducibleIn = (db: Pick<Db, "recipes">, item: Item) =>
  isProducible(item) || db.recipes.some((r) => !r.archived && r.type !== "dekonstruksi" && r.outputs.some((o) => o.itemId === item.id));

/** Merges and dismantling may output anything (a set, a laminated panel, recovered timber). */
const outputsUnrestricted = (type: WorkOrderType) => type === "dekonstruksi" || type === "gabung";

export function getWorkOrder(db: Db, id: ID): WorkOrder {
  const wo = db.workOrders.find((w) => w.id === id);
  assert(wo, "Work order not found.");
  return wo;
}

export interface WorkOrderInput {
  type: WorkOrderType;
  title: string;
  dueDate?: ISODate;
  salesOrderId?: ID;
  parentWoId?: ID;
  plannedOutputs: { itemId: ID; qty: number }[];
  plannedInputs?: { itemId: ID; qty: number; lotId?: ID }[];
  laborHours?: number;
  laborRate?: number;
  overhead?: number;
  extraCosts?: { label: string; amount: number }[];
  /** Stage names; defaults to the first output's route or the company default. */
  stages?: string[];
  note?: string;
  /** Set by createWorkOrderFromRecipe: the recipe's inputs replace the outputs' BOM. */
  recipeId?: ID;
  batches?: number;
}

/** Standard labour hours for the planned outputs (from item master data). */
export function standardLaborHours(db: Db, outputs: { itemId: ID; qty: number }[]): number {
  return roundQty(sum(outputs.map((o) => (findItem(db, o.itemId)?.laborHours ?? 0) * o.qty)));
}

function normalizeExtra(extra: WorkOrderInput["extraCosts"]): ExtraCost[] {
  return (extra ?? [])
    .filter((c) => c.label.trim() || c.amount)
    .map((c) => {
      assertAmount(c.amount, "Other cost");
      return { id: newId(), label: c.label.trim() || "Other cost", amount: c.amount };
    });
}

function validatePlan(db: Db, input: WorkOrderInput, keep?: ReadonlySet<ID>) {
  assert(input.title.trim(), "Enter a work order title.");
  if (input.laborHours !== undefined) assertAmount(input.laborHours, "Labour hours");
  if (input.laborRate !== undefined) assertAmount(input.laborRate, "Labour rate");
  if (input.overhead !== undefined) assertAmount(input.overhead, "Overhead");
  for (const o of input.plannedOutputs) {
    const item = getUsableItem(db, o.itemId, keep);
    assert(Number.isFinite(o.qty) && o.qty > EPS, `Output qty for ${item.name} must be more than 0.`);
    if (!outputsUnrestricted(input.type)) {
      assert(
        isProducibleIn(db, item),
        `${item.name} cannot be produced: only products, or materials with a recipe (component / processed material).`,
      );
    }
  }
  for (const i of input.plannedInputs ?? []) {
    // Inputs are existing stock (e.g. an archived product being dismantled), so archive is fine.
    const item = getItem(db, i.itemId);
    assert(Number.isFinite(i.qty) && i.qty > EPS, `Input qty for ${item.name} must be more than 0.`);
    if (i.lotId) assert(getLot(db, i.lotId).itemId === i.itemId, "Input lot does not match the item.");
  }
  if (input.type === "produksi") {
    assert(input.plannedOutputs.length > 0, "Choose the item to make.");
  }
  if (input.type === "konversi" || input.type === "gabung" || input.type === "dekonstruksi" || input.type === "perbaikan") {
    assert((input.plannedInputs ?? []).length > 0, "Choose the source item to process.");
  }
  if (input.type === "gabung") {
    const outputItems = new Set(input.plannedOutputs.map((o) => o.itemId));
    assert(outputItems.size === 1, "A merge makes exactly one kind of item.");
    const inputs = input.plannedInputs ?? [];
    // Two different things (table + chairs, timber + glue), or two units of one (two boards glued).
    assert(
      new Set(inputs.map((i) => i.itemId)).size >= 2 || sum(inputs.map((i) => i.qty)) >= 2 - EPS,
      "A merge needs at least two items (or two units) to join.",
    );
    assert(!inputs.some((i) => outputItems.has(i.itemId)), "The merged item cannot be one of its own inputs.");
  }
}

function defaultStageNames(db: Db, input: WorkOrderInput): string[] {
  if (input.stages) return input.stages;
  if (input.type === "perbaikan") return ["Repair", "QC"];
  if (input.type === "dekonstruksi") return ["Dismantle", "Sort materials"];
  if (input.type === "gabung") return ["Prepare parts", "Join", "QC"];
  const route = input.plannedOutputs.map((o) => findItem(db, o.itemId)?.stages).find((s) => s?.length);
  return route ?? db.settings.defaultStages ?? [];
}

const makeStages = (names: string[]): WoStage[] =>
  names
    .map((n) => n.trim())
    .filter(Boolean)
    .map((name) => ({ id: newId(), name, status: "menunggu" as const }));

export function createWorkOrder(db: Db, input: WorkOrderInput): WorkOrder {
  validatePlan(db, input);
  const laborHours = input.laborHours ?? standardLaborHours(db, input.plannedOutputs);
  const wo: WorkOrder = {
    id: newId(),
    code: nextCode(db, "workOrder"),
    type: input.type,
    status: "rencana",
    title: input.title.trim(),
    createdAt: nowIso(),
    dueDate: input.dueDate,
    salesOrderId: input.salesOrderId,
    parentWoId: input.parentWoId,
    plannedOutputs: input.plannedOutputs.map((o) => ({ id: newId(), itemId: o.itemId, qty: o.qty })),
    plannedInputs: (input.plannedInputs ?? []).map((i) => ({ id: newId(), itemId: i.itemId, qty: i.qty, lotId: i.lotId })),
    issues: [],
    returns: [],
    outputs: [],
    laborHours,
    laborRate: input.laborRate ?? db.settings.laborRatePerHour,
    overhead: input.overhead ?? roundMoney(laborHours * db.settings.overheadPerLaborHour),
    extraCosts: normalizeExtra(input.extraCosts),
    stages: makeStages(defaultStageNames(db, input)),
    laborLogs: [],
    receipts: [],
    note: input.note,
    recipeId: input.recipeId,
    batches: input.batches,
  };
  db.workOrders.push(wo);
  return wo;
}

export type WorkOrderPatch = Partial<
  Pick<WorkOrderInput, "title" | "dueDate" | "laborHours" | "laborRate" | "overhead" | "extraCosts" | "note">
> & {
  plannedOutputs?: { itemId: ID; qty: number }[];
  plannedInputs?: { itemId: ID; qty: number; lotId?: ID }[];
};

export function updateWorkOrder(db: Db, id: ID, patch: WorkOrderPatch): WorkOrder {
  const wo = getWorkOrder(db, id);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  if (patch.plannedOutputs || patch.plannedInputs) {
    validatePlan(
      db,
      {
        type: wo.type,
        title: patch.title ?? wo.title,
        plannedOutputs: patch.plannedOutputs ?? wo.plannedOutputs,
        plannedInputs: patch.plannedInputs ?? wo.plannedInputs,
      },
      new Set(wo.plannedOutputs.map((o) => o.itemId)),
    );
  }
  if (patch.title !== undefined) {
    assert(patch.title.trim(), "Enter a work order title.");
    wo.title = patch.title.trim();
  }
  if (patch.dueDate !== undefined) wo.dueDate = patch.dueDate || undefined;
  if (patch.note !== undefined) wo.note = patch.note;
  if (patch.laborHours !== undefined) {
    assertAmount(patch.laborHours, "Labour hours");
    wo.laborHours = patch.laborHours;
  }
  if (patch.laborRate !== undefined) {
    assertAmount(patch.laborRate, "Labour rate");
    wo.laborRate = patch.laborRate;
  }
  if (patch.overhead !== undefined) {
    assertAmount(patch.overhead, "Overhead");
    wo.overhead = patch.overhead;
  }
  if (patch.extraCosts) wo.extraCosts = normalizeExtra(patch.extraCosts);
  if (patch.plannedOutputs) wo.plannedOutputs = patch.plannedOutputs.map((o) => ({ id: newId(), ...o }));
  if (patch.plannedInputs) wo.plannedInputs = patch.plannedInputs.map((i) => ({ id: newId(), ...i }));
  return wo;
}

// ------------------------------------------------------------------ Requirements (MRP)

export interface Requirement {
  itemId: ID;
  /** Standard requirement for the plan (BOM × qty + planned inputs). */
  required: number;
  issued: number;
  /** Still to be issued (never negative). */
  remaining: number;
  /** Free stock for this work order (own reservations + unreserved). */
  free: number;
  freeRemnant: number;
  reservedForThis: number;
  shortage: number;
  /** Specific lot requested by the plan, e.g. the damaged unit to repair. */
  lotId?: ID;
  /** Shortage can be produced in-house (the item has its own BOM). */
  producible: boolean;
  /** Quantity already planned in open component orders for this order. */
  inComponentOrders: number;
}

/** Standard material requirement derived from the plan (one BOM level). */
export function plannedRequirement(db: Db, wo: Pick<WorkOrder, "type" | "plannedOutputs" | "plannedInputs" | "recipeId">) {
  const req = new Map<ID, { qty: number; lotId?: ID }>();
  const add = (itemId: ID, qty: number, lotId?: ID) => {
    const cur = req.get(itemId);
    req.set(itemId, { qty: (cur?.qty ?? 0) + qty, lotId: cur?.lotId ?? lotId });
  };
  // A recipe lists its inputs explicitly; the products' BOM would count them twice.
  if (wo.type === "produksi" && !wo.recipeId) {
    for (const o of wo.plannedOutputs) {
      for (const b of findItem(db, o.itemId)?.bom ?? []) add(b.materialId, b.qty * o.qty);
    }
  }
  for (const i of wo.plannedInputs) add(i.itemId, i.qty, i.lotId);
  return req;
}

export function requirements(db: Db, wo: WorkOrder): Requirement[] {
  const planned = plannedRequirement(db, wo);
  const issuedBy = new Map<ID, number>();
  for (const i of wo.issues) issuedBy.set(i.itemId, (issuedBy.get(i.itemId) ?? 0) + i.qty);
  const children = db.workOrders.filter((w) => w.parentWoId === wo.id && isOpenWo(w));
  const ids = new Set<ID>([...planned.keys(), ...issuedBy.keys()]);
  return [...ids].map((itemId) => {
    const p = planned.get(itemId);
    const required = roundQty(p?.qty ?? 0);
    const issued = roundQty(issuedBy.get(itemId) ?? 0);
    const remaining = Math.max(0, roundQty(required - issued));
    const lots = db.lots.filter(
      (l) => l.itemId === itemId && l.status === "tersedia" && l.qty > EPS && (!l.reservedForWo || l.reservedForWo === wo.id),
    );
    let free = freeQtyFor(db, itemId, wo.id);
    if (p?.lotId) {
      // A specific (possibly damaged) unit is requested — it counts as available for this WO.
      const lot = db.lots.find((l) => l.id === p.lotId);
      if (lot && lot.status === "rusak") free += lot.qty;
    }
    const item = findItem(db, itemId);
    const inComponentOrders = roundQty(
      sum(children.flatMap((c) => c.plannedOutputs.filter((o) => o.itemId === itemId).map((o) => o.qty))) -
        sum(children.flatMap((c) => c.receipts.filter((r) => r.itemId === itemId).map((r) => r.qty))),
    );
    return {
      itemId,
      required,
      issued,
      remaining,
      free: roundQty(free),
      freeRemnant: roundQty(sum(lots.filter((l) => l.isRemnant).map((l) => l.qty))),
      reservedForThis: roundQty(sum(lots.filter((l) => l.reservedForWo === wo.id).map((l) => l.qty))),
      shortage: Math.max(0, roundQty(remaining - free)),
      lotId: p?.lotId,
      producible: !!item && item.kind === "material" && isProducibleIn(db, item),
      inComponentOrders: Math.max(0, inComponentOrders),
    };
  });
}

/**
 * Multi-level planning: for every component (material with its own BOM) that is short, create a
 * child production order. Raw materials stay as purchase suggestions.
 */
export function createComponentOrders(db: Db, woId: ID): WorkOrder[] {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  const todo = requirements(db, wo).filter((r) => r.producible && r.shortage - r.inComponentOrders > EPS);
  assert(todo.length > 0, "No components need producing.");
  return todo.map((r) => {
    const item = getItem(db, r.itemId);
    const qty = roundQty(r.shortage - r.inComponentOrders);
    const title = `${item.name} for ${wo.code}`;
    // No BOM of its own: follow the item's recipe, in whole batches.
    const recipe = item.bom?.length ? undefined : recipesFor(db, item.id)[0];
    const perBatch = recipe?.outputs.find((o) => o.itemId === item.id)?.qty ?? 0;
    if (recipe && perBatch > EPS) {
      return createWorkOrderFromRecipe(db, recipe.id, {
        batches: Math.ceil(qty / perBatch - EPS),
        title,
        parentWoId: wo.id,
        salesOrderId: wo.salesOrderId,
        dueDate: wo.dueDate,
      });
    }
    return createWorkOrder(db, {
      type: "produksi",
      title,
      plannedOutputs: [{ itemId: r.itemId, qty }],
      parentWoId: wo.id,
      salesOrderId: wo.salesOrderId,
      dueDate: wo.dueDate,
    });
  });
}

// ------------------------------------------------------------------ Execution

export function startWorkOrder(db: Db, id: ID, at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, id);
  assert(wo.status === "rencana", `Work order ${wo.code} is not in Planned status.`);
  wo.status = "berjalan";
  wo.startedAt = at;
  return wo;
}

function ensureRunning(db: Db, wo: WorkOrder, at: string) {
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  if (wo.status === "rencana") startWorkOrder(db, wo.id, at);
}

/** Moves a stage forward (or back). Starting any stage starts the order. */
export function setStageStatus(db: Db, woId: ID, stageId: ID, status: StageStatus, at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, woId);
  const stage = wo.stages.find((s) => s.id === stageId);
  assert(stage, "Stage not found.");
  if (status !== "menunggu") ensureRunning(db, wo, at);
  else assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  stage.status = status;
  if (status === "menunggu") {
    stage.startedAt = undefined;
    stage.doneAt = undefined;
  } else {
    stage.startedAt ??= at;
    stage.doneAt = status === "selesai" ? at : undefined;
  }
  return wo;
}

/** Current stage = first stage not yet done. */
export function currentStage(wo: WorkOrder): WoStage | undefined {
  return wo.stages.find((s) => s.status !== "selesai");
}

export function stageProgress(wo: WorkOrder): number {
  if (!wo.stages.length) return wo.status === "selesai" ? 1 : 0;
  const done = wo.stages.filter((s) => s.status === "selesai").length;
  const inProgress = wo.stages.filter((s) => s.status === "proses").length;
  return (done + inProgress * 0.5) / wo.stages.length;
}

export interface LaborLogInput {
  stageId?: ID;
  worker: string;
  hours?: number;
  rate?: number;
  pieces?: number;
  pieceRate?: number;
  note?: string;
  at?: string;
}

/** Books labour: hours × rate (day rate) and/or pieces × piece rate. */
export function addLaborLog(db: Db, woId: ID, input: LaborLogInput): LaborLog {
  const wo = getWorkOrder(db, woId);
  const at = input.at ?? nowIso();
  const hours = input.hours ?? 0;
  const pieces = input.pieces ?? 0;
  const rate = input.rate ?? wo.laborRate;
  const pieceRate = input.pieceRate ?? 0;
  assert(input.worker.trim(), "Enter the worker or team name.");
  assert(hours >= 0 && pieces >= 0 && rate >= 0 && pieceRate >= 0, "Hours, pieces and rates cannot be negative.");
  assert(hours > 0 || pieces > 0, "Enter labour hours or a piece count.");
  if (pieces > 0) assert(pieceRate > 0, "Enter the piece rate per unit.");
  if (input.stageId) assert(wo.stages.some((s) => s.id === input.stageId), "Stage not found.");
  ensureRunning(db, wo, at);
  const log: LaborLog = {
    id: newId(),
    at,
    stageId: input.stageId,
    worker: input.worker.trim(),
    hours,
    rate,
    pieces,
    pieceRate,
    note: input.note,
  };
  wo.laborLogs.push(log);
  if (input.stageId) {
    const stage = wo.stages.find((s) => s.id === input.stageId)!;
    if (stage.status === "menunggu") {
      stage.status = "proses";
      stage.startedAt = at;
    }
  }
  return log;
}

export function removeLaborLog(db: Db, woId: ID, logId: ID) {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  assert(wo.laborLogs.some((l) => l.id === logId), "Labour log entry not found.");
  wo.laborLogs = wo.laborLogs.filter((l) => l.id !== logId);
  return true;
}

export const laborLogCost = (l: LaborLog) => l.hours * l.rate + l.pieces * l.pieceRate;

/** Labour cost: logged work when any exists, otherwise the plan (hours × rate). */
export function laborCostOf(wo: Pick<WorkOrder, "laborLogs" | "laborHours" | "laborRate">) {
  if (wo.laborLogs.length) {
    return { amount: roundMoney(sum(wo.laborLogs.map(laborLogCost))), hours: sum(wo.laborLogs.map((l) => l.hours)), fromLogs: true };
  }
  return { amount: roundMoney(wo.laborHours * wo.laborRate), hours: wo.laborHours, fromLogs: false };
}

/** Statuses a lot may have to be consumed by this kind of work order. */
function issuableStatuses(wo: WorkOrder, lot: Lot): Lot["status"][] {
  const plannedLot = wo.plannedInputs.some((i) => i.lotId === lot.id);
  // Damaged units may be repaired, converted or dismantled.
  return wo.type !== "produksi" || plannedLot ? ["tersedia", "rusak"] : ["tersedia"];
}

export function issueMaterials(db: Db, woId: ID, picks: { lotId: ID; qty: number }[], at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  const valid = picks.filter((p) => p.qty > EPS);
  assert(valid.length > 0, "No materials to issue.");
  ensureRunning(db, wo, at);
  const ref = woRef(wo);
  const plannedLotIds = new Set(wo.plannedInputs.map((i) => i.lotId).filter(Boolean));
  for (const pick of orderPicks(db, valid)) {
    const lot = getLot(db, pick.lotId);
    assert(
      !lot.reservedForWo || lot.reservedForWo === wo.id,
      `Lot ${lot.code} is reserved for another work order.`,
    );
    assert(!lot.receiptId || !wo.receipts.some((r) => r.id === lot.receiptId), "Output of this work order cannot be used as its own material.");
    // The unit named in the plan (the chair to repair or dismantle) is specific by definition.
    if (!plannedLotIds.has(lot.id)) assertCostOrder(db, lot.id);
    takeFromLot(db, lot.id, pick.qty, "keluar_produksi", ref, { at, allowStatus: issuableStatuses(wo, lot) });
    wo.issues.push({ id: newId(), lotId: lot.id, itemId: lot.itemId, qty: roundQty(pick.qty), unitCost: lot.unitCost, at });
  }
  return wo;
}

/**
 * Lot suggestion for issuing `qty` of an item to a work order. A lot named in the plan (e.g.
 * the damaged unit to repair) is always used first; otherwise reserved → remnant → FIFO.
 */
export function suggestIssue(db: Db, wo: WorkOrder, itemId: ID, qty: number, useRemnants = true): LotSuggestion {
  const planned = wo.plannedInputs.find((i) => i.itemId === itemId && i.lotId);
  const plannedLot = planned?.lotId ? db.lots.find((l) => l.id === planned.lotId && l.qty > EPS) : undefined;
  if (plannedLot) {
    const take = roundQty(Math.min(plannedLot.qty, qty));
    const rest = suggestLots(db, itemId, roundQty(qty - take), {
      workOrderId: wo.id,
      excludeLotIds: [plannedLot.id],
      useRemnants,
    });
    return {
      picks: [
        { lotId: plannedLot.id, qty: take, unitCost: plannedLot.unitCost, isRemnant: plannedLot.isRemnant, reserved: false },
        ...rest.picks,
      ],
      shortage: rest.shortage,
      remnantQty: rest.remnantQty + (plannedLot.isRemnant ? take : 0),
    };
  }
  return suggestLots(db, itemId, qty, { workOrderId: wo.id, useRemnants });
}

/** Undo (part of) an issue before completion — the material goes back to its lot. */
export function unissue(db: Db, woId: ID, issueId: ID, qty: number, at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  const issue = wo.issues.find((i) => i.id === issueId);
  assert(issue, "Issue record not found.");
  assert(qty > EPS && qty <= issue.qty + EPS, "Return qty is more than was issued.");
  returnToLot(db, getLot(db, issue.lotId), qty, issue.unitCost, { type: "kembali_produksi", ref: woRef(wo), at });
  issue.qty = roundQty(issue.qty - qty);
  if (issue.qty <= EPS) wo.issues = wo.issues.filter((i) => i.id !== issueId);
  return wo;
}

// ------------------------------------------------------------------ Partial output

/** Provisional unit cost for partial output: standard cost of the item. */
export function provisionalUnitCost(db: Pick<Db, "items" | "settings">, item: Item): number {
  if (item.standardCost > 0) return item.standardCost;
  return standardProductCost(db, item);
}

export function receivedQty(wo: WorkOrder, itemId?: ID) {
  return roundQty(sum(wo.receipts.filter((r) => !itemId || r.itemId === itemId).map((r) => r.qty)));
}

/**
 * Receives finished units before the order is closed (e.g. ship 12 of 24 chairs now). The lot is
 * valued at standard cost; on completion it is revalued to actual cost and the difference on units
 * already sold is reported as cost variance.
 */
export function receiveOutput(
  db: Db,
  woId: ID,
  input: { itemId: ID; qty: number; grade?: OutputGrade; at?: string; location?: string; dimensions?: Dimensions },
): OutputReceipt {
  const wo = getWorkOrder(db, woId);
  const at = input.at ?? nowIso();
  const item = getItem(db, input.itemId);
  assert(input.qty > EPS, "Output qty must be more than 0.");
  assert(wo.type !== "dekonstruksi", "Dismantling output is recorded when the work order is completed.");
  assert(
    wo.plannedOutputs.some((o) => o.itemId === item.id),
    `${item.name} is not a planned output of ${wo.code}.`,
  );
  assertDimensions(input.dimensions);
  const planned = sum(wo.plannedOutputs.filter((o) => o.itemId === item.id).map((o) => o.qty));
  const already = receivedQty(wo, item.id);
  assert(
    already + input.qty <= planned + EPS,
    `Partial output of ${item.name} is more than planned (${roundQty(already)} of ${roundQty(planned)} already received). Record the rest when the work order is completed.`,
  );
  ensureRunning(db, wo, at);
  const unitCost = provisionalUnitCost(db, item);
  const receiptId = newId();
  const ref = woRef(wo);
  const grade = input.grade ?? "baik";
  const lot = createLot(db, {
    itemId: item.id,
    qty: input.qty,
    unitCost,
    origin: "produksi",
    originRef: ref,
    isRemnant: false,
    dimensions: input.dimensions,
    location: input.location || db.settings.defaultLocation,
    status: grade === "reject" ? "rusak" : "tersedia",
    receiptId,
    createdAt: at,
    note: "Partial output — provisional cost",
  });
  recordMove(db, { lot, qty: lot.qty, type: "masuk_produksi", ref, at, note: "Partial output (provisional cost)" });
  const receipt: OutputReceipt = { id: receiptId, at, itemId: item.id, qty: roundQty(input.qty), grade, provisionalUnitCost: unitCost, lotId: lot.id };
  wo.receipts.push(receipt);
  return receipt;
}

// ------------------------------------------------------------------ Costing

export interface CompletionInput {
  outputs: { itemId: ID; qty: number; sharePct?: number; dimensions?: Dimensions; grade?: OutputGrade }[];
  returns: { itemId: ID; kind: ReturnKind; qty: number; lotId?: ID; dimensions?: Dimensions; salvageValue?: number; note?: string }[];
  laborHours?: number;
  laborRate?: number;
  overhead?: number;
  extraCosts?: { label: string; amount: number }[];
}

/** Valuation basis per unit used to weight joint-cost allocation. */
export function allocationBasis(item: Item): number {
  if (item.kind === "product") return item.salePrice || item.standardCost || 0;
  return item.standardCost || 0;
}

/** Remaining quantity of a partial receipt still in stock (follows lot splits). */
function receiptRemaining(db: Db, receiptId: ID) {
  return roundQty(sum(db.lots.filter((l) => l.receiptId === receiptId).map((l) => l.qty)));
}

/**
 * Pure job-cost calculation for a work order and a proposed completion. Throws on invalid input,
 * so it doubles as validation for the completion form (live preview).
 */
export function computeCost(db: Db, wo: WorkOrder, input: CompletionInput): CostSummary {
  const outputs = input.outputs.filter((o) => o.qty > EPS);
  const returns = input.returns.filter((r) => r.qty > EPS || (r.salvageValue ?? 0) > 0);
  assert(wo.issues.length > 0, "No materials have been issued to this work order yet.");
  assert(outputs.length > 0 || wo.receipts.length > 0, "Enter at least one output.");
  for (const o of input.outputs) {
    const item = getItem(db, o.itemId);
    assert(Number.isFinite(o.qty) && o.qty >= 0, `Output qty for ${item.name} is not valid.`);
    if (o.sharePct !== undefined) assertAmount(o.sharePct, `Cost share for ${item.name}`);
    assertDimensions(o.dimensions);
    if (!outputsUnrestricted(wo.type) && o.qty > EPS) {
      assert(isProducibleIn(db, item), `${item.name} cannot be produced: choose a product, or a material with a recipe.`);
    }
  }
  for (const r of input.returns) {
    assert(Number.isFinite(r.qty), "Return qty must be a number.");
    assertDimensions(r.dimensions);
  }

  const byItem = new Map<ID, CostLine>();
  for (const iss of wo.issues) {
    const line =
      byItem.get(iss.itemId) ??
      ({
        itemId: iss.itemId,
        issuedQty: 0,
        issuedValue: 0,
        returnedQty: 0,
        returnedValue: 0,
        scrapQty: 0,
        scrapValue: 0,
        netQty: 0,
        netValue: 0,
        avgUnitCost: 0,
        standardQty: 0,
      } satisfies CostLine);
    line.issuedQty += iss.qty;
    line.issuedValue += iss.qty * iss.unitCost;
    byItem.set(iss.itemId, line);
  }
  for (const line of byItem.values()) {
    line.avgUnitCost = line.issuedQty > EPS ? line.issuedValue / line.issuedQty : 0;
  }
  const planned = plannedRequirement(db, wo);
  for (const [itemId, p] of planned) {
    const line = byItem.get(itemId);
    if (line) line.standardQty = roundQty(p.qty);
  }

  // Returns: whole material back to its lot, usable offcuts as remnant lots, waste with salvage.
  const returnedPerLot = new Map<ID, number>();
  for (const r of returns) {
    const item = getItem(db, r.itemId);
    const line = byItem.get(r.itemId);
    assert(line, `${item.name} was never issued to this work order, so it cannot be returned.`);
    assert(r.qty >= 0, "Return qty cannot be negative.");
    if (r.kind === "utuh") {
      const lotId = r.lotId ?? largestIssueLot(wo, r.itemId);
      const issuedFromLot = sum(wo.issues.filter((i) => i.lotId === lotId).map((i) => i.qty));
      const already = returnedPerLot.get(lotId) ?? 0;
      assert(
        r.qty + already <= issuedFromLot + EPS,
        `Whole return of ${item.name} is more than was issued from that lot.`,
      );
      returnedPerLot.set(lotId, already + r.qty);
      const unitCost = wo.issues.find((i) => i.lotId === lotId)?.unitCost ?? line.avgUnitCost;
      line.returnedQty += r.qty;
      line.returnedValue += r.qty * unitCost;
    } else if (r.kind === "sisa") {
      line.returnedQty += r.qty;
      line.returnedValue += r.qty * line.avgUnitCost;
    } else {
      const salvage = r.salvageValue ?? 0;
      assert(salvage >= 0, "Salvage value cannot be negative.");
      line.scrapQty += r.qty;
      line.scrapValue += salvage;
    }
  }

  for (const line of byItem.values()) {
    const item = getItem(db, line.itemId);
    assert(
      line.returnedQty + line.scrapQty <= line.issuedQty + EPS,
      `Total offcuts/waste of ${item.name} (${roundQty(line.returnedQty + line.scrapQty)}) is more than was issued (${roundQty(line.issuedQty)}).`,
    );
    assert(
      line.returnedValue + line.scrapValue <= line.issuedValue + 0.01,
      `Offcut + waste value of ${item.name} is more than the value of material issued.`,
    );
    line.netQty = roundQty(line.issuedQty - line.returnedQty);
    line.netValue = roundMoney(line.issuedValue - line.returnedValue - line.scrapValue);
    line.issuedQty = roundQty(line.issuedQty);
    line.returnedQty = roundQty(line.returnedQty);
    line.scrapQty = roundQty(line.scrapQty);
    line.issuedValue = roundMoney(line.issuedValue);
    line.returnedValue = roundMoney(line.returnedValue);
    line.scrapValue = roundMoney(line.scrapValue);
    line.avgUnitCost = roundMoney(line.avgUnitCost);
  }

  const lines = [...byItem.values()];
  const materialGross = roundMoney(sum(lines.map((l) => l.issuedValue)));
  const returnCredit = roundMoney(sum(lines.map((l) => l.returnedValue)));
  const scrapRecovery = roundMoney(sum(lines.map((l) => l.scrapValue)));
  const materialNet = roundMoney(materialGross - returnCredit - scrapRecovery);
  const laborHours = input.laborHours ?? wo.laborHours;
  const laborRate = input.laborRate ?? wo.laborRate;
  assertAmount(laborHours, "Labour hours");
  assertAmount(laborRate, "Labour rate");
  const laborInfo = laborCostOf({ laborLogs: wo.laborLogs, laborHours, laborRate });
  const labor = laborInfo.amount;
  assertAmount(input.overhead ?? wo.overhead, "Overhead");
  const overhead = roundMoney(input.overhead ?? wo.overhead);
  const extraList = input.extraCosts ?? wo.extraCosts;
  for (const c of extraList) assertAmount(c.amount, "Other cost");
  const extra = roundMoney(sum(extraList.map((c) => c.amount)));
  const total = roundMoney(materialNet + labor + overhead + extra);

  // Partial receipts join the final outputs for allocation; costs are then per item.
  if (wo.receipts.length) {
    assert(
      outputs.every((o) => o.sharePct === undefined),
      "Manual cost shares cannot be used once partial output has been received.",
    );
  }
  const receivedByItem = new Map<ID, number>();
  for (const r of wo.receipts) receivedByItem.set(r.itemId, (receivedByItem.get(r.itemId) ?? 0) + r.qty);
  const allocationInputs = [
    ...outputs,
    ...[...receivedByItem].map(([itemId, qty]) => ({ itemId, qty, sharePct: undefined })),
  ];
  const raw = allocate(db, wo.type, allocationInputs, total);
  const perItem = new Map<ID, OutputCost>();
  for (const oc of raw) {
    const cur = perItem.get(oc.itemId);
    if (!cur) perItem.set(oc.itemId, { ...oc });
    else {
      cur.qty = roundQty(cur.qty + oc.qty);
      cur.weight += oc.weight;
      cur.allocated = roundMoney(cur.allocated + oc.allocated);
      cur.writeOff = roundMoney(cur.writeOff + oc.writeOff);
    }
  }
  for (const oc of perItem.values()) oc.unitCost = roundMoney((oc.allocated - oc.writeOff) / oc.qty);
  const outputCosts = [...perItem.values()];
  const writeOff = roundMoney(sum(outputCosts.map((o) => o.writeOff)));

  let revalued = 0;
  let variance = 0;
  for (const r of wo.receipts) {
    const diff = (perItem.get(r.itemId)?.unitCost ?? r.provisionalUnitCost) - r.provisionalUnitCost;
    const remaining = Math.min(r.qty, receiptRemaining(db, r.id));
    revalued += remaining * diff;
    variance += (r.qty - remaining) * diff;
  }

  // Value-based yield: share of the material actually kept (not returned) that ended in the product.
  const kept = sum(lines.map((l) => l.issuedValue - l.returnedValue));
  const wasted = sum(lines.map((l) => l.scrapQty * l.avgUnitCost));
  const yieldRatio = kept > EPS ? Math.max(0, Math.min(1, (kept - wasted) / kept)) : 1;
  const rejectQty = roundQty(
    sum(outputs.filter((o) => o.grade === "reject").map((o) => o.qty)) +
      sum(wo.receipts.filter((r) => r.grade === "reject").map((r) => r.qty)),
  );

  return {
    materialGross,
    returnCredit,
    scrapRecovery,
    materialNet,
    labor,
    overhead,
    extra,
    total,
    writeOff,
    capitalized: roundMoney(total - writeOff),
    lines,
    outputs: outputCosts,
    yieldRatio,
    laborFromLogs: laborInfo.fromLogs,
    rejectQty,
    revalued: roundMoney(revalued),
    variance: roundMoney(variance),
  };
}

function largestIssueLot(wo: WorkOrder, itemId: ID): ID {
  const perLot = new Map<ID, number>();
  for (const i of wo.issues) if (i.itemId === itemId) perLot.set(i.lotId, (perLot.get(i.lotId) ?? 0) + i.qty);
  let best: ID | undefined;
  let bestQty = -1;
  for (const [lotId, q] of perLot) {
    if (q > bestQty) {
      best = lotId;
      bestQty = q;
    }
  }
  assert(best, "Source lot not found.");
  return best;
}

/**
 * Joint cost allocation by relative value (qty × basis), or by manual share when given.
 * Deconstruction applies the lower-of-cost-or-NRV cap: recovered material is never valued above
 * its replacement cost; the excess is written off.
 */
function allocate(
  db: Db,
  type: WorkOrderType,
  outputs: { itemId: ID; qty: number; sharePct?: number }[],
  total: number,
): OutputCost[] {
  const manual = outputs.some((o) => o.sharePct !== undefined);
  let weights: number[];
  if (manual) {
    assert(
      outputs.every((o) => o.sharePct !== undefined && o.sharePct >= 0),
      "When cost shares are entered manually, fill in every output.",
    );
    const totalPct = sum(outputs.map((o) => o.sharePct ?? 0));
    assert(Math.abs(totalPct - 100) < 0.01, `Cost shares must total 100% (now ${roundQty(totalPct)}%).`);
    weights = outputs.map((o) => o.sharePct ?? 0);
  } else {
    weights = outputs.map((o) => o.qty * allocationBasis(getItem(db, o.itemId)));
    if (sum(weights) <= EPS) weights = outputs.map((o) => o.qty);
  }
  const totalWeight = sum(weights);
  let remaining = total;
  return outputs.map((o, idx) => {
    const isLast = idx === outputs.length - 1;
    const allocated = isLast ? roundMoney(remaining) : roundMoney((total * (weights[idx] ?? 0)) / totalWeight);
    remaining -= allocated;
    let writeOff = 0;
    if (type === "dekonstruksi") {
      const item = getItem(db, o.itemId);
      const cap = item.standardCost > 0 ? o.qty * item.standardCost : Infinity;
      writeOff = roundMoney(Math.max(0, allocated - cap));
    }
    const capitalized = allocated - writeOff;
    return {
      outputId: newId(),
      itemId: o.itemId,
      qty: o.qty,
      weight: weights[idx] ?? 0,
      allocated,
      writeOff,
      unitCost: roundMoney(capitalized / o.qty),
    };
  });
}

/**
 * Default completion proposal: planned outputs minus what was already received, and an offcut
 * ("sisa") row for every remnant-tracked material.
 */
export function defaultCompletion(db: Db, wo: WorkOrder): CompletionInput {
  const issuedItems = [...new Set(wo.issues.map((i) => i.itemId))];
  // Fixed cost shares from the recipe carry over, unless partial receipts already exist.
  const recipe = wo.recipeId ? db.recipes.find((r) => r.id === wo.recipeId) : undefined;
  const shareOf = (itemId: ID) =>
    wo.receipts.length ? undefined : recipe?.outputs.find((o) => o.itemId === itemId)?.sharePct;
  return {
    outputs: wo.plannedOutputs
      .map((o) => ({ itemId: o.itemId, qty: Math.max(0, roundQty(o.qty - receivedQty(wo, o.itemId))), sharePct: shareOf(o.itemId) }))
      .filter((o) => o.qty > EPS || wo.receipts.length === 0),
    returns: issuedItems
      .filter((id) => findItem(db, id)?.trackRemnant)
      .map((itemId) => ({ itemId, kind: "sisa" as const, qty: 0 })),
  };
}

export function completeWorkOrder(
  db: Db,
  woId: ID,
  input: CompletionInput,
  opts: { at?: string; location?: string } = {},
): WorkOrder {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  if (input.laborHours !== undefined) wo.laborHours = input.laborHours;
  if (input.laborRate !== undefined) wo.laborRate = input.laborRate;
  if (input.overhead !== undefined) wo.overhead = input.overhead;
  if (input.extraCosts) wo.extraCosts = normalizeExtra(input.extraCosts);
  const cost = computeCost(db, wo, { ...input, extraCosts: wo.extraCosts });
  const at = opts.at ?? nowIso();
  const location = opts.location || db.settings.defaultLocation;
  const ref = woRef(wo);
  const createdLotIds: ID[] = [];
  const avg = new Map(cost.lines.map((l) => [l.itemId, l.avgUnitCost]));
  const unitOf = new Map(cost.outputs.map((o) => [o.itemId, o.unitCost]));

  const returns: ReturnEntry[] = [];
  for (const r of input.returns) {
    if (r.qty <= EPS && !(r.salvageValue ?? 0)) continue;
    const entry: ReturnEntry = { id: newId(), ...r };
    if (r.kind === "utuh") {
      const lotId = r.lotId ?? largestIssueLot(wo, r.itemId);
      const lot = getLot(db, lotId);
      const unitCost = wo.issues.find((i) => i.lotId === lotId)?.unitCost ?? lot.unitCost;
      returnToLot(db, lot, r.qty, unitCost, { type: "kembali_produksi", ref, at });
      entry.lotId = lotId;
    } else if (r.kind === "sisa") {
      const lot = createLot(db, {
        itemId: r.itemId,
        qty: r.qty,
        unitCost: avg.get(r.itemId) ?? 0,
        origin: "sisa_produksi",
        originRef: ref,
        isRemnant: true,
        dimensions: r.dimensions,
        location,
        status: "tersedia",
        createdAt: at,
        note: r.note,
      });
      recordMove(db, { lot, qty: lot.qty, type: "masuk_sisa", ref, at, note: r.note });
      entry.lotId = lot.id;
      createdLotIds.push(lot.id);
    }
    returns.push(entry);
  }

  const outputs: OutputEntry[] = [];
  for (const o of input.outputs.filter((x) => x.qty > EPS)) {
    const item = getItem(db, o.itemId);
    const reject = o.grade === "reject";
    const lot = createLot(db, {
      itemId: o.itemId,
      qty: o.qty,
      unitCost: unitOf.get(o.itemId) ?? 0,
      origin: wo.type === "dekonstruksi" ? "dekonstruksi" : "produksi",
      originRef: ref,
      isRemnant: false,
      dimensions: o.dimensions,
      location,
      status: reject ? "rusak" : "tersedia",
      createdAt: at,
      note: reject ? "QC reject — needs rework" : wo.type === "dekonstruksi" && item.kind === "material" ? "Material recovered by dismantling" : undefined,
    });
    recordMove(db, { lot, qty: lot.qty, type: "masuk_produksi", ref, at, note: reject ? "QC reject" : undefined });
    createdLotIds.push(lot.id);
    outputs.push({ id: newId(), itemId: o.itemId, qty: o.qty, sharePct: o.sharePct, dimensions: o.dimensions, grade: o.grade });
  }

  // Partial output still in stock is revalued from provisional to actual cost. The difference is
  // applied as a delta, so a lot already blended into a moving average keeps its other value.
  for (const r of wo.receipts) {
    const actual = unitOf.get(r.itemId);
    if (actual === undefined) continue;
    const delta = actual - r.provisionalUnitCost;
    if (Math.abs(delta) < 0.005) continue;
    for (const lot of db.lots.filter((l) => l.receiptId === r.id && l.qty > EPS)) {
      lot.unitCost = roundMoney(Math.max(0, lot.unitCost + delta));
      recordMove(db, { lot, qty: 0, type: "revaluasi", ref, at, unitCost: lot.unitCost, note: "Provisional cost → actual cost" });
    }
  }

  releaseReservations(db, wo.id);
  for (const s of wo.stages) {
    if (s.status !== "selesai") {
      s.status = "selesai";
      s.startedAt ??= at;
      s.doneAt = at;
    }
  }
  wo.returns = returns;
  wo.outputs = outputs;
  wo.cost = cost;
  wo.createdLotIds = createdLotIds;
  wo.status = "selesai";
  wo.completedAt = at;
  return wo;
}

/** Leftovers bought for a work order become free stock for the next production. */
export function releaseReservations(db: Db, woId: ID): Lot[] {
  const released = db.lots.filter((l) => l.reservedForWo === woId);
  for (const l of released) l.reservedForWo = undefined;
  return released;
}

export function cancelWorkOrder(db: Db, woId: ID, at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Work order ${wo.code} is already closed.`);
  assert(wo.receipts.length === 0, "Output has already been received — complete this work order instead of cancelling it.");
  const openChildren = db.workOrders.filter((w) => w.parentWoId === wo.id && isOpenWo(w));
  assert(
    openChildren.length === 0,
    `Component work orders are still open (${openChildren.map((w) => w.code).join(", ")}) — complete or cancel them first.`,
  );
  for (const issue of [...wo.issues]) unissue(db, wo.id, issue.id, issue.qty, at);
  releaseReservations(db, wo.id);
  for (const p of db.purchases) {
    if (p.workOrderId === wo.id && p.status === "draft") p.workOrderId = undefined;
  }
  wo.status = "batal";
  wo.completedAt = at;
  return wo;
}

/** Standard (estimated) unit cost of an item from its BOM and labour. */
export function standardProductCost(db: Pick<Db, "items" | "settings">, product: Item): number {
  const material = sum((product.bom ?? []).map((b) => (db.items.find((i) => i.id === b.materialId)?.standardCost ?? 0) * b.qty));
  const hours = product.laborHours ?? 0;
  return roundMoney(material + hours * (db.settings.laborRatePerHour + db.settings.overheadPerLaborHour));
}

/** Convenience: create a repair order for a damaged unit. */
export function createRepairOrder(db: Db, lotId: ID, title?: string): WorkOrder {
  const lot = getLot(db, lotId);
  const item = getItem(db, lot.itemId);
  assert(item.kind === "product", "Repair is for products only.");
  assert(lot.status === "rusak", "This unit is not marked as damaged.");
  return createWorkOrder(db, {
    type: "perbaikan",
    title: title || `Repair ${item.name} (${lot.code})`,
    plannedOutputs: [{ itemId: item.id, qty: lot.qty }],
    plannedInputs: [{ itemId: item.id, qty: lot.qty, lotId }],
    laborHours: 0,
  });
}
