import { assert, createLot, EPS, getItem, newId, nextCode, nowIso, recordMove, roundMoney, sum } from "./core";
import type { Db, Dimensions, DocRef, ExtraCost, ID, ISODate, Purchase, PurchaseLine } from "./types";

export interface PurchaseInput {
  supplierId?: ID;
  date: ISODate;
  lines: { itemId: ID; qty: number; unitPrice: number; dimensions?: Dimensions }[];
  extraCosts?: { label: string; amount: number }[];
  workOrderId?: ID;
  invoiceNo?: string;
  note?: string;
}

export const purchaseRef = (p: Purchase): DocRef => ({ type: "purchase", id: p.id, code: p.code });

export const lineValue = (l: Pick<PurchaseLine, "qty" | "unitPrice">) => l.qty * l.unitPrice;

export function purchaseTotals(p: Pick<Purchase, "lines" | "extraCosts">) {
  const goods = sum(p.lines.map(lineValue));
  const extra = sum(p.extraCosts.map((c) => c.amount));
  return { goods, extra, total: goods + extra };
}

/**
 * Landed unit cost per line: purchase price plus a share of extra costs (freight, unloading)
 * proportional to line value. Falls back to proportional-by-qty when every price is zero.
 */
export function landedUnitCosts(p: Pick<Purchase, "lines" | "extraCosts">): number[] {
  const { goods, extra } = purchaseTotals(p);
  const totalQty = sum(p.lines.map((l) => l.qty));
  return p.lines.map((l) => {
    if (l.qty <= EPS) return l.unitPrice;
    const share = goods > EPS ? lineValue(l) / goods : totalQty > EPS ? l.qty / totalQty : 0;
    return roundMoney(l.unitPrice + (extra * share) / l.qty);
  });
}

function normalizeLines(db: Db, lines: PurchaseInput["lines"]): PurchaseLine[] {
  assert(lines.length > 0, "Tambahkan minimal satu barang.");
  return lines.map((l) => {
    const item = getItem(db, l.itemId);
    assert(l.qty > EPS, `Qty ${item.name} harus lebih dari 0.`);
    assert(l.unitPrice >= 0, `Harga ${item.name} tidak boleh negatif.`);
    return { id: newId(), itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, dimensions: l.dimensions };
  });
}

function normalizeExtra(extra: PurchaseInput["extraCosts"]): ExtraCost[] {
  return (extra ?? [])
    .filter((c) => c.label.trim() || c.amount)
    .map((c) => {
      assert(c.amount >= 0, "Biaya tambahan tidak boleh negatif.");
      return { id: newId(), label: c.label.trim() || "Biaya lain", amount: c.amount };
    });
}

function validateWo(db: Db, workOrderId?: ID) {
  if (!workOrderId) return;
  const wo = db.workOrders.find((w) => w.id === workOrderId);
  assert(wo, "Perintah kerja tidak ditemukan.");
  assert(wo.status === "rencana" || wo.status === "berjalan", `Perintah kerja ${wo.code} sudah ditutup.`);
}

export function createPurchase(db: Db, input: PurchaseInput): Purchase {
  validateWo(db, input.workOrderId);
  const p: Purchase = {
    id: newId(),
    code: nextCode(db, "purchase"),
    supplierId: input.supplierId,
    date: input.date,
    status: "draft",
    lines: normalizeLines(db, input.lines),
    extraCosts: normalizeExtra(input.extraCosts),
    workOrderId: input.workOrderId,
    invoiceNo: input.invoiceNo,
    note: input.note,
  };
  db.purchases.push(p);
  return p;
}

export function updatePurchase(db: Db, id: ID, input: PurchaseInput): Purchase {
  const p = getPurchase(db, id);
  assert(p.status === "draft", "Hanya pembelian draft yang bisa diubah.");
  validateWo(db, input.workOrderId);
  Object.assign(p, {
    supplierId: input.supplierId,
    date: input.date,
    lines: normalizeLines(db, input.lines),
    extraCosts: normalizeExtra(input.extraCosts),
    workOrderId: input.workOrderId,
    invoiceNo: input.invoiceNo,
    note: input.note,
  });
  return p;
}

export function getPurchase(db: Db, id: ID): Purchase {
  const p = db.purchases.find((x) => x.id === id);
  assert(p, "Pembelian tidak ditemukan.");
  return p;
}

/**
 * Receives goods: creates one lot per line at landed cost and updates each material's
 * standard (replacement) cost. Lots are reserved for the linked work order while it is open.
 */
export function receivePurchase(db: Db, id: ID, opts: { location?: string; at?: string } = {}): Purchase {
  const p = getPurchase(db, id);
  assert(p.status === "draft", `Pembelian ${p.code} sudah ${p.status}.`);
  const wo = p.workOrderId ? db.workOrders.find((w) => w.id === p.workOrderId) : undefined;
  const reserve = wo && (wo.status === "rencana" || wo.status === "berjalan") ? wo.id : undefined;
  const at = opts.at ?? nowIso();
  const costs = landedUnitCosts(p);
  const ref = purchaseRef(p);
  const lotIds: ID[] = [];
  p.lines.forEach((line, i) => {
    const item = getItem(db, line.itemId);
    const unitCost = costs[i] ?? line.unitPrice;
    const lot = createLot(db, {
      itemId: item.id,
      qty: line.qty,
      unitCost,
      origin: "pembelian",
      originRef: ref,
      isRemnant: false,
      dimensions: line.dimensions,
      location: opts.location || db.settings.defaultLocation,
      status: "tersedia",
      reservedForWo: reserve,
      createdAt: at,
    });
    recordMove(db, { lot, qty: lot.qty, type: "masuk_pembelian", ref, at });
    if (item.kind === "material") item.standardCost = unitCost;
    lotIds.push(lot.id);
  });
  p.status = "diterima";
  p.receivedAt = at;
  p.lotIds = lotIds;
  return p;
}

export function cancelPurchase(db: Db, id: ID): Purchase {
  const p = getPurchase(db, id);
  assert(p.status === "draft", "Pembelian yang sudah diterima tidak dapat dibatalkan.");
  p.status = "batal";
  return p;
}
