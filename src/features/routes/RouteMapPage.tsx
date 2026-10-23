import { Button, Link } from "@heroui/react";
import { GitFork } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { cheapestRoute, isAuxiliary, itemFlow, productionRoutes, routeGraph, type ProductionRoute } from "@/domain";
import { SwitchInput } from "@/components/fields";
import { FlowDiagram } from "@/components/FlowDiagram";
import { ItemPicker } from "@/components/pickers";
import { RouteMap } from "@/components/RouteMap";
import { DataTable, EmptyBlock, PageHeader, Section, type Column } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { ROUTE_TAG } from "@/lib/route-tag";
import { useDb, useLookups } from "@/store/db-store";

const DEPTHS = [1, 2, 3, 4] as const;

/** Click one item, see every way it can be obtained — and how it actually was. */
export default function RouteMapPage() {
  const { id } = useParams();
  const db = useDb();
  const navigate = useNavigate();
  const { item } = useLookups();
  const [depth, setDepth] = useState(2);
  const [showAux, setShowAux] = useState(false);
  const it = id ? db.items.find((i) => i.id === id) : undefined;

  const graph = useMemo(() => (it ? routeGraph(db, it.id, { depth, showAux }) : null), [db, it, depth, showAux]);
  const routes = useMemo(() => (it ? productionRoutes(db, it.id) : []), [db, it]);
  const history = useMemo(() => (it ? itemFlow(db, it.id) : null), [db, it]);
  const best = cheapestRoute(routes);

  // Items worth mapping first: those with more than one way in.
  const suggestions = useMemo(
    () =>
      db.items
        .filter((i) => !i.archived && !isAuxiliary(i))
        .map((i) => ({ item: i, routes: productionRoutes(db, i.id) }))
        .filter((x) => x.routes.length >= 2)
        .sort((a, b) => b.routes.length - a.routes.length || a.item.name.localeCompare(b.item.name))
        .slice(0, 9),
    [db],
  );

  const picker = (
    <div className="w-full sm:w-80">
      <ItemPicker value={id ?? null} onChange={(v) => v && navigate(`/routes/${v}`)} aria-label="Choose an item" />
    </div>
  );

  if (!it || !graph || !history) {
    return (
      <>
        <PageHeader title="Production routes" description="Choose an item to see every way to get it: made from new materials, from processed material recovered by dismantling, from bought components, or bought ready-made." actions={picker} />
        <Section title="Items with more than one route" bodyClassName="p-0">
          {suggestions.length ? (
            <ul className="grid grid-cols-1 divide-y divide-[var(--rule)] sm:grid-cols-3 sm:divide-y-0">
              {suggestions.map(({ item: i, routes: rs }) => (
                <li key={i.id} className="sm:border-r sm:border-b sm:border-[var(--rule)]">
                  <button type="button" onClick={() => navigate(`/routes/${i.id}`)} className="w-full px-4 py-3 text-left transition-colors hover:bg-default/40 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none">
                    <p className="text-sm font-medium">{i.name}</p>
                    <p className="mt-0.5 text-xs text-muted">
                      {rs.length} routes · {[...new Set(rs.map((r) => ROUTE_TAG[r.kind].tag.toLowerCase()))].join(", ")}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyBlock icon={<GitFork className="size-5" />} title="No items with alternative routes yet" description="Write a second recipe for a product, or record a purchase of a component you usually make in-house." />
          )}
        </Section>
      </>
    );
  }

  const uom = UOM_LABEL[it.uom];
  const followRoute = (r: ProductionRoute) => {
    if (r.recipeId) navigate(`/work-orders/new?recipe=${r.recipeId}`);
    else if (r.kind === "bom") navigate(`/work-orders/new?item=${it.id}`);
    else if (r.kind === "beli") navigate(`/purchases/new?item=${it.id}`);
    else navigate(`/work-orders/new?type=${r.processType ?? "konversi"}`);
  };

  const columns: Column<ProductionRoute>[] = [
    {
      key: "route",
      header: "Route",
      isRowHeader: true,
      cell: (r) => (
        <div className="sm:min-w-48">
          <p className="text-[13px]">
            <span className="text-[11px] font-semibold tracking-wide" style={{ color: ROUTE_TAG[r.kind].color }}>
              {ROUTE_TAG[r.kind].tag}
            </span>{" "}
            {r.recipeId ? <Link href={`/recipes/${r.recipeId}`}>{r.label}</Link> : <span className="font-medium">{r.label}</span>}
          </p>
          <p className="text-xs text-muted">
            {r.processType ? WO_TYPE[r.processType].short : "Purchase"}
            {r.byProduct ? " · by-product" : ""}
            {r.coOutputs?.length ? ` · also yields ${r.coOutputs.map((c) => item(c)?.name).join(", ")}` : ""}
          </p>
        </div>
      ),
    },
    {
      key: "inputs",
      header: `Materials per ${uom}`,
      cell: (r) =>
        r.kind === "beli" ? (
          <span className="text-[13px] text-muted">{r.suppliers?.length ? r.suppliers.map((s) => `${s.name} (${s.count}×)`).join(", ") : "Never bought"}</span>
        ) : (
          <ul className="text-[13px]">
            {r.inputs
              .filter((i) => showAux || !isAuxiliary(item(i.itemId) ?? { kind: "product", category: "lainnya" }))
              .map((i) => (
                <li key={i.itemId}>
                  <Link href={`/routes/${i.itemId}`}>{item(i.itemId)?.name}</Link>{" "}
                  <span className="num text-muted">
                    {formatQty(i.qty)} {UOM_LABEL[item(i.itemId)?.uom ?? "pcs"]}
                  </span>
                </li>
              ))}
          </ul>
        ),
    },
    {
      key: "cost",
      header: `Unit cost / ${uom}`,
      align: "end",
      cell: (r) => (
        <div>
          <p>{r.unitCost ? formatIDR(r.unitCost) : "—"}</p>
          {best?.id === r.id && <p className="text-xs font-medium text-success">cheapest</p>}
          {best && best.id !== r.id && r.unitCost > 0 && !r.byProduct && <p className="num text-xs text-muted">+{formatIDR(r.unitCost - best.unitCost)}</p>}
        </div>
      ),
    },
    {
      key: "used",
      header: "History",
      align: "end",
      cell: (r) => (
        <div className="text-[13px]">
          <p>{r.uses ? `${r.uses}× · ${formatQty(r.qtyMade)} ${uom}` : <span className="text-muted">not used yet</span>}</p>
          {r.inProgress > 0 && <p className="text-xs text-accent">{r.inProgress} in progress</p>}
        </div>
      ),
    },
    {
      key: "act",
      header: "",
      align: "end",
      cell: (r) =>
        r.byProduct ? null : (
          <Button size="sm" variant="secondary" onPress={() => followRoute(r)}>
            {r.kind === "beli" ? "Buy" : "Make"}
          </Button>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        back="/routes"
        title={it.name}
        description={`Production routes · ${routes.length} ways to get ${it.name.toLowerCase()} · click any item on the map to map that item`}
        actions={picker}
      />

      <Section
        title="Route map"
        description="Left to right: base materials → the routes that turn them → this item. Several routes into one item mean a choice (or). Dashed lines: by-products or cycles."
        actions={
          <div className="flex flex-wrap items-center gap-3">
            <div role="radiogroup" aria-label="Depth" className="flex gap-1 text-[13px]">
              {DEPTHS.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={depth === d}
                  onClick={() => setDepth(d)}
                  className={`rounded-sm border px-2 py-0.5 ${depth === d ? "border-accent bg-surface font-medium" : "border-[var(--rule)] text-muted hover:text-foreground"}`}
                >
                  {d} {d === 1 ? "level" : "levels"}
                </button>
              ))}
            </div>
            <SwitchInput isSelected={showAux} onChange={setShowAux} label="Auxiliary materials" />
          </div>
        }
        className="mb-6"
        bodyClassName="p-0"
      >
        <RouteMap graph={graph} rootId={`item:${it.id}`} label={`Route map ${it.name}`} />
      </Section>

      <Section title="Route comparison" description="Standard unit cost from current material costs & rates; purchases use the last unit cost (shipping included)." className="mb-6" bodyClassName="p-0">
        <DataTable label="Route comparison" columns={columns} rows={routes} dependencies={[showAux, best]} empty={<EmptyBlock title="No routes yet" description="This item has no BOM, recipe or purchase history yet." />} />
      </Section>

      <Section title="Actual history" description="Where this item's stock has come from, and where it went — sold to whom, made into which product, or still in the warehouse. Width = rupiah value." bodyClassName="p-0">
        <FlowDiagram graph={history} label={`History ${it.name}`} empty="This item has never been in stock." />
      </Section>
    </>
  );
}
