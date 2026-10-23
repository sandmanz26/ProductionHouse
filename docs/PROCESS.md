# Process maps, recipes, and merge

## Process maps — four viewpoints, one visual language

All maps use the same diagram: columns of nodes joined by flows whose **width is rupiah**.
The measure is rupiah, not qty, because a flow from wood (m³) to chairs (pcs) can only be
added up in money. Colour shows what a flow carries:

| Colour | Meaning |
|---|---|
| Teak (brown) | Materials |
| Blue | Products (including those sold) |
| Green | Offcuts — pieces that go back to the warehouse with their cost |
| Purple | Labour & overhead |
| Grey | Processes, stock, work in progress |
| Hatched grey | Waste & losses |

The palette is validated for colour blindness (protan/deutan/tritan) and for contrast in both
light and dark mode. Every map has a **table view** (the "Table" button), tooltips on hover, and
nodes you can click to open their data. Dashed flows are estimates (standard cost).

| Map | Where | What it shows |
|---|---|---|
| **Job process map** | Work order detail | Materials per lot (offcuts shown separately) + labour → job → output, offcuts, returned whole, waste sold, dismantling loss → **where the output went** (sold to whom, on rent, in the warehouse, processed again). A plan with no materials issued yet is drawn at standard cost. |
| **Recipe map** | Recipe detail & form, work order form | Materials + labour hours per batch → recipe → output + expected offcuts, at standard cost. Can be multiplied by batches. |
| **Lot trace** | Click a lot code on a stock page | Two steps back (purchase/job → its materials) and two steps forward (job → product → sale). Lots created by a split or merge are traced to their parent. This trail is what SVLK and EUDR due diligence need. |
| **Flow map** | Menu Analysis → Flow map | The whole workshop per period: purchases, opening stock, offcuts & processed materials → materials warehouse → production (+ labour) → finished products, offcuts, waste, work in progress → **where the products made in that period went**, traced lot by lot. |

Every map **conserves value**: what goes into a process node equals what comes out (tested in
`src/domain/process.test.ts`). Any production difference shows up openly as "Work in progress".

## Recipes

A BOM answers one question: *what materials does this product need?* A recipe answers a wider one:

- **Multiple outputs**: one board → table top + legs + drawer pieces, with fixed cost shares (%)
  or split by sales value.
- **Several ways** to make the same item (e.g. a chair from new teak vs from reclaimed wood).
- **Every process type**: production, conversion, merge, dismantling.
- **Batches**: quantities are written per batch; the work order multiplies them (materials,
  output, labour hours).
- **Expected offcuts & waste**: usable offcuts (% of material value) are credited in the standard
  cost. Waste (% of qty) is used for planning.
- **Stages & notes** for the craftsmen carry over to the work order.

A work order from a recipe uses the recipe's materials, **not** the product BOM, so nothing is
counted twice. Fixed cost shares from the recipe carry over to the completion form. A material
produced by a recipe (production/conversion/merge) counts as producible. "Produce components" then
creates work orders from its recipe in whole batches (need 3 panels, 2 per batch → 2 batches). A
dismantling recipe does not make a material producible: reclaimed wood is a by-product, not
something you plan for.

**Usage history** compares every completed job with its recipe: output vs plan, material usage
vs standard (100% = as per recipe), offcuts returned, and actual cost vs standard cost. This is
the signal that a recipe needs updating.

A recipe that has been used cannot be deleted, only archived, so its history stays readable.

## Merge

### Merge work orders
Several items from stock become **one kind** of item:
- **Set**: 1 table + 6 chairs + carton → 1 dining set. Set cost = the cost of the table & chair
  lots issued + labour.
- **Panel from offcuts**: teak offcuts + glue → a finger-jointed panel. Offcuts are used first, so
  small pieces turn into a valuable item.

Rules: exactly one output item; at least two different items or two units; the output item may
not be one of its own materials. The output of a merge does not have to be a product (a panel is
a material).

### Merge lots (warehouse)
On an item's stock page → **Merge lots**: combine several lots of the same item, e.g. offcuts of
the same size bundled together. The result:
- qty is summed, unit cost is the **weighted average** (value does not change);
- the receipt date = the **oldest** lot, so it stays at the front of the FIFO queue;
- `mergedFrom` keeps the source lots for tracing; each source lot gets a "Merge lots" movement.

Rejected: different items, offcuts mixed with regular stock, reservations for different jobs,
lots that are on rent or damaged, unknown locations, or fewer than two lots.

## Production routes (per item)

Menu **Operations → Production routes**, or the **Production routes** button on an item's stock
page or master data page. Pick an item to see every way to get it, level by level down to base
materials.

### Route types

| Tag | Route | Data source |
|---|---|---|
| **MAKE** | Standard BOM | The item's BOM (a product, or a component with a BOM) |
| **RECIPE** | Each recipe that produces the item | Menu Recipes. One item may have many recipes (new wood vs reclaimed wood) |
| **BUY** | Buy from a supplier | Purchase history (supplier, how many times, latest unit cost including freight). Raw materials that cannot be made always have this route |
| **DISMANTLE** | Dismantling output | A dismantling recipe or job that yields the item. Marked as a **by-product** (dashed line) and never counted as "cheapest" |
| **PAST** | Conversions / merges done in the past without a recipe | Completed jobs, grouped by the materials that went in. Materials per unit are worked out from actual usage |

Example in the demo data: the **Sekar Teak Dining Chair** can be made from new teak
(**Teak Grade A (kiln-dried)**, via the BOM / standard recipe) or from **Reclaimed Teak (processed)**.
Reclaimed Teak (processed) is made from **Reclaimed Teak (raw)**, which is bought from the
Jepara Reclaimed Timber Collector or recovered by dismantling a broken dining table or chair. The
**Bar Stool Frame (component)** is both made in-house (BOM) and bought from the subcontractor
UD Rangka Kudus.

### Map
- Left to right: base materials → routes → the selected item (always at the right edge; the map
  scrolls there automatically).
- A material used by several routes appears only **once**.
- **Cycles** (chair → dismantle chair → reclaimed wood → … → chair) are stopped with a ↺ marker
  instead of repeating forever.
- Materials that are only bought do not get their own route box; the supplier is written on
  their card.
- **Depth** 1–4 levels. Cards marked "further routes" can be clicked to map them.
- **Auxiliary materials** (hardware, finishing, packaging) are hidden by default. Their count is
  shown in the route box ("+3 auxiliary").
- Hover over a card or route to highlight its chain. Qty per unit appears on the line. Click an
  item to centre the map on it; click a recipe route to open the recipe. A table view is also
  available.

### Route comparison
Standard unit cost per route (current material costs & rates; purchase = latest unit cost),
which one is **cheapest**, how much more the other routes cost, how many times each was used,
how many units it produced, and how many are in progress. The **Make / Buy** button opens a
pre-filled work order or purchase.

### Actual history
A value-flow diagram for the item: everywhere its stock has come from (per route / recipe /
supplier), and where it went (sold to which customer, **which product it became**, on rent, in
the warehouse). The question "what has this wood turned into?" is answered here.
