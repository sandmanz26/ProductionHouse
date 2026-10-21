import { assert, EPS, freeQtyFor, getItem, getLot, newId, nextCode, nowIso, roundMoney, roundQty, suggestLots, sum, takeFromLot } from "./core";
import { createWorkOrder } from "./production";
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
  LCL: "LCL (gabungan)",
  "20GP": "20' GP",
  "40GP": "40' GP",
  "40HC": "40' HC",
};

export const EU_COUNTRIES = [
  "Austria", "Belgia", "Bulgaria", "Kroasia", "Siprus", "Ceko", "Denmark", "Estonia", "Finlandia", "Prancis",
  "Jerman", "Yunani", "Hungaria", "Irlandia", "Italia", "Latvia", "Lituania", "Luksemburg", "Malta", "Belanda",
  "Polandia", "Portugal", "Rumania", "Slowakia", "Slovenia", "Spanyol", "Swedia",
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
  lines: { itemId: ID; qty: number; unitPrice: number }[];
  discount?: number;
  shippingCharge?: number;
  export?: ExportInfo;
  note?: string;
}

export function getSalesOrder(db: Db, id: ID): SalesOrder {
  const so = db.sales.find((s) => s.id === id);
  assert(so, "Order penjualan tidak ditemukan.");
  return so;
}

function validate(db: Db, input: SalesInput) {
  assert(input.lines.length > 0, "Tambahkan minimal satu produk.");
  assert(input.exchangeRate > 0, "Kurs harus lebih dari 0.");
  if (input.currency === "IDR") assert(input.exchangeRate === 1, "Kurs IDR harus 1.");
  for (const l of input.lines) {
    const item = getItem(db, l.itemId);
    assert(l.qty > EPS, `Qty ${item.name} harus lebih dari 0.`);
    assert(l.unitPrice >= 0, `Harga ${item.name} tidak boleh negatif.`);
  }
  assert((input.discount ?? 0) >= 0 && (input.shippingCharge ?? 0) >= 0, "Diskon/ongkir tidak boleh negatif.");
  if (input.channel === "ekspor") assert(input.export, "Lengkapi data ekspor.");
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
    lines: input.lines.map((l) => ({ id: newId(), ...l })),
    discount: input.discount ?? 0,
    shippingCharge: input.shippingCharge ?? 0,
    export: input.channel === "ekspor" ? input.export : undefined,
    deliveries: [],
    note: input.note,
  };
  db.sales.push(so);
  return so;
}

export function updateSalesOrder(db: Db, id: ID, input: SalesInput): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.status === "draft" || so.status === "dikonfirmasi", "Order yang sudah dikirim tidak bisa diubah.");
  validate(db, input);
  Object.assign(so, {
    channel: input.channel,
    customerId: input.customerId,
    date: input.date,
    dueDate: input.dueDate,
    currency: input.currency,
    exchangeRate: input.exchangeRate,
    lines: input.lines.map((l) => ({ id: newId(), ...l })),
    discount: input.discount ?? 0,
    shippingCharge: input.shippingCharge ?? 0,
    export: input.channel === "ekspor" ? input.export : undefined,
    note: input.note,
  });
  return so;
}

/** Export/shipping fields remain editable until the order is closed. */
export function updateExportInfo(db: Db, id: ID, info: ExportInfo): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.channel === "ekspor", "Bukan order ekspor.");
  assert(so.status !== "batal" && so.status !== "selesai", "Order sudah ditutup.");
  so.export = info;
  return so;
}

export function confirmSalesOrder(db: Db, id: ID): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.status === "draft", "Order sudah dikonfirmasi.");
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
  assert(so.status === "dikonfirmasi" || so.status === "dikirim_sebagian", "Konfirmasi order sebelum mengirim.");
  const at = opts.at ?? nowIso();
  const ref = soRef(so);
  const delivery: Delivery = { id: newId(), at, lines: [], note: opts.note };
  const valid = lines.filter((l) => l.qty > EPS);
  assert(valid.length > 0, "Isi qty yang dikirim.");
  for (const line of valid) {
    const item = getItem(db, line.itemId);
    const outstanding = roundQty(orderedQty(so, line.itemId) - deliveredQty(so, line.itemId));
    assert(line.qty <= outstanding + EPS, `Qty kirim ${item.name} melebihi sisa order (${outstanding}).`);
    let picks = line.picks;
    if (!picks) {
      const s = suggestLots(db, line.itemId, line.qty, { useRemnants: false });
      assert(s.shortage <= EPS, `Stok ${item.name} tidak cukup untuk dikirim (kurang ${s.shortage} ${item.uom}).`);
      picks = s.picks;
    }
    assert(Math.abs(sum(picks.map((p) => p.qty)) - line.qty) < EPS, `Pilihan lot ${item.name} tidak sama dengan qty kirim.`);
    for (const p of picks) {
      const lot = getLot(db, p.lotId);
      assert(lot.itemId === line.itemId, "Lot tidak sesuai dengan produk.");
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
  assert(so.status === "dikirim", "Order harus terkirim penuh sebelum diselesaikan.");
  so.status = "selesai";
  return so;
}

export function cancelSalesOrder(db: Db, id: ID): SalesOrder {
  const so = getSalesOrder(db, id);
  assert(so.deliveries.length === 0, "Order yang sudah ada pengiriman tidak dapat dibatalkan.");
  assert(so.status !== "batal", "Order sudah dibatalkan.");
  so.status = "batal";
  return so;
}

export interface SalesTotals {
  subtotal: number;
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
  const total = subtotal - so.discount + so.shippingCharge;
  const priceOf = (itemId: ID) => {
    const ls = so.lines.filter((l) => l.itemId === itemId);
    const q = sum(ls.map((l) => l.qty));
    return q > EPS ? sum(ls.map((l) => l.qty * l.unitPrice)) / q : 0;
  };
  const delivered = so.deliveries.flatMap((d) => d.lines);
  const deliveredRevenueIdr = sum(delivered.map((l) => l.qty * priceOf(l.itemId))) * so.exchangeRate;
  const cogs = sum(delivered.map((l) => l.qty * l.unitCost));
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
  const margin = subtotal * so.exchangeRate - fullCogs;
  return {
    subtotal: roundMoney(subtotal),
    total: roundMoney(total),
    totalIdr: roundMoney(totalIdr),
    deliveredRevenueIdr: roundMoney(deliveredRevenueIdr),
    cogs: roundMoney(cogs),
    margin: roundMoney(margin),
    marginPct: subtotal > EPS ? margin / (subtotal * so.exchangeRate) : 0,
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
      name: item?.name ?? "(item terhapus)",
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
  if (!e.vLegalNo) w.push("No. Dokumen V-Legal (SVLK) belum diisi.");
  if (isEuDestination(e.destinationCountry) && !e.eudrDdsRef)
    w.push("Tujuan Uni Eropa: referensi Due Diligence Statement (EUDR) belum diisi.");
  const pl = packingList(db, so);
  const missing = pl.rows.filter((r) => r.missingSpec).map((r) => r.name);
  if (missing.length) w.push(`Data kemasan belum lengkap: ${missing.join(", ")}.`);
  const noHs = so.lines.map((l) => db.items.find((i) => i.id === l.itemId)).filter((i) => i && !i.hsCode);
  if (noHs.length) w.push(`HS Code belum diisi: ${noHs.map((i) => i!.name).join(", ")}.`);
  if (pl.capacity && pl.fill > 1) w.push(`Volume ${pl.totals.cbm} CBM melebihi kapasitas kontainer (${pl.capacity} CBM).`);
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
    .map((l) => {
      const free = freeQtyFor(db, l.itemId);
      const inProduction = openWoQty(l.itemId);
      return { itemId: l.itemId, outstanding: l.qty, free, inProduction, shortage: roundQty(Math.max(0, l.qty - free - inProduction)) };
    })
    .filter((l) => l.shortage > EPS);
}

export function createWorkOrdersForShortage(db: Db, soId: ID): WorkOrder[] {
  const so = getSalesOrder(db, soId);
  assert(so.status !== "batal" && so.status !== "selesai", "Order sudah ditutup.");
  const shortages = productionShortages(db, so);
  assert(shortages.length > 0, "Stok cukup — tidak perlu produksi tambahan.");
  return shortages.map((s) =>
    createWorkOrder(db, {
      type: "produksi",
      title: `${getItem(db, s.itemId).name} untuk ${so.code}`,
      plannedOutputs: [{ itemId: s.itemId, qty: s.shortage }],
      salesOrderId: so.id,
      dueDate: so.dueDate,
    }),
  );
}
