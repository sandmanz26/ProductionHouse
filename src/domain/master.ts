import { assert, EPS, getItem, newId, nextCode } from "./core";
import type { Db, ID, Item, Partner, Settings } from "./types";

export type ItemInput = Omit<Item, "id" | "sku"> & { sku?: string };

function validateItem(db: Db, input: ItemInput, selfId?: ID) {
  assert(input.name.trim(), "Nama item wajib diisi.");
  assert(input.standardCost >= 0, "Harga standar tidak boleh negatif.");
  if (input.sku?.trim()) {
    const sku = input.sku.trim().toUpperCase();
    assert(!db.items.some((i) => i.sku.toUpperCase() === sku && i.id !== selfId), `Kode ${sku} sudah dipakai.`);
  }
  for (const b of input.bom ?? []) {
    const m = getItem(db, b.materialId);
    assert(m.id !== selfId, "Produk tidak boleh menjadi bahan dirinya sendiri.");
    assert(b.qty > EPS, `Qty BOM ${m.name} harus lebih dari 0.`);
  }
  if (input.packing) {
    const p = input.packing;
    assert(p.length >= 0 && p.width >= 0 && p.height >= 0 && p.cartonsPerUnit > 0, "Data kemasan tidak valid.");
  }
}

export function createItem(db: Db, input: ItemInput): Item {
  validateItem(db, input);
  const item: Item = {
    ...input,
    id: newId(),
    name: input.name.trim(),
    sku: input.sku?.trim().toUpperCase() || nextCode(db, "item"),
    bom: input.kind === "product" ? (input.bom ?? []) : undefined,
  };
  db.items.push(item);
  return item;
}

export function updateItem(db: Db, id: ID, input: ItemInput): Item {
  const item = getItem(db, id);
  validateItem(db, input, id);
  assert(input.kind === item.kind, "Jenis item tidak dapat diubah.");
  Object.assign(item, {
    ...input,
    name: input.name.trim(),
    sku: input.sku?.trim().toUpperCase() || item.sku,
    bom: input.kind === "product" ? (input.bom ?? []) : undefined,
  });
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
  const next = { ...db.settings, ...patch };
  assert(next.companyName.trim(), "Nama perusahaan wajib diisi.");
  assert(next.laborRatePerHour >= 0 && next.overheadPerLaborHour >= 0, "Tarif tidak boleh negatif.");
  assert(next.locations.length > 0, "Minimal satu lokasi gudang.");
  if (!next.locations.includes(next.defaultLocation)) next.defaultLocation = next.locations[0]!;
  for (const [cur, rate] of Object.entries(next.exchangeRates)) assert(rate > 0, `Kurs ${cur} harus lebih dari 0.`);
  db.settings = next;
  return next;
}

