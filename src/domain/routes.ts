/**
 * Production routes: every way an item can be obtained — its BOM, each recipe that makes it,
 * buying it, recovering it by dismantling, and conversions/merges done in the past — plus a
 * multi-level graph of those routes so one click on an item shows its whole supply chain.
 */
import { EPS, getItem, roundMoney, roundQty, sum } from "./core";
import { isOpenWo, standardProductCost } from "./production";
import { recipeCost } from "./recipes";
import type { Db, ID, Item, WorkOrder, WorkOrderType } from "./types";

export type RouteKind = "bom" | "resep" | "beli" | "bongkar" | "riwayat";

export interface RouteSupplier {
  partnerId?: ID;
  name: string;
  count: number;
  lastUnitCost: number;
}

export interface ProductionRoute {
  id: string;
  kind: RouteKind;
  /** Process behind a recipe or history route. */
  processType?: WorkOrderType;
  label: string;
  recipeId?: ID;
  /** Per one unit of the item. */
  inputs: { itemId: ID; qty: number }[];
  /** Standard (or last known) cost per unit via this route. */
  unitCost: number;
  laborHours?: number;
  /** Completed work orders / received purchases that used this route. */
  uses: number;
  /** Units of the item obtained this way so far. */
  qtyMade: number;
  suppliers?: RouteSupplier[];
  /** The item falls out of the process (dismantling); it is not what the process is for. */
  byProduct?: boolean;
  /** Other things the same process yields. */
  coOutputs?: ID[];
  /** Open work orders currently following this route. */
  inProgress: number;
}

/** Hardware, finishing and packaging: needed, but not what shapes the route. */
export const isAuxiliary = (item: Pick<Item, "kind" | "category">) =>
  item.kind === "material" && (item.category === "hardware" || item.category === "finishing" || item.category === "kemasan");

const madeQty = (wo: WorkOrder, itemId: ID) =>
  wo.cost ? sum(wo.cost.outputs.filter((o) => o.itemId === itemId).map((o) => o.qty)) : 0;

/** Net quantity of each input consumed by a closed order (issued − returned whole/offcut). */
function netInputs(wo: WorkOrder): Map<ID, number> {
  const m = new Map<ID, number>();
  for (const l of wo.cost?.lines ?? []) m.set(l.itemId, l.issuedQty - l.returnedQty);
  return m;
}

export function productionRoutes(db: Db, itemId: ID): ProductionRoute[] {
  const item = getItem(db, itemId);
  const routes: ProductionRoute[] = [];
  const done = db.workOrders.filter((w) => w.status === "selesai" && madeQty(w, itemId) > EPS);
  const open = db.workOrders.filter((w) => isOpenWo(w) && w.plannedOutputs.some((o) => o.itemId === itemId));

  // 1. The item's own BOM (products always; components with a BOM).
  if (item.bom?.length) {
    const runs = done.filter((w) => w.type === "produksi" && !w.recipeId);
    routes.push({
      id: `bom:${itemId}`,
      kind: "bom",
      processType: "produksi",
      label: "Standard BOM",
      inputs: item.bom.map((b) => ({ itemId: b.materialId, qty: b.qty })),
      unitCost: standardProductCost(db, item),
      laborHours: item.laborHours,
      uses: runs.length,
      qtyMade: roundQty(sum(runs.map((w) => madeQty(w, itemId)))),
      inProgress: open.filter((w) => w.type === "produksi" && !w.recipeId).length,
    });
  }

  // 2. Recipes that produce (or, dismantling, recover) the item.
  for (const r of db.recipes) {
    const out = r.outputs.find((o) => o.itemId === itemId);
    if (r.archived || !out) continue;
    const runs = done.filter((w) => w.recipeId === r.id);
    const perUnit = 1 / out.qty;
    routes.push({
      id: `resep:${r.id}`,
      kind: r.type === "dekonstruksi" ? "bongkar" : "resep",
      processType: r.type,
      label: r.name,
      recipeId: r.id,
      inputs: r.inputs.map((l) => ({ itemId: l.itemId, qty: roundQty(l.qty * perUnit) })),
      unitCost: recipeCost(db, r).outputs.find((o) => o.itemId === itemId)?.unitCost ?? 0,
      laborHours: roundQty(r.laborHours * perUnit),
      uses: runs.length,
      qtyMade: roundQty(sum(runs.map((w) => madeQty(w, itemId)))),
      byProduct: r.type === "dekonstruksi",
      coOutputs: r.outputs.filter((o) => o.itemId !== itemId).map((o) => o.itemId),
      inProgress: open.filter((w) => w.recipeId === r.id).length,
    });
  }

  // 3. Past conversions, merges and dismantling done without a recipe, grouped by what went in.
  const history = new Map<string, WorkOrder[]>();
  for (const w of done) {
    if (w.recipeId || w.type === "produksi" || w.type === "perbaikan") continue;
    const key = `${w.type}|${[...netInputs(w).keys()].sort().join(",")}`;
    history.set(key, [...(history.get(key) ?? []), w]);
  }
  for (const [key, runs] of history) {
    const type = key.split("|")[0] as WorkOrderType;
    const made = sum(runs.map((w) => madeQty(w, itemId)));
    const totals = new Map<ID, number>();
    for (const w of runs) for (const [id, q] of netInputs(w)) totals.set(id, (totals.get(id) ?? 0) + q);
    const cost = sum(runs.flatMap((w) => w.cost!.outputs.filter((o) => o.itemId === itemId).map((o) => o.allocated - o.writeOff)));
    const main = [...totals.keys()].map((id) => db.items.find((i) => i.id === id)).find((i) => i && !isAuxiliary(i));
    routes.push({
      id: `riwayat:${key}`,
      kind: type === "dekonstruksi" ? "bongkar" : "riwayat",
      processType: type,
      label: `${type === "konversi" ? "Conversion" : type === "gabung" ? "Merge" : "Dismantle"}${main ? ` from ${main.name}` : ""}`,
      inputs: [...totals].map(([id, q]) => ({ itemId: id, qty: roundQty(q / made) })),
      unitCost: roundMoney(cost / made),
      uses: runs.length,
      qtyMade: roundQty(made),
      byProduct: type === "dekonstruksi",
      inProgress: 0,
    });
  }

  // 4. Buying it: from purchase history; raw materials can always be bought.
  const bought = new Map<string, RouteSupplier>();
  let boughtQty = 0;
  let receipts = 0;
  for (const p of db.purchases) {
    if (p.status !== "diterima") continue;
    const lines = p.lines.filter((l) => l.itemId === itemId);
    if (!lines.length) continue;
    receipts += 1;
    const lot = db.lots.find((l) => p.lotIds?.includes(l.id) && l.itemId === itemId);
    const name = db.partners.find((x) => x.id === p.supplierId)?.name ?? "General supplier";
    const cur = bought.get(name) ?? { partnerId: p.supplierId, name, count: 0, lastUnitCost: 0 };
    cur.count += 1;
    cur.lastUnitCost = lot?.unitCost ?? lines[0]!.unitPrice;
    bought.set(name, cur);
    boughtQty += sum(lines.map((l) => l.qty));
  }
  const makeable = routes.some((r) => !r.byProduct);
  if (bought.size || (!makeable && item.kind === "material")) {
    const suppliers = [...bought.values()].sort((a, b) => b.count - a.count);
    routes.push({
      id: `beli:${itemId}`,
      kind: "beli",
      label: suppliers.length ? `Buy · ${suppliers[0]!.name}${suppliers.length > 1 ? ` +${suppliers.length - 1}` : ""}` : "Buy from a supplier",
      inputs: [],
      unitCost: suppliers[0]?.lastUnitCost ?? item.standardCost,
      uses: receipts,
      qtyMade: roundQty(boughtQty),
      suppliers,
      inProgress: db.purchases.filter((p) => p.status === "draft" && p.lines.some((l) => l.itemId === itemId)).length,
    });
  }
  return routes;
}

/** Cheapest route that is meant to make the item (by-products excluded). */
export function cheapestRoute(routes: ProductionRoute[]): ProductionRoute | undefined {
  return routes.filter((r) => !r.byProduct && r.unitCost > 0).sort((a, b) => a.unitCost - b.unitCost)[0];
}

// ------------------------------------------------------------------ Route graph

export interface RouteGraphNode {
  id: string;
  type: "item" | "route" | "cycle";
  /** 0 = the item asked about; inputs sit at higher levels (further left). */
  level: number;
  itemId?: ID;
  route?: ProductionRoute;
  /** Item obtained only by buying: shown on the item card instead of as a route. */
  buyOnly?: ProductionRoute;
  /** Has routes that were not expanded (depth limit). */
  more?: boolean;
  /** Auxiliary inputs hidden on this route. */
  hiddenAux?: number;
}

export interface RouteGraphEdge {
  from: string;
  to: string;
  /** Input quantity per unit of the route's output. */
  qty?: number;
}

export interface RouteGraph {
  nodes: RouteGraphNode[];
  edges: RouteGraphEdge[];
  maxLevel: number;
}

/**
 * Multi-level route graph. Shared inputs appear once; a route that would loop back to an item
 * already downstream (chair → dismantle → reclaimed timber → chair) ends in a cycle marker.
 */
export function routeGraph(db: Db, itemId: ID, opts: { depth?: number; showAux?: boolean } = {}): RouteGraph {
  const depth = opts.depth ?? 3;
  const nodes = new Map<string, RouteGraphNode>();
  const edges: RouteGraphEdge[] = [];
  const parents = new Map<string, Set<string>>(); // node → nodes it feeds

  const feeds = (from: string, to: string, qty?: number) => {
    edges.push({ from, to, qty });
    parents.set(from, (parents.get(from) ?? new Set()).add(to));
  };
  /** Is `target` downstream of `node` (would an edge target → … → node close a loop)? */
  const downstream = (node: string, target: string) => {
    const stack = [node];
    const seen = new Set<string>();
    while (stack.length) {
      const n = stack.pop()!;
      if (n === target) return true;
      if (seen.has(n)) continue;
      seen.add(n);
      for (const p of parents.get(n) ?? []) stack.push(p);
    }
    return false;
  };

  const expand = (id: ID, itemLevel: number) => {
    const key = `item:${id}`;
    const node = nodes.get(key)!;
    const routes = productionRoutes(db, id);
    const made = routes.filter((r) => r.kind !== "beli");
    const buy = routes.find((r) => r.kind === "beli");
    if (!made.length) {
      node.buyOnly = buy;
      return;
    }
    if (itemLevel >= depth) {
      node.more = true;
      if (buy) node.buyOnly = buy;
      return;
    }
    for (const r of routes) {
      const rKey = `route:${r.id}`;
      nodes.set(rKey, { id: rKey, type: "route", level: 0, route: r });
      feeds(rKey, key);
      let hidden = 0;
      for (const input of r.inputs) {
        const inputItem = db.items.find((i) => i.id === input.itemId);
        if (!inputItem) continue;
        if (!opts.showAux && isAuxiliary(inputItem)) {
          hidden += 1;
          continue;
        }
        const iKey = `item:${input.itemId}`;
        if (nodes.has(iKey)) {
          if (downstream(rKey, iKey)) {
            const cKey = `cycle:${input.itemId}:${r.id}`;
            nodes.set(cKey, { id: cKey, type: "cycle", level: 0, itemId: input.itemId });
            feeds(cKey, rKey, input.qty);
          } else feeds(iKey, rKey, input.qty);
          continue;
        }
        nodes.set(iKey, { id: iKey, type: "item", level: 0, itemId: input.itemId });
        feeds(iKey, rKey, input.qty);
        expand(input.itemId, itemLevel + 1);
      }
      nodes.get(rKey)!.hiddenAux = hidden || undefined;
    }
  };

  const root = `item:${itemId}`;
  nodes.set(root, { id: root, type: "item", level: 0, itemId });
  expand(itemId, 0);

  // Longest path from the root, so every edge points rightwards.
  const level = new Map<string, number>([[root, 0]]);
  for (let pass = 0; pass < nodes.size; pass++) {
    let changed = false;
    for (const e of edges) {
      const to = level.get(e.to);
      if (to === undefined) continue;
      if ((level.get(e.from) ?? -1) < to + 1) {
        level.set(e.from, to + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  for (const n of nodes.values()) n.level = level.get(n.id) ?? 0;
  return { nodes: [...nodes.values()], edges, maxLevel: Math.max(0, ...level.values()) };
}
