/**
 * Process maps. Every builder returns the same shape — columns of nodes joined by links whose
 * width is money (Rp) — so one diagram component can draw a work order, a recipe, a lot's
 * genealogy and the whole workshop. Values are cost, never quantity, because a flow from
 * timber (m³) into chairs (pcs) only adds up in Rupiah.
 */
import { EPS, roundMoney, sum } from "./core";
import { allocationBasis, laborCostOf, plannedRequirement } from "./production";
import { recipeCost, standardValue } from "./recipes";
import type { Db, ID, ISODate, Lot, Recipe, StockMove, WorkOrder } from "./types";

/** What a node represents; the diagram colours by this. */
export type FlowKind = "bahan" | "produk" | "sisa" | "biaya" | "proses" | "stok" | "rugi";

export interface FlowNode {
  id: string;
  label: string;
  sub?: string;
  column: number;
  kind: FlowKind;
  /** App route to open when the node is clicked. */
  to?: string;
}

export interface FlowLink {
  source: string;
  target: string;
  value: number;
  /** Standard / planned rather than recorded. */
  estimated?: boolean;
}

export interface FlowGraph {
  nodes: FlowNode[];
  links: FlowLink[];
  /** The whole graph is a plan (nothing recorded yet). */
  estimated?: boolean;
}

class Builder {
  nodes = new Map<string, FlowNode>();
  links = new Map<string, FlowLink>();
  node(n: FlowNode) {
    if (!this.nodes.has(n.id)) this.nodes.set(n.id, n);
    return n.id;
  }
  link(source: string, target: string, value: number, estimated?: boolean) {
    if (!(value > 0.5)) return;
    const key = `${source}→${target}`;
    const cur = this.links.get(key);
    if (cur) cur.value += value;
    else this.links.set(key, { source, target, value, estimated });
  }
  build(estimated?: boolean): FlowGraph {
    const links = [...this.links.values()].map((l) => ({ ...l, value: roundMoney(l.value) }));
    const used = new Set(links.flatMap((l) => [l.source, l.target]));
    const nodes = [...this.nodes.values()].filter((n) => used.has(n.id));
    // Columns may be negative while building (genealogy); shift so the first is 0.
    const min = Math.min(0, ...nodes.map((n) => n.column));
    return { nodes: nodes.map((n) => ({ ...n, column: n.column - min })), links, estimated };
  }
}

const itemKind = (db: Db, itemId: ID): FlowKind => (db.items.find((i) => i.id === itemId)?.kind === "product" ? "produk" : "bahan");
const itemName = (db: Db, itemId: ID) => db.items.find((i) => i.id === itemId)?.name ?? "?";
const lotKind = (db: Db, lot: Lot): FlowKind => (lot.isRemnant ? "sisa" : itemKind(db, lot.itemId));
const codes = (xs: string[]) => (xs.length > 3 ? `${xs.slice(0, 3).join(", ")} +${xs.length - 3}` : xs.join(", "));

function docNode(db: Db, ref: StockMove["ref"], column: number): FlowNode {
  const to = { purchase: `/pembelian/${ref.id}`, workOrder: `/produksi/${ref.id}`, sale: `/penjualan/${ref.id}`, rental: `/sewa/${ref.id}` } as Record<string, string>;
  if (ref.type === "purchase") {
    const p = db.purchases.find((x) => x.id === ref.id);
    const supplier = db.partners.find((x) => x.id === p?.supplierId)?.name;
    return { id: `doc:${ref.id}`, label: `Pembelian ${ref.code}`, sub: supplier, column, kind: "bahan", to: to.purchase };
  }
  if (ref.type === "workOrder") {
    const w = db.workOrders.find((x) => x.id === ref.id);
    return { id: `doc:${ref.id}`, label: ref.code, sub: w?.title, column, kind: "proses", to: to.workOrder };
  }
  if (ref.type === "sale") {
    const so = db.sales.find((x) => x.id === ref.id);
    const customer = db.partners.find((x) => x.id === so?.customerId)?.name;
    return { id: `doc:${ref.id}`, label: `Terjual ${ref.code}`, sub: customer, column, kind: "produk", to: to.sale };
  }
  if (ref.type === "rental") return { id: `doc:${ref.id}`, label: `Sewa ${ref.code}`, column, kind: "stok", to: to.rental };
  return { id: `doc:${ref.type}`, label: ref.type === "adjustment" ? "Saldo awal / penyesuaian" : ref.code, column, kind: "stok" };
}

// ------------------------------------------------------------------ Work order

/**
 * Inputs (by item, remnants apart) + labour → the work order → outputs, offcuts, returns and
 * losses → where the output went. Closed orders use the locked HPP; open ones show what has been
 * put in so far; plans with nothing issued show the standard (estimated).
 */
export function workOrderFlow(db: Db, wo: WorkOrder): FlowGraph {
  const b = new Builder();
  const center = b.node({ id: `wo:${wo.id}`, label: wo.code, sub: wo.title, column: 1, kind: "proses" });
  const lotOf = new Map(db.lots.map((l) => [l.id, l]));

  if (!wo.issues.length && !wo.cost) {
    // Plan only: standard material, standard labour, planned outputs.
    let total = 0;
    for (const [itemId, p] of plannedRequirement(db, wo)) {
      const value = p.qty * standardValue(db, itemId);
      total += value;
      b.link(b.node({ id: `in:${itemId}`, label: itemName(db, itemId), sub: "kebutuhan standar", column: 0, kind: itemKind(db, itemId), to: `/stok/item/${itemId}` }), center, value, true);
    }
    const labor = wo.laborHours * wo.laborRate;
    total += labor + wo.overhead;
    b.link(b.node({ id: "labor", label: "Tenaga kerja", sub: `${wo.laborHours} jam rencana`, column: 0, kind: "biaya" }), center, labor, true);
    b.link(b.node({ id: "overhead", label: "Overhead & biaya lain", column: 0, kind: "biaya" }), center, wo.overhead + sum(wo.extraCosts.map((c) => c.amount)), true);
    splitOver(db, b, center, wo.plannedOutputs, total, true);
    return b.build(true);
  }

  // Inputs actually issued.
  for (const iss of wo.issues) {
    const lot = lotOf.get(iss.lotId);
    const remnant = !!lot?.isRemnant;
    const id = `in:${iss.itemId}:${remnant ? "sisa" : "lot"}`;
    const lotsOfThis = wo.issues.filter((x) => x.itemId === iss.itemId && !!lotOf.get(x.lotId)?.isRemnant === remnant).map((x) => lotOf.get(x.lotId)?.code ?? "?");
    b.node({
      id,
      label: remnant ? `${itemName(db, iss.itemId)} (sisa)` : itemName(db, iss.itemId),
      sub: codes([...new Set(lotsOfThis)]),
      column: 0,
      kind: remnant ? "sisa" : itemKind(db, iss.itemId),
      to: `/stok/item/${iss.itemId}`,
    });
    b.link(id, center, iss.qty * iss.unitCost);
  }

  const cost = wo.cost;
  const labor = cost ? cost.labor : laborCostOf(wo).amount;
  const overhead = cost ? cost.overhead + cost.extra : wo.overhead + sum(wo.extraCosts.map((c) => c.amount));
  b.link(b.node({ id: "labor", label: "Tenaga kerja", sub: cost?.laborFromLogs || wo.laborLogs.length ? "dari catatan kerja" : "jam rencana", column: 0, kind: "biaya" }), center, labor, !cost && !wo.laborLogs.length);
  b.link(b.node({ id: "overhead", label: "Overhead & biaya lain", column: 0, kind: "biaya" }), center, overhead, !cost);

  if (!cost) {
    const issued = sum(wo.issues.map((i) => i.qty * i.unitCost));
    let received = 0;
    for (const r of wo.receipts) {
      const v = r.qty * r.provisionalUnitCost;
      received += v;
      b.link(center, b.node({ id: `out:${r.itemId}`, label: itemName(db, r.itemId), sub: "hasil sebagian", column: 2, kind: itemKind(db, r.itemId), to: `/stok/item/${r.itemId}` }), v);
    }
    const wip = b.node({ id: "wip", label: "Dalam proses", sub: "belum jadi barang", column: 2, kind: "stok" });
    b.link(center, wip, Math.max(0, issued + labor + overhead - received), !wo.laborLogs.length);
    destinations(db, b, wo, 3);
    return b.build();
  }

  for (const o of cost.outputs) {
    const id = b.node({ id: `out:${o.itemId}`, label: itemName(db, o.itemId), sub: `${o.qty} × ${Math.round(o.unitCost).toLocaleString("id-ID")}`, column: 2, kind: itemKind(db, o.itemId), to: `/stok/item/${o.itemId}` });
    b.link(center, id, o.allocated - o.writeOff);
  }
  const avg = new Map(cost.lines.map((l) => [l.itemId, l.avgUnitCost]));
  for (const r of wo.returns) {
    if (r.kind === "utuh") {
      const unit = wo.issues.find((i) => i.lotId === r.lotId)?.unitCost ?? avg.get(r.itemId) ?? 0;
      b.link(center, b.node({ id: `ret:${r.itemId}`, label: `${itemName(db, r.itemId)} kembali utuh`, column: 2, kind: itemKind(db, r.itemId), to: `/stok/item/${r.itemId}` }), r.qty * unit);
    } else if (r.kind === "sisa") {
      b.link(center, b.node({ id: `sisa:${r.itemId}`, label: `Sisa ${itemName(db, r.itemId)}`, sub: "masuk gudang dengan harganya", column: 2, kind: "sisa", to: "/stok/sisa" }), r.qty * (avg.get(r.itemId) ?? 0));
    } else {
      b.link(center, b.node({ id: "salvage", label: "Limbah dijual", column: 2, kind: "rugi" }), r.salvageValue ?? 0);
    }
  }
  b.link(center, b.node({ id: "writeoff", label: "Rugi bongkar", sub: "di atas nilai bahan baru", column: 2, kind: "rugi" }), cost.writeOff);
  destinations(db, b, wo, 3);
  return b.build();
}

/** Planned outputs share `total` by value basis (standard / sale price). */
function splitOver(db: Db, b: Builder, from: string, outputs: { itemId: ID; qty: number }[], total: number, estimated?: boolean) {
  const weights = outputs.map((o) => {
    const item = db.items.find((i) => i.id === o.itemId);
    return item ? o.qty * allocationBasis(item) : 0;
  });
  const tw = sum(weights) || outputs.length;
  outputs.forEach((o, i) => {
    const id = b.node({ id: `out:${o.itemId}`, label: itemName(db, o.itemId), sub: `rencana ${o.qty}`, column: 2, kind: itemKind(db, o.itemId), to: `/stok/item/${o.itemId}` });
    b.link(from, id, (total * (sum(weights) ? (weights[i] ?? 0) : 1)) / tw, estimated);
  });
}

/** Lot ids descending from `roots` through splits (transfers, rental hand-overs). */
function withSplits(db: Db, roots: ID[]): Lot[] {
  const out: Lot[] = [];
  const queue = [...roots];
  const seen = new Set<ID>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    const lot = db.lots.find((l) => l.id === id);
    if (!lot) continue;
    out.push(lot);
    for (const child of db.lots) if (child.splitFrom === id) queue.push(child.id);
  }
  return out;
}

export interface LotFate {
  sold: number;
  reused: number;
  lost: number;
  inStock: number;
  rented: number;
  damaged: number;
  /** Per destination document (sales orders, work orders) for drill-down. */
  byDoc: Map<string, { ref: StockMove["ref"]; value: number; kind: "sold" | "reused" }>;
}

/** Where the value of some lots (and everything split off them) ended up. */
export function lotFate(db: Db, roots: ID[]): LotFate {
  const lots = withSplits(db, roots);
  const ids = new Set(lots.map((l) => l.id));
  const fate: LotFate = { sold: 0, reused: 0, lost: 0, inStock: 0, rented: 0, damaged: 0, byDoc: new Map() };
  for (const m of db.moves) {
    if (!ids.has(m.lotId) || m.qty >= 0) continue;
    const value = -m.qty * m.unitCost;
    if (m.type === "keluar_penjualan" || m.type === "keluar_produksi") {
      const kind = m.type === "keluar_penjualan" ? "sold" : "reused";
      fate[kind] += value;
      const cur = fate.byDoc.get(m.ref.id) ?? { ref: m.ref, value: 0, kind };
      cur.value += value;
      fate.byDoc.set(m.ref.id, cur);
    } else if (m.type === "hilang" || m.type === "limbah" || m.type === "penyesuaian") fate.lost += value;
  }
  // Returned production issues come back into the same lot; net them off.
  for (const m of db.moves) {
    if (!ids.has(m.lotId) || m.type !== "kembali_produksi") continue;
    const value = m.qty * m.unitCost;
    fate.reused -= value;
    const cur = fate.byDoc.get(m.ref.id);
    if (cur) cur.value -= value;
  }
  for (const l of lots) {
    const v = l.qty * l.unitCost;
    if (l.status === "disewa") fate.rented += v;
    else if (l.status === "rusak") fate.damaged += v;
    else fate.inStock += v;
  }
  return fate;
}

function addFate(b: Builder, db: Db, from: string, fate: LotFate, column: number, share = 1) {
  const docs = [...fate.byDoc.values()].filter((d) => d.value > 0.5).sort((a, c) => c.value - a.value);
  const top = docs.slice(0, 4);
  for (const d of top) b.link(from, b.node(docNode(db, d.ref, column)), d.value * share);
  const rest = docs.slice(4);
  if (rest.length) b.link(from, b.node({ id: "dest:lain", label: `${rest.length} dokumen lain`, column, kind: "stok" }), sum(rest.map((d) => d.value)) * share);
  b.link(from, b.node({ id: "dest:gudang", label: "Masih di gudang", column, kind: "stok" }), fate.inStock * share);
  b.link(from, b.node({ id: "dest:sewa", label: "Sedang disewa", column, kind: "stok" }), fate.rented * share);
  b.link(from, b.node({ id: "dest:rusak", label: "Rusak", column, kind: "rugi" }), fate.damaged * share);
  b.link(from, b.node({ id: "dest:hilang", label: "Hilang / dibuang", column, kind: "rugi" }), fate.lost * share);
}

/** Where each output of a work order went (sold, used again, still in stock…). */
function destinations(db: Db, b: Builder, wo: WorkOrder, column: number) {
  const created = new Set([...(wo.createdLotIds ?? []), ...wo.receipts.map((r) => r.lotId)]);
  const byItem = new Map<string, ID[]>();
  for (const id of created) {
    const lot = db.lots.find((l) => l.id === id);
    if (!lot) continue;
    const from = lot.isRemnant ? `sisa:${lot.itemId}` : `out:${lot.itemId}`;
    if (!b.nodes.has(from)) continue;
    byItem.set(from, [...(byItem.get(from) ?? []), id]);
  }
  for (const [from, ids] of byItem) addFate(b, db, from, lotFate(db, ids), column);
}

// ------------------------------------------------------------------ Recipe

/** The recipe at standard cost: inputs and labour → recipe → outputs and expected offcuts. */
export function recipeFlow(db: Db, recipe: Recipe, batches = 1): FlowGraph {
  const b = new Builder();
  const center = b.node({ id: "recipe", label: recipe.name, sub: `${batches} batch`, column: 1, kind: "proses" });
  for (const l of recipe.inputs) {
    const id = b.node({ id: `in:${l.itemId}`, label: itemName(db, l.itemId), sub: `${l.qty * batches}`, column: 0, kind: itemKind(db, l.itemId), to: `/stok/item/${l.itemId}` });
    b.link(id, center, l.qty * batches * standardValue(db, l.itemId), true);
  }
  const c = recipeCost(db, recipe, batches);
  b.link(b.node({ id: "labor", label: "Tenaga kerja", sub: `${recipe.laborHours * batches} jam`, column: 0, kind: "biaya" }), center, c.labor, true);
  b.link(b.node({ id: "overhead", label: "Overhead", column: 0, kind: "biaya" }), center, c.overhead, true);
  for (const o of c.outputs) {
    b.link(center, b.node({ id: `out:${o.itemId}`, label: itemName(db, o.itemId), sub: `${o.qty} × ${Math.round(o.unitCost).toLocaleString("id-ID")}`, column: 2, kind: itemKind(db, o.itemId), to: `/stok/item/${o.itemId}` }), o.total, true);
  }
  b.link(center, b.node({ id: "sisa", label: "Perkiraan sisa", sub: `${recipe.expectedRemnantPct}% nilai bahan`, column: 2, kind: "sisa" }), c.remnantCredit, true);
  return b.build(true);
}

// ------------------------------------------------------------------ Lot genealogy

/** Value the lot carried when it was created (its first inflow). */
function originValue(db: Db, lot: Lot): number {
  const first = db.moves.find((m) => m.lotId === lot.id && m.qty > 0);
  return first ? first.qty * first.unitCost : lot.qty * lot.unitCost;
}

/**
 * Where a lot came from (two steps back) and where it went (two steps forward): purchase →
 * work order → this lot → work order → product → sale. The basis of a timber legality trail.
 */
export function lotTrace(db: Db, lotId: ID): FlowGraph {
  const b = new Builder();
  let lot = db.lots.find((l) => l.id === lotId);
  if (!lot) return { nodes: [], links: [] };
  // A split part shares its parent's history; trace from the root of the split chain.
  const root = (() => {
    let cur = lot;
    while (cur.splitFrom) {
      const parent = db.lots.find((l) => l.id === cur.splitFrom);
      if (!parent) break;
      cur = parent;
    }
    return cur;
  })();
  const me = b.node({ id: `lot:${lot.id}`, label: lot.code, sub: itemName(db, lot.itemId), column: 0, kind: lotKind(db, lot), to: `/stok/item/${lot.itemId}` });
  const value = originValue(db, root);
  lot = root;

  // ---- upstream
  if (lot.mergedFrom?.length) {
    for (const id of lot.mergedFrom) {
      const src = db.lots.find((l) => l.id === id);
      if (!src) continue;
      const sv = originValue(db, src);
      const n = b.node({ id: `lot:${src.id}`, label: src.code, sub: "digabung", column: -1, kind: lotKind(db, src), to: `/stok/lot/${src.id}` });
      b.link(n, me, sv);
      if (src.originRef) b.link(b.node(docNode(db, src.originRef, -2)), n, sv);
    }
  } else if (lot.originRef?.type === "workOrder") {
    const wo = db.workOrders.find((w) => w.id === lot.originRef!.id);
    const woNode = b.node(docNode(db, lot.originRef, -1));
    b.link(woNode, me, value);
    if (wo) {
      // Scale the order's inputs to this lot's share of what the order produced.
      const produced = wo.cost ? wo.cost.capitalized + sum(wo.returns.filter((r) => r.kind === "sisa").map((r) => r.qty * (wo.cost!.lines.find((l) => l.itemId === r.itemId)?.avgUnitCost ?? 0))) : 0;
      const share = produced > EPS ? Math.min(1, value / produced) : 0;
      const byItem = new Map<ID, number>();
      for (const i of wo.issues) byItem.set(i.itemId, (byItem.get(i.itemId) ?? 0) + i.qty * i.unitCost);
      for (const [itemId, v] of byItem) {
        b.link(b.node({ id: `in:${itemId}`, label: itemName(db, itemId), column: -2, kind: itemKind(db, itemId), to: `/stok/item/${itemId}` }), woNode, v * share);
      }
      const conversion = (wo.cost?.labor ?? 0) + (wo.cost?.overhead ?? 0) + (wo.cost?.extra ?? 0);
      b.link(b.node({ id: "labor", label: "Tenaga kerja & overhead", column: -2, kind: "biaya" }), woNode, conversion * share);
    }
  } else if (lot.originRef) {
    b.link(b.node(docNode(db, lot.originRef, -1)), me, value);
  }

  // ---- downstream
  const fate = lotFate(db, [lot.id]);
  addFate(b, db, me, fate, 1);
  // One more step: what the work orders that used this lot produced, at this lot's share.
  for (const d of fate.byDoc.values()) {
    if (d.kind !== "reused") continue;
    const wo = db.workOrders.find((w) => w.id === d.ref.id);
    if (!wo?.cost) continue;
    const total = wo.cost.materialGross + wo.cost.labor + wo.cost.overhead + wo.cost.extra;
    const share = total > EPS ? d.value / total : 0;
    for (const o of wo.cost.outputs) {
      b.link(`doc:${wo.id}`, b.node({ id: `out:${o.itemId}`, label: itemName(db, o.itemId), sub: `dari ${wo.code}`, column: 2, kind: itemKind(db, o.itemId), to: `/stok/item/${o.itemId}` }), (o.allocated - o.writeOff) * share);
    }
  }
  return b.build();
}

// ------------------------------------------------------------------ Workshop

export interface PlantFlowOptions {
  from?: ISODate;
  to?: ISODate;
}

/**
 * The whole workshop for a period: where material came from, what production turned it into,
 * and — traced lot by lot — what became of the output.
 */
export function plantFlow(db: Db, opts: PlantFlowOptions = {}): FlowGraph {
  const inRange = (at: string) => (!opts.from || at.slice(0, 10) >= opts.from) && (!opts.to || at.slice(0, 10) <= opts.to);
  const b = new Builder();
  const kindOf = new Map(db.items.map((i) => [i.id, i.kind]));
  const isMaterial = (m: StockMove) => kindOf.get(m.itemId) === "material";
  const lotRemnant = new Map(db.lots.map((l) => [l.id, l.isRemnant]));
  const moves = db.moves.filter((m) => inRange(m.at) && Math.abs(m.qty) > EPS);
  const val = (ms: StockMove[]) => sum(ms.map((m) => Math.abs(m.qty) * m.unitCost));

  const buy = b.node({ id: "src:buy", label: "Pembelian", column: 0, kind: "bahan", to: "/pembelian" });
  const opening = b.node({ id: "src:open", label: "Saldo awal & penyesuaian", column: 0, kind: "stok" });
  const recycled = b.node({ id: "src:recycled", label: "Sisa & olahan sendiri", sub: "kembali ke gudang", column: 0, kind: "sisa", to: "/stok/sisa" });
  const labor = b.node({ id: "src:labor", label: "Tenaga kerja & overhead", column: 0, kind: "biaya" });
  const store = b.node({ id: "store:bahan", label: "Gudang bahan", column: 1, kind: "bahan", to: "/stok/material" });
  const storeProduct = b.node({ id: "store:produk", label: "Produk diolah ulang", sub: "konversi, gabung, bongkar", column: 1, kind: "produk", to: "/stok/produk" });
  const prod = b.node({ id: "prod", label: "Produksi", column: 2, kind: "proses", to: "/produksi" });

  b.link(buy, store, val(moves.filter((m) => isMaterial(m) && m.type === "masuk_pembelian")));
  b.link(opening, store, val(moves.filter((m) => isMaterial(m) && m.qty > 0 && (m.type === "saldo_awal" || m.type === "penyesuaian"))));
  b.link(recycled, store, val(moves.filter((m) => isMaterial(m) && (m.type === "masuk_sisa" || m.type === "masuk_produksi"))));

  const net = (ms: StockMove[]) => sum(ms.map((m) => -m.qty * m.unitCost));
  const issuesAndReturns = moves.filter((m) => m.type === "keluar_produksi" || m.type === "kembali_produksi");
  const materialIn = net(issuesAndReturns.filter(isMaterial));
  const productIn = net(issuesAndReturns.filter((m) => !isMaterial(m)));
  b.link(store, prod, materialIn);
  b.link(storeProduct, prod, productIn);

  // Conversion cost: closed orders at their locked cost, open ones by what is booked so far.
  let conversion = 0;
  let salvage = 0;
  let writeOff = 0;
  for (const wo of db.workOrders) {
    if (wo.status === "selesai" && wo.cost && wo.completedAt && inRange(wo.completedAt)) {
      conversion += wo.cost.labor + wo.cost.overhead + wo.cost.extra;
      salvage += wo.cost.scrapRecovery;
      writeOff += wo.cost.writeOff;
    } else if ((wo.status === "berjalan" || wo.status === "rencana") && wo.laborLogs.some((l) => inRange(l.at))) {
      conversion += sum(wo.laborLogs.filter((l) => inRange(l.at)).map((l) => l.hours * l.rate + l.pieces * l.pieceRate));
    }
  }
  b.link(labor, prod, conversion);

  // What came out of production in the period.
  const outMoves = moves.filter((m) => m.type === "masuk_produksi" || m.type === "masuk_sisa");
  const productOut = outMoves.filter((m) => !isMaterial(m));
  const offcutOut = outMoves.filter((m) => isMaterial(m));
  const finished = b.node({ id: "out:produk", label: "Produk jadi", column: 3, kind: "produk", to: "/stok/produk" });
  const offcuts = b.node({ id: "out:sisa", label: "Sisa & olahan", sub: "kembali ke gudang bahan", column: 3, kind: "sisa", to: "/stok/sisa" });
  const losses = b.node({ id: "out:rugi", label: "Limbah dijual & rugi", column: 3, kind: "rugi" });
  const wip = b.node({ id: "out:wip", label: "Dalam proses", sub: "belum jadi barang", column: 3, kind: "stok", to: "/produksi/papan" });
  const pOut = val(productOut);
  const oOut = val(offcutOut);
  b.link(prod, finished, pOut);
  b.link(prod, offcuts, oOut);
  b.link(prod, losses, salvage + writeOff);
  b.link(prod, wip, Math.max(0, materialIn + productIn + conversion - pOut - oOut - salvage - writeOff));

  // Fate of the products made in the period, lot by lot.
  const fate = lotFate(db, [...new Set(productOut.map((m) => m.lotId))].filter((id) => !lotRemnant.get(id)));
  b.link(finished, b.node({ id: "fate:sold", label: "Terjual", column: 4, kind: "produk", to: "/penjualan" }), fate.sold);
  b.link(finished, b.node({ id: "fate:stock", label: "Di gudang", column: 4, kind: "stok", to: "/stok/produk" }), fate.inStock);
  b.link(finished, b.node({ id: "fate:rent", label: "Sedang disewa", column: 4, kind: "stok", to: "/sewa" }), fate.rented);
  b.link(finished, b.node({ id: "fate:reuse", label: "Diolah lagi", column: 4, kind: "proses" }), fate.reused);
  b.link(finished, b.node({ id: "fate:bad", label: "Rusak / hilang", column: 4, kind: "rugi" }), fate.damaged + fate.lost);
  return b.build();
}

// ------------------------------------------------------------------ Item history

/**
 * Everything that ever came into stock of one item, by where it came from (which route, which
 * supplier), and what became of it — sold to whom, turned into which product, still here.
 */
export function itemFlow(db: Db, itemId: ID): FlowGraph {
  const b = new Builder();
  const item = db.items.find((i) => i.id === itemId);
  if (!item) return { nodes: [], links: [] };
  const center = b.node({ id: `item:${itemId}`, label: item.name, sub: item.sku, column: 1, kind: item.kind === "product" ? "produk" : "bahan" });
  const lots = db.lots.filter((l) => l.itemId === itemId);
  const lotIds = new Set(lots.map((l) => l.id));
  const woRoute = (wo: WorkOrder) => {
    const recipe = wo.recipeId ? db.recipes.find((r) => r.id === wo.recipeId) : undefined;
    if (recipe) return { id: `src:resep:${recipe.id}`, label: recipe.name, kind: (wo.type === "dekonstruksi" ? "sisa" : "proses") as FlowKind };
    const label = { produksi: "Produksi (BOM)", konversi: "Konversi", gabung: "Gabung", dekonstruksi: "Hasil bongkar", perbaikan: "Perbaikan" }[wo.type];
    return { id: `src:wo:${wo.type}`, label, kind: (wo.type === "dekonstruksi" ? "sisa" : "proses") as FlowKind };
  };
  const woCodes = new Map<string, Set<string>>();
  for (const m of db.moves) {
    if (!lotIds.has(m.lotId) || m.qty <= EPS) continue;
    const value = m.qty * m.unitCost;
    if (m.type === "masuk_pembelian") {
      const p = db.purchases.find((x) => x.id === m.ref.id);
      const name = db.partners.find((x) => x.id === p?.supplierId)?.name ?? "Pemasok umum";
      b.link(b.node({ id: `src:beli:${name}`, label: `Beli · ${name}`, column: 0, kind: "bahan", to: "/pembelian" }), center, value);
    } else if (m.type === "masuk_produksi" || m.type === "masuk_sisa") {
      const wo = db.workOrders.find((w) => w.id === m.ref.id);
      if (!wo) continue;
      const r = m.type === "masuk_sisa" ? { id: "src:sisa", label: "Sisa dari pekerjaan lain", kind: "sisa" as FlowKind } : woRoute(wo);
      woCodes.set(r.id, (woCodes.get(r.id) ?? new Set()).add(wo.code));
      b.link(b.node({ id: r.id, label: r.label, column: 0, kind: r.kind }), center, value);
    } else if (m.type === "saldo_awal" || m.type === "penyesuaian") {
      b.link(b.node({ id: "src:saldo", label: "Saldo awal & penyesuaian", column: 0, kind: "stok" }), center, value);
    } else if (m.type === "retur_penjualan") {
      b.link(b.node({ id: "src:retur", label: "Retur dari pelanggan", column: 0, kind: "stok" }), center, value);
    }
  }
  for (const [id, codesSet] of woCodes) {
    const n = b.nodes.get(id);
    if (n) n.sub = codes([...codesSet]);
  }

  // Where it went, grouped the way people ask: sold to whom, made into what.
  const fate = lotFate(db, lots.filter((l) => !l.splitFrom).map((l) => l.id));
  for (const d of fate.byDoc.values()) {
    if (d.value <= 0.5) continue;
    if (d.kind === "sold") {
      const so = db.sales.find((s) => s.id === d.ref.id);
      const name = db.partners.find((p) => p.id === so?.customerId)?.name ?? "Pelanggan";
      b.link(center, b.node({ id: `to:cust:${name}`, label: `Terjual · ${name}`, column: 2, kind: "produk", to: "/penjualan" }), d.value);
    } else {
      const wo = db.workOrders.find((w) => w.id === d.ref.id);
      const out = wo?.plannedOutputs[0] ? db.items.find((i) => i.id === wo.plannedOutputs[0]!.itemId) : undefined;
      const label = out ? `Jadi ${out.name}` : "Diolah di produksi";
      b.link(center, b.node({ id: `to:make:${out?.id ?? "x"}`, label, column: 2, kind: out?.kind === "product" ? "produk" : "bahan", to: out ? `/jalur/${out.id}` : undefined }), d.value);
    }
  }
  b.link(center, b.node({ id: "to:stock", label: "Masih di gudang", column: 2, kind: "stok", to: `/stok/item/${itemId}` }), fate.inStock);
  b.link(center, b.node({ id: "to:rent", label: "Sedang disewa", column: 2, kind: "stok", to: "/sewa" }), fate.rented);
  b.link(center, b.node({ id: "to:bad", label: "Rusak", column: 2, kind: "rugi" }), fate.damaged);
  b.link(center, b.node({ id: "to:lost", label: "Hilang / dibuang", column: 2, kind: "rugi" }), fate.lost);
  return b.build();
}
