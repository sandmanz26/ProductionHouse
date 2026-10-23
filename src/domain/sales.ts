import { assert, assertAmount, assertDate, assertPartnerRole, createLot, EPS, freeQtyFor, getItem, getLot, getUsableItem, newId, nextCode, nowIso, recordMove, roundMoney, roundQty, suggestLots, sum, takeFromLot } from "./core";
import { assertCostOrder, orderPicks } from "./costing";
import { createWorkOrder, isProducible } from "./production";
import type {
  ContainerType,
  Currency,
  Db,
  Delivery,
  DocRef,
  ExportInfo,
  ID,
  ISODate,
  SalesChannel,
  SalesOrder,
  WorkOrder,
} from "./types";

export const soRef = (so: SalesOrder): DocRef => ({ type: "sale", id: so.id, code: so.code });

/** Practical loadable volume per container (CBM). Verify with the forwarder per shipment. */
export const CONTAINER_CBM: Record<ContainerType, number> = { LCL: 15, "20GP": 28, "40GP": 58, "40HC": 68 };
export const CONTAINER_LABEL: Record<ContainerType, string> = {
  LCL: "LCL (shared)",
  "20GP": "20' GP",
  "40GP": "40' GP",
  "40HC": "40' HC",
};

export const EU_COUNTRIES = [
  "Austria", "Belgium", "Bulgaria", "Croatia", "Cyprus", "Czechia", "Denmark", "Estonia", "Finland", "France",
  "Germany", "Greece", "Hungary", "Ireland", "Italy", "Latvia", "Lithuania", "Luxembourg", "Malta", "Netherlands",
  "Poland", "Portugal", "Romania", "Slovakia", "Slovenia", "Spain", "Sweden",
];

export const isEuDestination = (country?: string) =>
  !!country && EU_COUNTRIES.some((c) => c.toLowerCase() === country.trim().toLowerCase());

export interface SalesInput {
  channel: SalesChannel;
  customerId?: ID;
  date: ISODate;
  dueDate?: ISODate;
  currency: Currency;
  exchangeRate: number;
  lines: { itemId: ID; qty: number; unitPrice: number; spec?: string }[];
  discount?: number;
  dpPercent?: number;
  paymentDueDate?: ISODate;
  shippingCharge?: number;
  export?: ExportInfo;
  note?: string;
}

export function getSalesOrder(db: Db, id: ID): SalesOrder {
  const so = db.sales.find((s) => s.id === id);
  assert(so, "Sales order not found — it may have been deleted.");
  return so;
}

function validate(db: Db, input: SalesInput, keep?: ReadonlySet<ID>) {
  assertDate(input.date, "Order date");
  if (input.dueDate) assert(input.dueDate >= input.date, "Ship-by date cannot be before the order date.");
  if (input.paymentDueDate) assert(input.paymentDueDate >= input.date, "Payment due date cannot be before the order date.");
  assertPartnerRole(db, input.customerId, "customer");
  assert(input.lines.length > 0, "Add at least one product.");
  assert(Number.isFinite(input.exchangeRate) && input.exchangeRate > 0, "Exchange rate must be more than 0.");
  if (input.currency === "IDR") assert(input.exchangeRate === 1, "Exchange rate for IDR must be 1.");
  for (const l of input.lines) {
    const item = getUsableItem(db, l.itemId, keep);
    assert(Number.isFinite(l.qty) && l.qty > EPS, `Qty of ${item.name} must be more than 0.`);
    assertAmount(l.unitPrice, `Price of ${item.name}`);
  }
  assertAmount(input.discount ?? 0, "Discount");
  assertAmount(input.shippingCharge ?? 0, "Shipping charge");
  const dp = input.dpPercent ?? 0;
  assert(Number.isFinite(dp) && dp >= 0 && dp <= 100, "Down payment must be between 0–100%.");
  const subtotal = sum(input.lines.map((l) => l.qty * l.unitPrice));
  assert((input.discount ?? 0) <= subtotal + (input.shippingCharge ?? 0), "Discount is more than the order value — lower it.");
  if (input.channel === "ekspor") assert(input.export, "Fill in the export details.");
}

export function createSalesOrder(db: Db, input: SalesInput): SalesOrder {
  validate(db, input);
  const so: SalesOrder = {
    id: newId(),
    code: nextCode(db, "sale"),
    channel: input.channel,
    customerId: input.customerId,
    date: input.date,
    dueDate: input.dueDate,
    status: "draft",
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    lines: input.lines.map((l) => ({ id: newId(), ...l, spec: l.spec?.trim() || undefined })),
    discount: input.discount ?? 0,
    shippingCharge: input.shippingCharge ?? 0,
    export: input.channel === "ekspor" ? input.export : undefined,
    deliveries: [],
    returns: [],
    payments: [],
    dpPercent: input.dpPercent || undefined,
    paymentDueDate: input.paymentDueDate,
    note: input.note,
  };
  db.sales.push(so);
  return so;
}

export function updateSalesOrder(db: Db, id: ID, input: SalesInput): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.status === "draft" || so.status === "dikonfirmasi", "An order that has shipped cannot be edited.");
  validate(db, input, new Set(so.lines.map((l) => l.itemId)));
  const paidSoFar = sum(so.payments.map((p) => p.amount));
  assert(!so.payments.length || input.currency === so.currency, "Currency cannot change once a payment is recorded.");
  const newTotal = salesTotals(db, { ...so, lines: input.lines.map((l) => ({ id: "", ...l })), discount: input.discount ?? 0, shippingCharge: input.shippingCharge ?? 0 }).total;
  assert(newTotal + 0.01 >= paidSoFar, "The new total is less than what was already paid — record a refund first.");
  Object.assign(so, {
    channel: input.channel,
    customerId: input.customerId,
    date: input.date,
    dueDate: input.dueDate,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    lines: input.lines.map((l) => ({ id: newId(), ...l, spec: l.spec?.trim() || undefined })),
    discount: input.discount ?? 0,
    shippingCharge: input.shippingCharge ?? 0,
    export: input.channel === "ekspor" ? input.export : undefined,
    dpPercent: input.dpPercent || undefined,
    paymentDueDate: input.paymentDueDate,
    note: input.note,
  });
  return so;
}

/** Export/shipping fields remain editable until the order is closed. */
export function updateExportInfo(db: Db, id: ID, info: ExportInfo): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.channel === "ekspor", "This is not an export order.");
  assert(so.status !== "batal" && so.status !== "selesai", "This order is already closed.");
  so.export = info;
  return so;
}

export function confirmSalesOrder(db: Db, id: ID): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.status === "draft", "This order is already confirmed.");
  assert(so.customerId, "Choose a customer before confirming the order.");
  so.status = "dikonfirmasi";
  return so;
}

export function deliveredQty(so: SalesOrder, itemId: ID): number {
  return roundQty(sum(so.deliveries.flatMap((d) => d.lines.filter((l) => l.itemId === itemId).map((l) => l.qty))));
}

export function orderedQty(so: SalesOrder, itemId: ID): number {
  return roundQty(sum(so.lines.filter((l) => l.itemId === itemId).map((l) => l.qty)));
}

export function outstandingLines(so: SalesOrder) {
  const ids = [...new Set(so.lines.map((l) => l.itemId))];
  return ids
    .map((itemId) => ({ itemId, qty: roundQty(orderedQty(so, itemId) - deliveredQty(so, itemId)) }))
    .filter((l) => l.qty > EPS);
}

/**
 * Ships goods. Without explicit picks, lots are chosen FIFO. COGS is captured from lot cost.
 */
export function deliverSalesOrder(
  db: Db,
  id: ID,
  lines: { itemId: ID; qty: number; picks?: { lotId: ID; qty: number }[] }[],
  opts: { at?: string; note?: string } = {},
): Delivery {
  const so = getSalesOrder(db, id);
  assert(so.status === "dikonfirmasi" || so.status === "dikirim_sebagian", "Confirm the order before shipping.");
  const at = opts.at ?? nowIso();
  const ref = soRef(so);
  const delivery: Delivery = { id: newId(), at, lines: [], note: opts.note };
  const valid = lines.filter((l) => l.qty > EPS);
  assert(valid.length > 0, "Enter the qty to ship.");
  for (const line of valid) {
    const item = getItem(db, line.itemId);
    const outstanding = roundQty(orderedQty(so, line.itemId) - deliveredQty(so, line.itemId));
    assert(line.qty <= outstanding + EPS, `Ship qty of ${item.name} is more than what is left on the order (${outstanding}).`);
    let picks = line.picks;
    if (!picks) {
      const s = suggestLots(db, line.itemId, line.qty, { useRemnants: false });
      assert(s.shortage <= EPS, `Not enough ${item.name} in stock to ship (short ${s.shortage} ${item.uom}).`);
      picks = s.picks;
    }
    assert(Math.abs(sum(picks.map((p) => p.qty)) - line.qty) < EPS, `Lots picked for ${item.name} do not add up to the ship qty.`);
    for (const p of orderPicks(db, picks)) {
      const lot = getLot(db, p.lotId);
      assert(lot.itemId === line.itemId, "Lot does not match the product — pick a lot of this item.");
      assertCostOrder(db, lot.id);
      takeFromLot(db, lot.id, p.qty, "keluar_penjualan", ref, { at });
      delivery.lines.push({ itemId: line.itemId, lotId: lot.id, qty: roundQty(p.qty), unitCost: lot.unitCost });
    }
  }
  so.deliveries.push(delivery);
  so.status = outstandingLines(so).length === 0 ? "dikirim" : "dikirim_sebagian";
  return delivery;
}

export function completeSalesOrder(db: Db, id: ID): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.status === "dikirim", "Ship the order in full before completing it.");
  const paid = sum(so.payments.map((p) => p.amount));
  const balance = salesTotals(db, so).total - paid;
  assert(balance <= 0.5, `${roundMoney(balance)} ${so.currency} is still unpaid — record the final payment first.`);
  so.status = "selesai";
  return so;
}

export function cancelSalesOrder(db: Db, id: ID): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.deliveries.length === 0, "An order with deliveries cannot be cancelled.");
  assert(so.payments.length === 0, "This order has payments — refund or delete them first.");
  assert(so.status !== "batal", "This order is already cancelled.");
  so.status = "batal";
  return so;
}

export interface SalesTotals {
  subtotal: number;
  /** Credit notes for returned goods (order currency). */
  returnCredit: number;
  total: number;
  totalIdr: number;
  /** Revenue of delivered goods in IDR (pro-rata of discount/shipping excluded). */
  deliveredRevenueIdr: number;
  cogs: number;
  margin: number;
  marginPct: number;
  /** Estimated COGS for undelivered quantities at current average/standard cost. */
  estimatedCogsOutstanding: number;
}

export function salesTotals(db: Pick<Db, "items" | "lots">, so: SalesOrder): SalesTotals {
  const subtotal = sum(so.lines.map((l) => l.qty * l.unitPrice));
  const returnCredit = sum(so.returns.map((r) => r.credit));
  const total = subtotal - so.discount + so.shippingCharge - returnCredit;
  const priceOf = (itemId: ID) => {
    const ls = so.lines.filter((l) => l.itemId === itemId);
    const q = sum(ls.map((l) => l.qty));
    return q > EPS ? sum(ls.map((l) => l.qty * l.unitPrice)) / q : 0;
  };
  const delivered = so.deliveries.flatMap((d) => d.lines);
  const deliveredRevenueIdr = sum(delivered.map((l) => l.qty * priceOf(l.itemId))) * so.exchangeRate;
  const cogs = sum(delivered.map((l) => l.qty * l.unitCost)) - sum(so.returns.map((r) => r.qty * r.unitCost));
  const estimatedCogsOutstanding = sum(
    outstandingLines(so).map((l) => {
      const lots = db.lots.filter((x) => x.itemId === l.itemId && x.qty > EPS);
      const q = sum(lots.map((x) => x.qty));
      const avg = q > EPS ? sum(lots.map((x) => x.qty * x.unitCost)) / q : (db.items.find((i) => i.id === l.itemId)?.standardCost ?? 0);
      return l.qty * avg;
    }),
  );
  const totalIdr = total * so.exchangeRate;
  const fullCogs = cogs + estimatedCogsOutstanding;
  const netSales = subtotal - returnCredit;
  const margin = netSales * so.exchangeRate - fullCogs;
  return {
    subtotal: roundMoney(subtotal),
    returnCredit: roundMoney(returnCredit),
    total: roundMoney(total),
    totalIdr: roundMoney(totalIdr),
    deliveredRevenueIdr: roundMoney(deliveredRevenueIdr),
    cogs: roundMoney(cogs),
    margin: roundMoney(margin),
    marginPct: netSales > EPS ? margin / (netSales * so.exchangeRate) : 0,
    estimatedCogsOutstanding: roundMoney(estimatedCogsOutstanding),
  };
}

export interface PackingRow {
  itemId: ID;
  sku: string;
  name: string;
  hsCode?: string;
  qty: number;
  cartons: number;
  cbm: number;
  grossKg: number;
  netKg: number;
  missingSpec: boolean;
}

export function packingList(db: Pick<Db, "items">, so: SalesOrder) {
  const rows: PackingRow[] = so.lines.map((l) => {
    const item = db.items.find((i) => i.id === l.itemId);
    const p = item?.packing;
    const cartons = p ? Math.ceil(p.cartonsPerUnit * l.qty) : 0;
    const cbmPerCarton = p ? (p.length * p.width * p.height) / 1_000_000 : 0;
    return {
      itemId: l.itemId,
      sku: item?.sku ?? "-",
      name: item?.name ?? "(deleted item)",
      hsCode: item?.hsCode,
      qty: l.qty,
      cartons,
      cbm: roundQty(cbmPerCarton * cartons),
      grossKg: roundQty((p?.grossWeightKg ?? 0) * l.qty),
      netKg: roundQty((p?.netWeightKg ?? 0) * l.qty),
      missingSpec: !p,
    };
  });
  const totals = {
    qty: sum(rows.map((r) => r.qty)),
    cartons: sum(rows.map((r) => r.cartons)),
    cbm: roundQty(sum(rows.map((r) => r.cbm))),
    grossKg: roundQty(sum(rows.map((r) => r.grossKg))),
    netKg: roundQty(sum(rows.map((r) => r.netKg))),
  };
  const capacity = so.export ? CONTAINER_CBM[so.export.containerType] : 0;
  return {
    rows,
    totals,
    capacity,
    fill: capacity ? totals.cbm / capacity : 0,
    remainingCbm: capacity ? roundQty(capacity - totals.cbm) : 0,
  };
}

/** Export compliance gaps, shown as warnings (never blocking). */
export function exportWarnings(db: Pick<Db, "items">, so: SalesOrder): string[] {
  if (so.channel !== "ekspor" || !so.export) return [];
  const w: string[] = [];
  const e = so.export;
  if (!e.vLegalNo) w.push("V-Legal document no. (SVLK) is not filled in.");
  if (isEuDestination(e.destinationCountry) && !e.eudrDdsRef)
    w.push("EU destination: Due Diligence Statement (EUDR) reference is not filled in.");
  const pl = packingList(db, so);
  const missing = pl.rows.filter((r) => r.missingSpec).map((r) => r.name);
  if (missing.length) w.push(`Packing data is incomplete: ${missing.join(", ")}.`);
  const noHs = so.lines.map((l) => db.items.find((i) => i.id === l.itemId)).filter((i) => i && !i.hsCode);
  if (noHs.length) w.push(`HS code is not filled in: ${noHs.map((i) => i!.name).join(", ")}.`);
  if (pl.capacity && pl.fill > 1) w.push(`Volume ${pl.totals.cbm} CBM is more than the container holds (${pl.capacity} CBM).`);
  return w;
}

/** Products that cannot be shipped from free stock, i.e. need to be produced. */
export function productionShortages(db: Db, so: SalesOrder) {
  const openWoQty = (itemId: ID) =>
    sum(
      db.workOrders
        .filter((w) => w.salesOrderId === so.id && (w.status === "rencana" || w.status === "berjalan"))
        .flatMap((w) => w.plannedOutputs.filter((o) => o.itemId === itemId).map((o) => o.qty)),
    );
  return outstandingLines(so)
    .filter((l) => isProducible(getItem(db, l.itemId)))
    .map((l) => {
      const free = freeQtyFor(db, l.itemId);
      const inProduction = openWoQty(l.itemId);
      return { itemId: l.itemId, outstanding: l.qty, free, inProduction, shortage: roundQty(Math.max(0, l.qty - free - inProduction)) };
    })
    .filter((l) => l.shortage > EPS);
}

export function createWorkOrdersForShortage(db: Db, soId: ID): WorkOrder[] {
  const so = getSalesOrder(db, soId);
  assert(so.status !== "batal" && so.status !== "selesai", "This order is already closed.");
  const shortages = productionShortages(db, so);
  assert(shortages.length > 0, "Stock is enough — no extra production needed.");
  return shortages.map((s) => {
    const specs = so.lines.filter((l) => l.itemId === s.itemId && l.spec).map((l) => l.spec);
    return createWorkOrder(db, {
      type: "produksi",
      title: `${getItem(db, s.itemId).name} for ${so.code}`,
      plannedOutputs: [{ itemId: s.itemId, qty: s.shortage }],
      salesOrderId: so.id,
      dueDate: so.dueDate,
      note: specs.length ? `Order spec: ${specs.join("; ")}` : undefined,
    });
  });
}

export function saleReturnedQty(so: SalesOrder, itemId: ID): number {
  return roundQty(sum(so.returns.filter((r) => r.itemId === itemId).map((r) => r.qty)));
}

/**
 * Customer return (sales return). Goods come back at their original delivery cost — good
 * units as available stock, defective units as damaged (ready for a repair order) — and the
 * customer is credited at the order price.
 */
export function returnSale(
  db: Db,
  soId: ID,
  entries: { itemId: ID; qty: number; condition: "baik" | "rusak"; note?: string }[],
  opts: { at?: string; location?: string } = {},
): SalesOrder {
  const so = getSalesOrder(db, soId);
  assert(so.deliveries.length > 0, "Nothing has shipped yet, so nothing can be returned.");
  const valid = entries.filter((e) => e.qty > EPS);
  assert(valid.length > 0, "Enter the return qty.");
  const at = opts.at ?? nowIso();
  const ref = soRef(so);
  for (const e of valid) {
    const item = getItem(db, e.itemId);
    const delivered = deliveredQty(so, e.itemId);
    // Earlier entries of this call are already pushed to so.returns.
    const already = saleReturnedQty(so, e.itemId);
    assert(e.qty <= delivered - already + EPS, `Return of ${item.name} is more than was shipped (${roundQty(delivered - already)} left).`);
    const lines = so.deliveries.flatMap((d) => d.lines.filter((l) => l.itemId === e.itemId));
    const unitCost = roundMoney(sum(lines.map((l) => l.qty * l.unitCost)) / sum(lines.map((l) => l.qty)));
    const ordered = so.lines.filter((l) => l.itemId === e.itemId);
    const price = sum(ordered.map((l) => l.qty * l.unitPrice)) / sum(ordered.map((l) => l.qty));
    const lot = createLot(db, {
      itemId: e.itemId,
      qty: e.qty,
      unitCost,
      origin: "retur_penjualan",
      originRef: ref,
      isRemnant: false,
      location: opts.location || db.settings.defaultLocation,
      status: e.condition === "rusak" ? "rusak" : "tersedia",
      createdAt: at,
      note: e.note,
    });
    recordMove(db, { lot, qty: lot.qty, type: "retur_penjualan", ref, at, note: e.note });
    so.returns.push({
      id: newId(),
      at,
      itemId: e.itemId,
      qty: roundQty(e.qty),
      condition: e.condition,
      unitCost,
      credit: roundMoney(e.qty * price),
      lotId: lot.id,
      note: e.note,
    });
  }
  return so;
}
