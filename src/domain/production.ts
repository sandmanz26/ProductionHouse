import {
  assert,
  createLot,
  EPS,
  findItem,
  freeQtyFor,
  getItem,
  getLot,
  newId,
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
  Lot,
  OutputCost,
  OutputEntry,
  ReturnEntry,
  ReturnKind,
  WorkOrder,
  WorkOrderType,
} from "./types";

export const woRef = (wo: WorkOrder): DocRef => ({ type: "workOrder", id: wo.id, code: wo.code });

export const isOpenWo = (wo: WorkOrder) => wo.status === "rencana" || wo.status === "berjalan";

export function getWorkOrder(db: Db, id: ID): WorkOrder {
  const wo = db.workOrders.find((w) => w.id === id);
  assert(wo, "Perintah kerja tidak ditemukan.");
  return wo;
}

export interface WorkOrderInput {
  type: WorkOrderType;
  title: string;
  dueDate?: ISODate;
  salesOrderId?: ID;
  plannedOutputs: { itemId: ID; qty: number }[];
  plannedInputs?: { itemId: ID; qty: number; lotId?: ID }[];
  laborHours?: number;
  laborRate?: number;
  overhead?: number;
  extraCosts?: { label: string; amount: number }[];
  note?: string;
}

/** Standard labour hours for the planned outputs (from product master data). */
export function standardLaborHours(db: Db, outputs: { itemId: ID; qty: number }[]): number {
  return roundQty(sum(outputs.map((o) => (findItem(db, o.itemId)?.laborHours ?? 0) * o.qty)));
}

function normalizeExtra(extra: WorkOrderInput["extraCosts"]): ExtraCost[] {
  return (extra ?? [])
    .filter((c) => c.label.trim() || c.amount)
    .map((c) => {
      assert(c.amount >= 0, "Biaya lain tidak boleh negatif.");
      return { id: newId(), label: c.label.trim() || "Biaya lain", amount: c.amount };
    });
}

function validatePlan(db: Db, input: WorkOrderInput) {
  assert(input.title.trim(), "Judul perintah kerja wajib diisi.");
  for (const o of input.plannedOutputs) {
    const item = getItem(db, o.itemId);
    assert(o.qty > EPS, `Qty output ${item.name} harus lebih dari 0.`);
    if (input.type !== "dekonstruksi") {
      assert(item.kind === "product", `Output ${input.type} harus berupa produk (${item.name}).`);
    }
  }
  for (const i of input.plannedInputs ?? []) {
    const item = getItem(db, i.itemId);
    assert(i.qty > EPS, `Qty input ${item.name} harus lebih dari 0.`);
    if (i.lotId) assert(getLot(db, i.lotId).itemId === i.itemId, "Lot input tidak sesuai dengan item.");
  }
  if (input.type === "produksi") {
    assert(input.plannedOutputs.length > 0, "Tentukan produk yang akan dibuat.");
  }
  if (input.type === "konversi" || input.type === "dekonstruksi" || input.type === "perbaikan") {
    assert((input.plannedInputs ?? []).length > 0, "Tentukan barang asal yang akan diproses.");
  }
}

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
    plannedOutputs: input.plannedOutputs.map((o) => ({ id: newId(), itemId: o.itemId, qty: o.qty })),
    plannedInputs: (input.plannedInputs ?? []).map((i) => ({ id: newId(), itemId: i.itemId, qty: i.qty, lotId: i.lotId })),
    issues: [],
    returns: [],
    outputs: [],
    laborHours,
    laborRate: input.laborRate ?? db.settings.laborRatePerHour,
    overhead: input.overhead ?? roundMoney(laborHours * db.settings.overheadPerLaborHour),
    extraCosts: normalizeExtra(input.extraCosts),
    note: input.note,
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
  assert(isOpenWo(wo), `Perintah kerja ${wo.code} sudah ditutup.`);
  if (patch.plannedOutputs || patch.plannedInputs) {
    validatePlan(db, {
      type: wo.type,
      title: patch.title ?? wo.title,
      plannedOutputs: patch.plannedOutputs ?? wo.plannedOutputs,
      plannedInputs: patch.plannedInputs ?? wo.plannedInputs,
    });
  }
  if (patch.title !== undefined) {
    assert(patch.title.trim(), "Judul perintah kerja wajib diisi.");
    wo.title = patch.title.trim();
  }
  if (patch.dueDate !== undefined) wo.dueDate = patch.dueDate || undefined;
  if (patch.note !== undefined) wo.note = patch.note;
  if (patch.laborHours !== undefined) {
    assert(patch.laborHours >= 0, "Jam kerja tidak boleh negatif.");
    wo.laborHours = patch.laborHours;
  }
  if (patch.laborRate !== undefined) {
    assert(patch.laborRate >= 0, "Tarif tenaga kerja tidak boleh negatif.");
    wo.laborRate = patch.laborRate;
  }
  if (patch.overhead !== undefined) {
    assert(patch.overhead >= 0, "Overhead tidak boleh negatif.");
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
}

/** Standard material requirement derived from the plan. */
export function plannedRequirement(db: Db, wo: Pick<WorkOrder, "type" | "plannedOutputs" | "plannedInputs">) {
  const req = new Map<ID, { qty: number; lotId?: ID }>();
  const add = (itemId: ID, qty: number, lotId?: ID) => {
    const cur = req.get(itemId);
    req.set(itemId, { qty: (cur?.qty ?? 0) + qty, lotId: cur?.lotId ?? lotId });
  };
  if (wo.type === "produksi") {
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
    };
  });
}

// ------------------------------------------------------------------ Execution

export function startWorkOrder(db: Db, id: ID, at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, id);
  assert(wo.status === "rencana", `Perintah kerja ${wo.code} tidak dalam status rencana.`);
  wo.status = "berjalan";
  wo.startedAt = at;
  return wo;
}

/** Statuses a lot may have to be consumed by this kind of work order. */
function issuableStatuses(wo: WorkOrder, lot: Lot): Lot["status"][] {
  const plannedLot = wo.plannedInputs.some((i) => i.lotId === lot.id);
  // Damaged units may be repaired, converted or dismantled.
  return wo.type !== "produksi" || plannedLot ? ["tersedia", "rusak"] : ["tersedia"];
}

export function issueMaterials(db: Db, woId: ID, picks: { lotId: ID; qty: number }[], at = nowIso()): WorkOrder {
  const wo = getWorkOrder(db, woId);
  assert(isOpenWo(wo), `Perintah kerja ${wo.code} sudah ditutup.`);
  const valid = picks.filter((p) => p.qty > EPS);
  assert(valid.length > 0, "Tidak ada bahan yang diambil.");
  if (wo.status === "rencana") startWorkOrder(db, woId, at);
  const ref = woRef(wo);
  for (const pick of valid) {
    const lot = getLot(db, pick.lotId);
    assert(
      !lot.reservedForWo || lot.reservedForWo === wo.id,
      `Lot ${lot.code} dicadangkan untuk perintah kerja lain.`,
    );
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
  assert(isOpenWo(wo), `Perintah kerja ${wo.code} sudah ditutup.`);
  const issue = wo.issues.find((i) => i.id === issueId);
  assert(issue, "Data pengambilan tidak ditemukan.");
  assert(qty > EPS && qty <= issue.qty + EPS, "Qty pengembalian melebihi yang diambil.");
  const lot = getLot(db, issue.lotId);
  lot.qty = roundQty(lot.qty + qty);
  recordMove(db, { lot, qty, type: "kembali_produksi", ref: woRef(wo), at, unitCost: issue.unitCost });
  issue.qty = roundQty(issue.qty - qty);
  if (issue.qty <= EPS) wo.issues = wo.issues.filter((i) => i.id !== issueId);
  return wo;
}

// ------------------------------------------------------------------ Costing

export interface CompletionInput {
  outputs: { itemId: ID; qty: number; sharePct?: number; dimensions?: Dimensions }[];
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

/**
 * Pure HPP calculation for a work order and a proposed completion. Throws on invalid input,
 * so it doubles as validation for the completion form (live preview).
 */
export function computeCost(db: Db, wo: WorkOrder, input: CompletionInput): CostSummary {
  const outputs = input.outputs.filter((o) => o.qty > EPS);
  const returns = input.returns.filter((r) => r.qty > EPS || (r.salvageValue ?? 0) > 0);
  assert(wo.issues.length > 0, "Belum ada bahan yang diambil untuk perintah kerja ini.");
  assert(outputs.length > 0, "Isi minimal satu hasil (output).");

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
    assert(line, `${item.name} tidak pernah diambil di perintah kerja ini, jadi tidak bisa dikembalikan.`);
    assert(r.qty >= 0, "Qty pengembalian tidak boleh negatif.");
    if (r.kind === "utuh") {
      const lotId = r.lotId ?? largestIssueLot(wo, r.itemId);
      const issuedFromLot = sum(wo.issues.filter((i) => i.lotId === lotId).map((i) => i.qty));
      const already = returnedPerLot.get(lotId) ?? 0;
      assert(
        r.qty + already <= issuedFromLot + EPS,
        `Pengembalian utuh ${item.name} melebihi qty yang diambil dari lot tersebut.`,
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
      assert(salvage >= 0, "Nilai limbah tidak boleh negatif.");
      line.scrapQty += r.qty;
      line.scrapValue += salvage;
    }
  }

  for (const line of byItem.values()) {
    const item = getItem(db, line.itemId);
    assert(
      line.returnedQty + line.scrapQty <= line.issuedQty + EPS,
      `Total sisa/limbah ${item.name} (${roundQty(line.returnedQty + line.scrapQty)}) melebihi yang diambil (${roundQty(line.issuedQty)}).`,
    );
    assert(
      line.returnedValue + line.scrapValue <= line.issuedValue + 0.01,
      `Nilai sisa + limbah ${item.name} melebihi nilai bahan yang diambil.`,
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
  assert(laborHours >= 0 && laborRate >= 0, "Jam & tarif tenaga kerja tidak boleh negatif.");
  const labor = roundMoney(laborHours * laborRate);
  const overhead = roundMoney(input.overhead ?? wo.overhead);
  assert(overhead >= 0, "Overhead tidak boleh negatif.");
  const extraList = input.extraCosts ?? wo.extraCosts;
  assert(extraList.every((c) => c.amount >= 0), "Biaya lain tidak boleh negatif.");
  const extra = roundMoney(sum(extraList.map((c) => c.amount)));
  const total = roundMoney(materialNet + labor + overhead + extra);

  const outputCosts = allocate(db, wo.type, outputs, total);
  const writeOff = roundMoney(sum(outputCosts.map((o) => o.writeOff)));

  // Value-based yield: share of the material actually kept (not returned) that ended in the product.
  const kept = sum(lines.map((l) => l.issuedValue - l.returnedValue));
  const wasted = sum(lines.map((l) => l.scrapQty * l.avgUnitCost));
  const yieldRatio = kept > EPS ? Math.max(0, Math.min(1, (kept - wasted) / kept)) : 1;

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
  assert(best, "Lot asal tidak ditemukan.");
  return best;
}

/**
 * Joint cost allocation by relative value (qty × basis), or by manual share when given.
 * Deconstruction applies the lower-of-cost-or-NRV cap: recovered material is never valued above
 * its replacement cost; the excess is written off.
 */
function allocate(db: Db, type: WorkOrderType, outputs: CompletionInput["outputs"], total: number): OutputCost[] {
  const manual = outputs.some((o) => o.sharePct !== undefined);
  let weights: number[];
  if (manual) {
    assert(
      outputs.every((o) => o.sharePct !== undefined && o.sharePct >= 0),
      "Jika porsi biaya diisi manual, semua output harus diisi.",
    );
    const totalPct = sum(outputs.map((o) => o.sharePct ?? 0));
    assert(Math.abs(totalPct - 100) < 0.01, `Total porsi biaya harus 100% (sekarang ${roundQty(totalPct)}%).`);
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

/** Default completion proposal: planned outputs, and a "sisa" row for every remnant-tracked material. */
export function defaultCompletion(db: Db, wo: WorkOrder): CompletionInput {
  const issuedItems = [...new Set(wo.issues.map((i) => i.itemId))];
  return {
    outputs: wo.plannedOutputs.map((o) => ({ itemId: o.itemId, qty: o.qty })),
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
  assert(isOpenWo(wo), `Perintah kerja ${wo.code} sudah ditutup.`);
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

  const returns: ReturnEntry[] = [];
  for (const r of input.returns) {
    if (r.qty <= EPS && !(r.salvageValue ?? 0)) continue;
    const entry: ReturnEntry = { id: newId(), ...r };
    if (r.kind === "utuh") {
      const lotId = r.lotId ?? largestIssueLot(wo, r.itemId);
      const lot = getLot(db, lotId);
      lot.qty = roundQty(lot.qty + r.qty);
      const unitCost = wo.issues.find((i) => i.lotId === lotId)?.unitCost ?? lot.unitCost;
      recordMove(db, { lot, qty: r.qty, type: "kembali_produksi", ref, at, unitCost });
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
  input.outputs
    .filter((o) => o.qty > EPS)
    .forEach((o, idx) => {
      const oc = cost.outputs[idx]!;
      const item = getItem(db, o.itemId);
      const lot = createLot(db, {
        itemId: o.itemId,
        qty: o.qty,
        unitCost: oc.unitCost,
        origin: wo.type === "dekonstruksi" ? "dekonstruksi" : "produksi",
        originRef: ref,
        isRemnant: false,
        dimensions: o.dimensions,
        location,
        status: "tersedia",
        createdAt: at,
        note: wo.type === "dekonstruksi" && item.kind === "material" ? "Bahan hasil bongkaran" : undefined,
      });
      recordMove(db, { lot, qty: lot.qty, type: "masuk_produksi", ref, at });
      createdLotIds.push(lot.id);
      outputs.push({ id: oc.outputId, itemId: o.itemId, qty: o.qty, sharePct: o.sharePct, dimensions: o.dimensions });
    });

  releaseReservations(db, wo.id);
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
  assert(isOpenWo(wo), `Perintah kerja ${wo.code} sudah ditutup.`);
  for (const issue of [...wo.issues]) unissue(db, wo.id, issue.id, issue.qty, at);
  releaseReservations(db, wo.id);
  for (const p of db.purchases) {
    if (p.workOrderId === wo.id && p.status === "draft") p.workOrderId = undefined;
  }
  wo.status = "batal";
  wo.completedAt = at;
  return wo;
}

/** Standard (estimated) unit cost of a product from its BOM and labour. */
export function standardProductCost(db: Pick<Db, "items" | "settings">, product: Item): number {
  const material = sum((product.bom ?? []).map((b) => (db.items.find((i) => i.id === b.materialId)?.standardCost ?? 0) * b.qty));
  const hours = product.laborHours ?? 0;
  return roundMoney(material + hours * (db.settings.laborRatePerHour + db.settings.overheadPerLaborHour));
}

/** Convenience: create a repair order for a damaged unit. */
export function createRepairOrder(db: Db, lotId: ID, title?: string): WorkOrder {
  const lot = getLot(db, lotId);
  const item = getItem(db, lot.itemId);
  assert(item.kind === "product", "Perbaikan hanya untuk produk.");
  assert(lot.status === "rusak", "Unit ini tidak berstatus rusak.");
  return createWorkOrder(db, {
    type: "perbaikan",
    title: title || `Perbaikan ${item.name} (${lot.code})`,
    plannedOutputs: [{ itemId: item.id, qty: lot.qty }],
    plannedInputs: [{ itemId: item.id, qty: lot.qty, lotId }],
    laborHours: 0,
  });
}
