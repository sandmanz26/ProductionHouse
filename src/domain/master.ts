import { assert, assertAmount, DomainError, EPS, getItem, isActiveLot, newId, nextCode } from "./core";
import { isCostingMethod, setCostingMethod } from "./costing";
import type { Db, ID, Item, Partner, Settings } from "./types";

export type ItemInput = Omit<Item, "id" | "sku"> & { sku?: string };

function validateItem(db: Db, input: ItemInput, selfId?: ID) {
  assert(input.name?.trim(), "Item name is required.");
  assertAmount(input.standardCost, "Standard cost");
  assert(input.costingMethod === undefined || isCostingMethod(input.costingMethod), "Unknown costing method — pick one from the list.");
  for (const [key, label] of [
    ["salePrice", "Sale price"],
    ["rentalRatePerDay", "Rental rate"],
    ["laborHours", "Standard labour hours"],
    ["reorderPoint", "Minimum stock"],
  ] as const) {
    if (input[key] !== undefined) assertAmount(input[key], label);
  }
  if (input.sku?.trim()) {
    const sku = input.sku.trim().toUpperCase();
    assert(!db.items.some((i) => i.sku.toUpperCase() === sku && i.id !== selfId), `Code ${sku} is already in use — choose another.`);
  }
  for (const b of input.bom ?? []) {
    const m = getItem(db, b.materialId);
    assert(m.id !== selfId, "A product cannot be a material of itself.");
    assert(Number.isFinite(b.qty) && b.qty > EPS, `BOM qty for ${m.name} must be more than 0.`);
  }
  if (selfId && input.bom?.length) assertNoCycle(db, selfId, input.bom.map((b) => b.materialId));
  if (input.packing) {
    const p = input.packing;
    assert(p.length >= 0 && p.width >= 0 && p.height >= 0 && p.cartonsPerUnit > 0, "Packing data is invalid — sizes must be 0 or more and cartons per unit more than 0.");
  }
}

/** A recipe must never (indirectly) contain the item itself, or planning would recurse forever. */
function assertNoCycle(db: Db, selfId: ID, materialIds: ID[]) {
  const seen = new Set<ID>();
  const stack = [...materialIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === selfId) {
      throw new DomainError(`Circular recipe: ${getItem(db, selfId).name} is used again inside its own component recipe.`);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    for (const b of db.items.find((i) => i.id === id)?.bom ?? []) stack.push(b.materialId);
  }
}

/** Products always carry a BOM list; materials only when they are produced in-house. */
function normalizeBom(input: ItemInput) {
  if (input.kind === "product") return input.bom ?? [];
  return input.bom?.length ? input.bom : undefined;
}

export function createItem(db: Db, input: ItemInput): Item {
  validateItem(db, input);
  const item: Item = {
    ...input,
    id: newId(),
    name: input.name.trim(),
    sku: input.sku?.trim().toUpperCase() || nextCode(db, "item"),
    bom: normalizeBom(input),
  };
  db.items.push(item);
  return item;
}

export function updateItem(db: Db, id: ID, input: ItemInput): Item {
  const item = getItem(db, id);
  validateItem(db, input, id);
  assert(input.kind === item.kind, "Item type cannot be changed.");
  const methodBefore = item.costingMethod ?? null;
  if (input.uom !== item.uom) {
    assert(
      !db.lots.some((l) => l.itemId === id && isActiveLot(l)),
      `The unit of ${item.name} cannot change while stock is held in ${item.uom}. Use up or adjust the stock first.`,
    );
  }
  Object.assign(item, {
    ...input,
    name: input.name.trim(),
    sku: input.sku?.trim().toUpperCase() || item.sku,
    bom: normalizeBom(input),
    costingMethod: methodBefore ?? undefined,
  });
  if ((input.costingMethod ?? null) !== methodBefore) setCostingMethod(db, input.costingMethod ?? null, { itemId: id });
  return item;
}

export function isItemReferenced(db: Db, id: ID): boolean {
  return (
    db.lots.some((l) => l.itemId === id) ||
    db.purchases.some((p) => p.lines.some((l) => l.itemId === id)) ||
    db.sales.some((s) => s.lines.some((l) => l.itemId === id)) ||
    db.rentals.some((r) => r.lines.some((l) => l.itemId === id)) ||
    db.workOrders.some(
      (w) => w.plannedOutputs.some((o) => o.itemId === id) || w.plannedInputs.some((i) => i.itemId === id),
    ) ||
    db.items.some((i) => i.bom?.some((b) => b.materialId === id))
  );
}

/** Deletes unused items; items with history are archived instead. */
export function removeItem(db: Db, id: ID): "deleted" | "archived" {
  const item = getItem(db, id);
  if (isItemReferenced(db, id)) {
    item.archived = true;
    return "archived";
  }
  db.items = db.items.filter((i) => i.id !== id);
  return "deleted";
}

export function restoreItem(db: Db, id: ID) {
  getItem(db, id).archived = false;
}

export type PartnerInput = Omit<Partner, "id">;

export function createPartner(db: Db, input: PartnerInput): Partner {
  assert(input.name.trim(), "Name is required.");
  const p: Partner = { ...input, name: input.name.trim(), id: newId() };
  db.partners.push(p);
  return p;
}

export function updatePartner(db: Db, id: ID, input: PartnerInput): Partner {
  const p = db.partners.find((x) => x.id === id);
  assert(p, "Contact not found — it may have been deleted.");
  assert(input.name.trim(), "Name is required.");
  Object.assign(p, { ...input, name: input.name.trim() });
  return p;
}

export function deletePartner(db: Db, id: ID) {
  const used =
    db.purchases.some((p) => p.supplierId === id) ||
    db.sales.some((s) => s.customerId === id) ||
    db.rentals.some((r) => r.customerId === id);
  assert(!used, "This contact is used in transactions and cannot be deleted.");
  db.partners = db.partners.filter((p) => p.id !== id);
  return true;
}

export function updateSettings(db: Db, patch: Partial<Settings>): Settings {
  const { costingMethod, costingHistory: _ignored, ...rest } = patch;
  const next = { ...db.settings, ...rest };
  assert(next.companyName?.trim(), "Company name is required.");
  assertAmount(next.laborRatePerHour, "Labour rate");
  assertAmount(next.overheadPerLaborHour, "Overhead per hour");
  assert(Number.isInteger(next.remnantAgingDays) && next.remnantAgingDays >= 1, "Offcut age limit must be at least 1 day.");
  assert(Number.isInteger(next.rentalReminderDays) && next.rentalReminderDays >= 0, "Rental reminder must be 0 days or more.");
  const locations = [...new Set(next.locations.map((l) => l.trim()).filter(Boolean))];
  assert(locations.length > 0, "Add at least one warehouse location.");
  const orphaned = db.settings.locations.filter(
    (loc) => !locations.includes(loc) && db.lots.some((l) => isActiveLot(l) && l.location === loc),
  );
  assert(orphaned.length === 0, `Location ${orphaned.join(", ")} still holds stock — move it first.`);
  next.locations = locations;
  if (!locations.includes(next.defaultLocation)) next.defaultLocation = locations[0]!;
  for (const [cur, rate] of Object.entries(next.exchangeRates)) {
    assert(Number.isFinite(rate) && rate > 0, `Exchange rate for ${cur} must be more than 0.`);
  }
  next.defaultStages = (next.defaultStages ?? []).map((s) => s.trim()).filter(Boolean);
  db.settings = next;
  // The cost formula goes through its own path so every change is logged.
  if (costingMethod !== undefined) setCostingMethod(db, costingMethod);
  return db.settings;
}
