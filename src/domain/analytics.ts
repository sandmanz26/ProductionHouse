import { EPS, freeQtyFor, roundQty, sum } from "./core";
import { diffDays, today } from "./dates";
import { isOpenWo, requirements } from "./production";
import { outstandingCheckouts, rentalCharges } from "./rentals";
import { exportWarnings, salesTotals } from "./sales";
import type { Db, ID, ISODate, Item, Lot } from "./types";

const UOM_SYMBOL: Record<string, string> = { m2: "m²", m3: "m³" };
const q = (n: number, uom?: string) =>
  `${n.toLocaleString("id-ID", { maximumFractionDigits: 3 })}${uom ? ` ${UOM_SYMBOL[uom] ?? uom}` : ""}`;
const rupiah = (n: number) => `Rp ${Math.round(n).toLocaleString("id-ID")}`;

export function inventoryValuation(db: Db) {
  const kindOf = new Map(db.items.map((i) => [i.id, i.kind]));
  let materials = 0;
  let products = 0;
  let remnants = 0;
  let rented = 0;
  let damaged = 0;
  for (const l of db.lots) {
    if (l.qty <= EPS) continue;
    const v = l.qty * l.unitCost;
    if (kindOf.get(l.itemId) === "material") materials += v;
    else products += v;
    if (l.isRemnant && l.status === "tersedia") remnants += v;
    if (l.status === "disewa") rented += v;
    if (l.status === "rusak") damaged += v;
  }
  return { materials, products, remnants, rented, damaged, total: materials + products };
}

export interface RemnantRow {
  lot: Lot;
  item: Item;
  value: number;
  ageDays: number;
  aging: boolean;
}

export function remnantRows(db: Db, asOf: ISODate = today()): RemnantRow[] {
  const items = new Map(db.items.map((i) => [i.id, i]));
  return db.lots
    .filter((l) => l.isRemnant && l.qty > EPS && l.status === "tersedia")
    .flatMap((lot) => {
      const item = items.get(lot.itemId);
      if (!item) return [];
      const ageDays = Math.max(0, diffDays(lot.createdAt, asOf));
      return [{ lot, item, value: lot.qty * lot.unitCost, ageDays, aging: ageDays >= db.settings.remnantAgingDays }];
    })
    .sort((a, b) => b.value - a.value);
}

/** Total open requirement (still to issue) per material across open work orders. */
export function openDemand(db: Db): Map<ID, number> {
  const demand = new Map<ID, number>();
  for (const wo of db.workOrders.filter(isOpenWo)) {
    for (const r of requirements(db, wo)) demand.set(r.itemId, (demand.get(r.itemId) ?? 0) + r.remaining);
  }
  return demand;
}

export interface ReorderRow {
  item: Item;
  free: number;
  demand: number;
  reorderPoint: number;
  /** Suggested purchase quantity to cover demand and get back to the reorder point. */
  suggested: number;
}

export function reorderSuggestions(db: Db): ReorderRow[] {
  const demand = openDemand(db);
  return db.items
    .filter((i) => i.kind === "material" && !i.archived)
    .map((item) => {
      const free = freeQtyFor(db, item.id);
      const d = roundQty(demand.get(item.id) ?? 0);
      const rp = item.reorderPoint ?? 0;
      const suggested = roundQty(Math.max(0, d + rp - free));
      return { item, free, demand: d, reorderPoint: rp, suggested };
    })
    .filter((r) => r.suggested > EPS && (r.free < r.demand - EPS || r.free - r.demand < r.reorderPoint - EPS))
    .sort((a, b) => b.suggested * b.item.standardCost - a.suggested * a.item.standardCost);
}

export interface ProductCostRow {
  item: Item;
  produced: number;
  avgActual: number;
  lastActual?: number;
  standard: number;
  salePrice: number;
  marginPct?: number;
}

/** Actual HPP per product from completed work orders. */
export function productCostRows(db: Db, standardCost: (item: Item) => number): ProductCostRow[] {
  const acc = new Map<ID, { qty: number; value: number; last?: number; lastAt?: string }>();
  for (const wo of db.workOrders) {
    if (wo.status !== "selesai" || !wo.cost) continue;
    for (const o of wo.cost.outputs) {
      const a = acc.get(o.itemId) ?? { qty: 0, value: 0 };
      a.qty += o.qty;
      a.value += o.unitCost * o.qty;
      if (!a.lastAt || (wo.completedAt ?? "") > a.lastAt) {
        a.last = o.unitCost;
        a.lastAt = wo.completedAt;
      }
      acc.set(o.itemId, a);
    }
  }
  return db.items
    .filter((i) => i.kind === "product" && !i.archived)
    .map((item) => {
      const a = acc.get(item.id);
      const avgActual = a && a.qty > EPS ? a.value / a.qty : 0;
      const salePrice = item.salePrice ?? 0;
      const basis = avgActual || standardCost(item);
      return {
        item,
        produced: a?.qty ?? 0,
        avgActual,
        lastActual: a?.last,
        standard: standardCost(item),
        salePrice,
        marginPct: salePrice > 0 && basis > 0 ? (salePrice - basis) / salePrice : undefined,
      };
    });
}

export function salesSummary(db: Db, from: ISODate, to: ISODate) {
  const orders = db.sales.filter((s) => s.status !== "batal" && s.status !== "draft" && s.date >= from && s.date <= to);
  const totals = orders.map((so) => ({ so, t: salesTotals(db, so) }));
  return {
    count: orders.length,
    revenueIdr: sum(totals.map((x) => x.t.subtotal * x.so.exchangeRate)),
    exportIdr: sum(totals.filter((x) => x.so.channel === "ekspor").map((x) => x.t.subtotal * x.so.exchangeRate)),
    margin: sum(totals.map((x) => x.t.margin)),
  };
}

export type InsightSeverity = "danger" | "warning" | "accent" | "success";

export interface Insight {
  id: string;
  severity: InsightSeverity;
  title: string;
  detail: string;
  to?: string;
  action?: string;
}

/**
 * Rule-based assistant: scans the whole database and surfaces what needs attention, ordered by
 * severity. Each insight links to the screen where the user can act on it.
 */
export function insights(db: Db, asOf: ISODate = today()): Insight[] {
  const out: Insight[] = [];
  const items = new Map(db.items.map((i) => [i.id, i]));
  const name = (id: ID) => items.get(id)?.name ?? "item";

  // Rentals overdue / due soon
  for (const r of db.rentals) {
    if (r.status !== "berjalan" || outstandingCheckouts(r).length === 0) continue;
    const late = diffDays(r.endDate, asOf);
    if (late > 0) {
      const ch = rentalCharges(r, asOf);
      out.push({
        id: `rental-late-${r.id}`,
        severity: "danger",
        title: `${r.code} terlambat ${late} hari`,
        detail: `${r.project} — denda berjalan ${rupiah(ch.lateFee)}.`,
        to: `/sewa/${r.id}`,
        action: "Terima kembali",
      });
    } else if (-late <= db.settings.rentalReminderDays) {
      out.push({
        id: `rental-due-${r.id}`,
        severity: "warning",
        title: `${r.code} kembali ${late === 0 ? "hari ini" : `${-late} hari lagi`}`,
        detail: `${r.project} — siapkan penjemputan unit.`,
        to: `/sewa/${r.id}`,
      });
    }
  }
  for (const r of db.rentals) {
    if (r.status === "dipesan" && r.startDate <= asOf) {
      out.push({
        id: `rental-pickup-${r.id}`,
        severity: "warning",
        title: `${r.code} harus diserahkan`,
        detail: `${r.project} mulai ${r.startDate}. Unit belum diserahkan.`,
        to: `/sewa/${r.id}`,
        action: "Serahkan unit",
      });
    }
  }

  // Material shortage for open work orders
  for (const wo of db.workOrders.filter(isOpenWo)) {
    const short = requirements(db, wo).filter((r) => r.shortage > EPS);
    if (short.length) {
      out.push({
        id: `wo-short-${wo.id}`,
        severity: "danger",
        title: `${wo.code}: bahan kurang`,
        detail: short.map((s) => `${name(s.itemId)} kurang ${q(s.shortage, items.get(s.itemId)?.uom)}`).join(", "),
        to: `/produksi/${wo.id}`,
        action: "Buat pembelian",
      });
    }
    const useRemnant = requirements(db, wo).filter((r) => r.remaining > EPS && r.freeRemnant > EPS);
    if (useRemnant.length) {
      out.push({
        id: `wo-remnant-${wo.id}`,
        severity: "accent",
        title: `${wo.code}: ada sisa material yang bisa dipakai`,
        detail: useRemnant
          .map((r) => `${name(r.itemId)} ${q(Math.min(r.freeRemnant, r.remaining), items.get(r.itemId)?.uom)}`)
          .join(", "),
        to: `/produksi/${wo.id}`,
        action: "Ambil bahan",
      });
    }
    if (wo.dueDate && wo.dueDate < asOf) {
      out.push({
        id: `wo-late-${wo.id}`,
        severity: "warning",
        title: `${wo.code} melewati target`,
        detail: `${wo.title} — target ${wo.dueDate}.`,
        to: `/produksi/${wo.id}`,
      });
    }
  }

  // Reorder
  const reorder = reorderSuggestions(db);
  if (reorder.length) {
    out.push({
      id: "reorder",
      severity: "warning",
      title: `${reorder.length} material perlu dibeli`,
      detail: reorder
        .slice(0, 3)
        .map((r) => `${r.item.name} ±${q(r.suggested, r.item.uom)}`)
        .join(", ") + (reorder.length > 3 ? ", …" : ""),
      to: "/pembelian/baru?dari=saran",
      action: "Buat pembelian",
    });
  }

  // Damaged units
  const damaged = db.lots.filter((l) => l.status === "rusak" && l.qty > EPS);
  if (damaged.length) {
    out.push({
      id: "damaged",
      severity: "warning",
      title: `${sum(damaged.map((l) => l.qty))} unit rusak menunggu perbaikan`,
      detail: [...new Set(damaged.map((l) => name(l.itemId)))].join(", "),
      to: "/stok/produk",
      action: "Buat perintah perbaikan",
    });
  }

  // Ageing remnants
  const aging = remnantRows(db, asOf).filter((r) => r.aging);
  if (aging.length) {
    out.push({
      id: "remnant-aging",
      severity: "accent",
      title: `${aging.length} sisa material berumur > ${db.settings.remnantAgingDays} hari`,
      detail: `Nilai ${rupiah(sum(aging.map((a) => a.value)))} tertahan. Pakai untuk produk kecil atau jual.`,
      to: "/stok/sisa",
    });
  }

  // Released leftovers from dedicated purchases (last 14 days)
  for (const wo of db.workOrders) {
    if (wo.status !== "selesai" || !wo.completedAt || diffDays(wo.completedAt, asOf) > 14) continue;
    const boughtFor = db.purchases.filter((p) => p.workOrderId === wo.id && p.lotIds?.length);
    const leftover = boughtFor
      .flatMap((p) => p.lotIds ?? [])
      .map((id) => db.lots.find((l) => l.id === id))
      .filter((l): l is Lot => !!l && l.qty > EPS && l.status === "tersedia");
    if (leftover.length) {
      out.push({
        id: `leftover-${wo.id}`,
        severity: "success",
        title: `Sisa pembelian ${wo.code} kini stok bebas`,
        detail: leftover.map((l) => `${name(l.itemId)} ${q(l.qty, items.get(l.itemId)?.uom)}`).join(", ") +
          " — tercatat dengan harga beli aslinya untuk produksi berikutnya.",
        to: "/stok/material",
      });
    }
  }

  // Export compliance
  for (const so of db.sales) {
    if (so.channel !== "ekspor" || so.status === "batal" || so.status === "selesai") continue;
    const w = exportWarnings(db, so);
    if (w.length) {
      out.push({
        id: `export-${so.id}`,
        severity: "warning",
        title: `${so.code}: dokumen ekspor belum lengkap`,
        detail: w[0]! + (w.length > 1 ? ` (+${w.length - 1} lainnya)` : ""),
        to: `/penjualan/${so.id}`,
      });
    }
  }

  const rank: Record<InsightSeverity, number> = { danger: 0, warning: 1, accent: 2, success: 3 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

