import { assert, assertAmount, DomainError, EPS, getItem, isActiveLot, newId, nextCode } from "./core";
import { isCostingMethod, setCostingMethod } from "./costing";
import type { Db, ID, Item, Partner, Settings } from "./types";

export type ItemInput = Omit<Item, "id" | "sku"> & { sku?: string };

function validateItem(db: Db, input: ItemInput, selfId?: ID) {
  assert(input.name?.trim(), "Nama item wajib diisi.");
  assertAmount(input.standardCost, "Harga standar");
  assert(input.costingMethod === undefined || isCostingMethod(input.costingMethod), "Metode biaya tidak dikenal.");
  for (const [key, label] of [
    ["salePrice", "Harga jual"],
    ["rentalRatePerDay", "Tarif sewa"],
    ["laborHours", "Jam kerja standar"],
    ["reorderPoint", "Stok minimum"],
  ] as const) {
    if (input[key] !== undefined) assertAmount(input[key], label);
  }
  if (input.sku?.trim()) {
    const sku = input.sku.trim().toUpperCase();
    assert(!db.items.some((i) => i.sku.toUpperCase() === sku && i.id !== selfId), `Kode ${sku} sudah dipakai.`);
  }
  for (const b of input.bom ?? []) {
    const m = getItem(db, b.materialId);
    assert(m.id !== selfId, "Produk tidak boleh menjadi bahan dirinya sendiri.");
    assert(Number.isFinite(b.qty) && b.qty > EPS, `Qty BOM ${m.name} harus lebih dari 0.`);
  }
  if (selfId && input.bom?.length) assertNoCycle(db, selfId, input.bom.map((b) => b.materialId));
  if (input.packing) {
    const p = input.packing;
    assert(p.length >= 0 && p.width >= 0 && p.height >= 0 && p.cartonsPerUnit > 0, "Data kemasan tidak valid.");
  }
}

/** A recipe must never (indirectly) contain the item itself, or planning would recurse forever. */
function assertNoCycle(db: Db, selfId: ID, materialIds: ID[]) {
  const seen = new Set<ID>();
  const stack = [...materialIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (id === selfId) {
      throw new DomainError(`Resep melingkar: ${getItem(db, selfId).name} dipakai lagi di dalam resep komponennya sendiri.`);
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
  assert(input.kind === item.kind, "Jenis item tidak dapat diubah.");
  const methodBefore = item.costingMethod ?? null;
  if (input.uom !== item.uom) {
    assert(
      !db.lots.some((l) => l.itemId === id && isActiveLot(l)),
      `Satuan ${item.name} tidak bisa diubah karena masih ada stok dalam ${item.uom}. Habiskan atau sesuaikan stok dulu.`,
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
  assert(input.name.trim(), "Nama wajib diisi.");
  const p: Partner = { ...input, name: input.name.trim(), id: newId() };
  db.partners.push(p);
  return p;
}

export function updatePartner(db: Db, id: ID, input: PartnerInput): Partner {
  const p = db.partners.find((x) => x.id === id);
  assert(p, "Relasi tidak ditemukan.");
  assert(input.name.trim(), "Nama wajib diisi.");
  Object.assign(p, { ...input, name: input.name.trim() });
  return p;
}

export function deletePartner(db: Db, id: ID) {
  const used =
    db.purchases.some((p) => p.supplierId === id) ||
    db.sales.some((s) => s.customerId === id) ||
    db.rentals.some((r) => r.customerId === id);
  assert(!used, "Relasi ini sudah dipakai di transaksi dan tidak dapat dihapus.");
  db.partners = db.partners.filter((p) => p.id !== id);
  return true;
}

export function updateSettings(db: Db, patch: Partial<Settings>): Settings {
  const { costingMethod, costingHistory: _ignored, ...rest } = patch;
  const next = { ...db.settings, ...rest };
  assert(next.companyName?.trim(), "Nama perusahaan wajib diisi.");
  assertAmount(next.laborRatePerHour, "Tarif tenaga kerja");
  assertAmount(next.overheadPerLaborHour, "Overhead per jam");
  assert(Number.isInteger(next.remnantAgingDays) && next.remnantAgingDays >= 1, "Batas umur sisa minimal 1 hari.");
  assert(Number.isInteger(next.rentalReminderDays) && next.rentalReminderDays >= 0, "Pengingat sewa harus 0 hari atau lebih.");
  const locations = [...new Set(next.locations.map((l) => l.trim()).filter(Boolean))];
  assert(locations.length > 0, "Minimal satu lokasi gudang.");
  const orphaned = db.settings.locations.filter(
    (loc) => !locations.includes(loc) && db.lots.some((l) => isActiveLot(l) && l.location === loc),
  );
  assert(orphaned.length === 0, `Lokasi ${orphaned.join(", ")} masih ada stok — pindahkan stoknya dulu.`);
  next.locations = locations;
  if (!locations.includes(next.defaultLocation)) next.defaultLocation = locations[0]!;
  for (const [cur, rate] of Object.entries(next.exchangeRates)) {
    assert(Number.isFinite(rate) && rate > 0, `Kurs ${cur} harus lebih dari 0.`);
  }
  next.defaultStages = (next.defaultStages ?? []).map((s) => s.trim()).filter(Boolean);
  db.settings = next;
  // The cost formula goes through its own path so every change is logged.
  if (costingMethod !== undefined) setCostingMethod(db, costingMethod);
  return db.settings;
}
