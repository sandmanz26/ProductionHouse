import { assert, assertAmount, assertDate, assertDimensions, assertPartnerRole, createLot, EPS, getItem, getUsableItem, newId, nextCode, nowIso, recordMove, roundMoney, roundQty, sum } from "./core";
import type { Db, Dimensions, DocRef, ExtraCost, ID, ISODate, Item, Purchase, PurchaseLine } from "./types";

export interface PurchaseInput {
  supplierId?: ID;
  date: ISODate;
  lines: { itemId: ID; qty: number; unitPrice: number; dimensions?: Dimensions }[];
  extraCosts?: { label: string; amount: number }[];
  workOrderId?: ID;
  invoiceNo?: string;
  dueDate?: ISODate;
  note?: string;
}

/**
 * Timber volume ("kubikasi") from piece size: pieces × thickness (cm) × width (cm) × length (m)
 * / 10,000 = m³. Rounded to 4 decimals like a supplier's tally sheet.
 */
export function cubicMeters(pieces: number, thicknessCm: number, widthCm: number, lengthM: number): number {
  if ([pieces, thicknessCm, widthCm, lengthM].some((n) => !(n > 0))) return 0;
  return roundQty((pieces * thicknessCm * widthCm * lengthM) / 10_000);
}

/** Converts a quantity in the purchase unit (e.g. 2 roll) to the stock unit (e.g. 100 m). */
export function toStockQty(item: Pick<Item, "purchaseUnit">, purchaseQty: number): number {
  return roundQty(purchaseQty * (item.purchaseUnit?.factor ?? 1));
}

/** Converts a price per purchase unit to a price per stock unit. */
export function toStockPrice(item: Pick<Item, "purchaseUnit">, pricePerPurchaseUnit: number): number {
  const f = item.purchaseUnit?.factor ?? 1;
  return roundMoney(pricePerPurchaseUnit / f);
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

function normalizeLines(db: Db, lines: PurchaseInput["lines"], keep?: ReadonlySet<ID>): PurchaseLine[] {
  assert(lines.length > 0, "Tambahkan minimal satu barang.");
  return lines.map((l) => {
    const item = getUsableItem(db, l.itemId, keep);
    assert(Number.isFinite(l.qty) && l.qty > EPS, `Qty ${item.name} harus lebih dari 0.`);
    assertAmount(l.unitPrice, `Harga ${item.name}`);
    assertDimensions(l.dimensions);
    return { id: newId(), itemId: l.itemId, qty: l.qty, unitPrice: l.unitPrice, dimensions: l.dimensions };
  });
}

function normalizeExtra(extra: PurchaseInput["extraCosts"]): ExtraCost[] {
  return (extra ?? [])
    .filter((c) => c.label.trim() || c.amount)
    .map((c) => {
      assertAmount(c.amount, "Biaya tambahan");
      return { id: newId(), label: c.label.trim() || "Biaya lain", amount: c.amount };
    });
}

function validateHeader(db: Db, input: PurchaseInput) {
  assertDate(input.date, "Tanggal pembelian");
  if (input.dueDate) assert(input.dueDate >= input.date, "Tanggal jatuh tempo tidak boleh sebelum tanggal pembelian.");
  assertPartnerRole(db, input.supplierId, "supplier");
  validateWo(db, input.workOrderId);
}

function validateWo(db: Db, workOrderId?: ID) {
  if (!workOrderId) return;
  const wo = db.workOrders.find((w) => w.id === workOrderId);
  assert(wo, "Perintah kerja tidak ditemukan.");
  assert(wo.status === "rencana" || wo.status === "berjalan", `Perintah kerja ${wo.code} sudah ditutup.`);
}

export function createPurchase(db: Db, input: PurchaseInput): Purchase {
  validateHeader(db, input);
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
    dueDate: input.dueDate,
    note: input.note,
    payments: [],
  };
  db.purchases.push(p);
  return p;
}

export function updatePurchase(db: Db, id: ID, input: PurchaseInput): Purchase {
  const p = getPurchase(db, id);
  assert(p.status === "draft", "Hanya pembelian draft yang bisa diubah.");
  validateHeader(db, input);
  const lines = normalizeLines(db, input.lines, new Set(p.lines.map((l) => l.itemId)));
  const total = purchaseTotals({ lines, extraCosts: normalizeExtra(input.extraCosts) }).total;
  const paidSoFar = sum(p.payments.map((x) => x.amount));
  assert(total + 0.01 >= paidSoFar, "Total baru lebih kecil dari yang sudah dibayar — catat refund dulu.");
  Object.assign(p, {
    supplierId: input.supplierId,
    date: input.date,
    lines,
    extraCosts: normalizeExtra(input.extraCosts),
    workOrderId: input.workOrderId,
    invoiceNo: input.invoiceNo,
    dueDate: input.dueDate,
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
  assert(p.payments.length === 0, "Pembelian sudah dibayar — hapus pembayaran terlebih dahulu.");
  p.status = "batal";
  return p;
}
