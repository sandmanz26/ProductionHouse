/**
 * Help content, written once and used three ways: the first-visit tour, the Help center, and the
 * "How this works" panel on each page. Plain workshop English; every page answers
 * "what is this for, what happens when I press the buttons, and what does it change elsewhere".
 */

export type StepKind = "material" | "process" | "product" | "offcut" | "money" | "neutral";

export interface FlowStep {
  label: string;
  sub?: string;
  kind: StepKind;
}

export interface HelpTopic {
  id: string;
  title: string;
  /** Routes (path prefixes) this topic explains; the longest match wins. */
  routes: string[];
  /** One sentence: what this page is for. */
  summary: string;
  /** A small left-to-right picture of what happens here. */
  flow: FlowStep[];
  /** Optional note under the flow (loops, exceptions). */
  flowNote?: string;
  /** "What you can do here", in the order people usually do it. */
  tasks: { title: string; steps: string[] }[];
  /** Effects elsewhere — the part people find hardest. */
  effects?: string[];
  /** Glossary terms used on the page. */
  terms?: string[];
  group: "Start" | "Production" | "Buying & selling" | "Stock" | "Analysis" | "Setup";
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    id: "home",
    group: "Start",
    title: "Home",
    routes: ["/"],
    summary: "Today's workshop at a glance: what needs attention first, what is on the floor, and what is due.",
    flow: [
      { label: "Needs attention", sub: "late rentals, short materials, overdue bills", kind: "neutral" },
      { label: "Click the action", sub: "it opens the right form", kind: "process" },
      { label: "Item disappears", sub: "when it is handled", kind: "neutral" },
    ],
    tasks: [
      {
        title: "Work through the day",
        steps: [
          "Start with the top of Needs attention — it is sorted by urgency.",
          "Each row has one action (Take back, Create purchase, Issue materials…). Press it; the form opens pre-filled.",
          "The numbers at the top (stock value, open jobs, units at customers, receivables) are links to the full lists.",
        ],
      },
    ],
    terms: ["Lot", "Offcut", "Receivables"],
  },
  {
    id: "work-orders",
    group: "Production",
    title: "Work orders",
    routes: ["/work-orders"],
    summary: "A work order is one job on the shop floor: materials go in, products (and offcuts) come out, and its cost is locked when it is completed.",
    flow: [
      { label: "Plan", sub: "what to make, from BOM or recipe", kind: "process" },
      { label: "Issue materials", sub: "from lots — offcuts first", kind: "material" },
      { label: "Log labour & stages", sub: "hours or piece rate", kind: "process" },
      { label: "Complete", sub: "outputs + offcuts + waste", kind: "product" },
      { label: "Cost locked", sub: "per unit, per lot", kind: "money" },
    ],
    flowNote: "Usable offcuts go back to stock with their own price, so the next job can use them and this job is not charged for them.",
    tasks: [
      {
        title: "Make something",
        steps: [
          "New work order → choose a type (Production, Conversion, Merge, Dismantling, Repair) or start from a recipe.",
          "Check Material requirements: red means short. Use Buy shortages or Produce components.",
          "Issue materials. Serat suggests lots in this order: bought for this job → offcuts (smallest first) → the rest by costing method.",
          "Log labour as you go and move stages on the Production board.",
          "Complete: enter what came out, usable offcuts (with size) and waste. The cost is calculated and locked.",
        ],
      },
      {
        title: "Ship part of a job early",
        steps: [
          "Receive partial puts finished units into stock at standard cost.",
          "When the job is completed, those units are revalued to the actual cost; anything already sold shows as a cost variance.",
        ],
      },
    ],
    effects: [
      "Issuing takes quantity out of lots (see Stock movements).",
      "Completing creates product lots and offcut lots, releases stock that was reserved for this job, and updates the Cost report.",
      "Cancelling returns every issued material to its lot.",
    ],
    terms: ["Work order", "Issue", "Offcut", "Job cost", "Unit cost", "Standard cost", "Work in progress"],
  },
  {
    id: "board",
    group: "Production",
    title: "Production board",
    routes: ["/board"],
    summary: "Every open work order, placed in the stage it is in now — the view for the shop-floor lead.",
    flow: [
      { label: "Queue", kind: "neutral" },
      { label: "Cutting → Assembly → …", sub: "each product's own route", kind: "process" },
      { label: "Done", kind: "product" },
    ],
    tasks: [
      {
        title: "Move a job forward",
        steps: ["Press Advance on a card. Starting any stage starts the work order.", "Late jobs (past their target date) are marked so they stand out."],
      },
    ],
    terms: ["Stage"],
  },
  {
    id: "recipes",
    group: "Production",
    title: "Recipes",
    routes: ["/recipes"],
    summary: "A recipe is a tested way to make something: inputs, outputs, labour, stages and the offcut you usually get — written once, used as many times as you like.",
    flow: [
      { label: "Inputs per batch", sub: "materials, parts, offcuts", kind: "material" },
      { label: "Recipe", sub: "labour, stages", kind: "process" },
      { label: "Outputs", sub: "one or more", kind: "product" },
      { label: "Expected offcut", sub: "credited back", kind: "offcut" },
    ],
    flowNote: "A BOM says what one product needs. A recipe can have several outputs, several routes to the same product, and covers conversion, merge and dismantling too.",
    tasks: [
      {
        title: "Write a recipe",
        steps: [
          "New recipe → name, process type, inputs and outputs per batch.",
          "Add labour hours per batch, expected offcut (% of material value) and waste (% of quantity).",
          "The right panel shows standard cost per output before you save.",
        ],
      },
      {
        title: "Use it",
        steps: [
          "Create work order on the recipe (or pick it in New work order) and set the number of batches.",
          "After the job, Run history compares what really happened with the recipe — the signal to update it.",
        ],
      },
    ],
    terms: ["Recipe", "Batch", "BOM", "Standard cost"],
  },
  {
    id: "routes",
    group: "Production",
    title: "Production routes",
    routes: ["/routes"],
    summary: "Pick one item and see every way to get it — make it from new timber, from reclaimed timber, from bought parts, or buy it — down to the raw materials.",
    flow: [
      { label: "Raw materials", sub: "bought or recovered", kind: "material" },
      { label: "Routes", sub: "MAKE · RECIPE · BUY · DISMANTLE", kind: "process" },
      { label: "The item", sub: "you clicked", kind: "product" },
    ],
    flowNote: "Several routes into one item are alternatives. A loop (chair → dismantle → reclaimed timber → chair) is marked ↺ instead of repeating forever.",
    tasks: [
      {
        title: "Compare routes",
        steps: [
          "Hover a card to light up its chain; click any item to map that item instead.",
          "Route comparison shows the standard cost of each route, which is cheapest and how often each was used.",
          "Make / Buy opens a work order or purchase already filled in.",
        ],
      },
    ],
    terms: ["Route", "Dismantling", "Auxiliary materials"],
  },
  {
    id: "purchasing",
    group: "Buying & selling",
    title: "Purchasing",
    routes: ["/purchases"],
    summary: "Record what you buy and receive it into stock. Freight and unloading are spread over the lines, so every lot carries its landed cost.",
    flow: [
      { label: "Purchase", sub: "lines + freight", kind: "money" },
      { label: "Receive", kind: "process" },
      { label: "One lot per line", sub: "price + share of freight", kind: "material" },
    ],
    flowNote: "Link a purchase to a work order and its lots are reserved for that job. Whatever is left after the job becomes free stock at its original price.",
    tasks: [
      {
        title: "Buy timber",
        steps: [
          "New purchase → supplier, lines, extra costs.",
          "For timber, Calculate quantity turns pieces × thickness × width × length into m³.",
          "Save & receive, or save as draft and receive when the truck arrives.",
          "Record payments on the purchase; unpaid ones appear in Payables.",
        ],
      },
    ],
    effects: ["Receiving creates lots and updates the material's standard (replacement) cost."],
    terms: ["Landed cost", "Lot", "Reserved", "Payables"],
  },
  {
    id: "sales",
    group: "Buying & selling",
    title: "Sales & export",
    routes: ["/sales"],
    summary: "Orders from customers, local supply or export by container. Shipping takes product lots out of stock, which fixes the cost of goods sold and the margin.",
    flow: [
      { label: "Order", sub: "draft → confirmed", kind: "money" },
      { label: "Make or pick stock", sub: "shortages → work order", kind: "process" },
      { label: "Ship", sub: "lots leave stock", kind: "product" },
      { label: "Invoice & payments", sub: "down payment, final", kind: "money" },
    ],
    tasks: [
      {
        title: "Export order",
        steps: [
          "New order → Export: Incoterm, ports, container, V-Legal (SVLK) and EUDR references.",
          "Confirm (a customer is required). Shortages can become a work order in one click.",
          "Ship when ready; print the proforma invoice and packing list from Export documents.",
          "Mark as done once it is fully paid.",
        ],
      },
    ],
    effects: ["Shipping records COGS from the exact lots shipped. Returns bring units back at the cost they left with."],
    terms: ["COGS", "Down payment", "Receivables"],
  },
  {
    id: "rentals",
    group: "Buying & selling",
    title: "Rental & loan",
    routes: ["/rentals"],
    summary: "Furniture lent out for events, shoots or showrooms. Units stay your stock while they are out; damaged ones go straight to repair.",
    flow: [
      { label: "Booking", sub: "dates, units, deposit", kind: "money" },
      { label: "Hand over", sub: "units → On rent", kind: "product" },
      { label: "Take back", sub: "good · damaged · lost", kind: "process" },
      { label: "Repair", sub: "work order", kind: "process" },
    ],
    flowNote: "A loan is a rental at zero rate. Late fees are counted automatically from the end date.",
    tasks: [
      {
        title: "Rent out chairs",
        steps: [
          "New booking → dates and quantities. The 14-day availability grid shows clashes.",
          "Hand over on the day; take back when they return and mark each unit good, damaged or lost.",
          "Damaged units → Create repair orders. The deposit is settled against the bill.",
        ],
      },
    ],
    terms: ["On rent", "Late fee", "Deposit"],
  },
  {
    id: "finance",
    group: "Buying & selling",
    title: "Receivables & payables",
    routes: ["/finance"],
    summary: "Who owes you, whom you owe, and how late — built from the payments recorded on sales, rentals and purchases.",
    flow: [
      { label: "Bills", sub: "sales, rentals, purchases", kind: "money" },
      { label: "Payments recorded", kind: "money" },
      { label: "Open balance", sub: "by age", kind: "neutral" },
    ],
    tasks: [{ title: "Chase a payment", steps: ["Sort by days overdue; open the document and record the payment when it arrives."] }],
    terms: ["Receivables", "Payables", "Down payment"],
  },
  {
    id: "stock",
    group: "Stock",
    title: "Materials & products",
    routes: ["/stock/materials", "/stock/products", "/stock/items"],
    summary: "What you have, where, and what it is worth. Every quantity lives in a lot, and every lot keeps its own unit cost.",
    flow: [
      { label: "Lots", sub: "purchase, production, offcut", kind: "material" },
      { label: "Count · transfer · merge", kind: "process" },
      { label: "Value", sub: "qty × unit cost", kind: "money" },
    ],
    tasks: [
      {
        title: "Look after stock",
        steps: [
          "Open an item to see its lots in the order they will be used (by costing method).",
          "Count sets a lot to the counted quantity; Transfer moves part of a lot; Merge lots joins lots of the same item.",
          "Click a lot code to trace where it came from and where it went.",
        ],
      },
    ],
    terms: ["Lot", "Unit cost", "Costing method", "Free stock"],
  },
  {
    id: "offcuts",
    group: "Stock",
    title: "Offcuts",
    routes: ["/stock/offcuts"],
    summary: "Usable leftovers from jobs, each with its size and price. They are suggested first in the next job, so they get used instead of thrown away.",
    flow: [
      { label: "Job completed", kind: "process" },
      { label: "Offcut lot", sub: "size + price", kind: "offcut" },
      { label: "Next job", sub: "suggested first", kind: "process" },
    ],
    tasks: [
      {
        title: "Use offcuts",
        steps: [
          "Each offcut shows which products it is enough for.",
          "Old offcuts are flagged after the number of days set in Settings; scrap the ones nobody will use.",
        ],
      },
    ],
    terms: ["Offcut", "Waste", "Yield"],
  },
  {
    id: "moves",
    group: "Stock",
    title: "Stock movements",
    routes: ["/stock/movements"],
    summary: "The ledger: every change to every lot, with the document that caused it.",
    flow: [
      { label: "Document", sub: "PO, WO, SO, RN…", kind: "neutral" },
      { label: "Movement", sub: "+ in, − out", kind: "process" },
      { label: "Lot quantity", kind: "material" },
    ],
    tasks: [{ title: "Find out what happened", steps: ["Search by lot, item or document code. The movements of a lot always add up to its quantity."] }],
    terms: ["Lot"],
  },
  {
    id: "lot",
    group: "Stock",
    title: "Lot trace",
    routes: ["/stock/lots"],
    summary: "Where one lot came from (purchase, job, its materials) and where every part of it went (jobs, products, customers) — the trail SVLK and EUDR ask for.",
    flow: [
      { label: "Origin", sub: "purchase or job", kind: "material" },
      { label: "This lot", kind: "material" },
      { label: "Destinations", sub: "jobs, products, sales", kind: "product" },
    ],
    tasks: [{ title: "Answer a buyer's due-diligence question", steps: ["Open the lot of the product shipped, then follow the map left to the purchase of the timber."] }],
    terms: ["Lot", "Trace"],
  },
  {
    id: "flow-map",
    group: "Analysis",
    title: "Flow map",
    routes: ["/flow-map"],
    summary: "The whole workshop for a period in one picture: where material came from, what production made of it, and what became of the products.",
    flow: [
      { label: "Purchases & offcuts", kind: "material" },
      { label: "Production", kind: "process" },
      { label: "Products", kind: "product" },
      { label: "Sold · in stock · on rent", kind: "money" },
    ],
    flowNote: "Width is value in Rupiah. Work in progress is value that went into jobs but has not come out as goods yet.",
    tasks: [{ title: "Read it", steps: ["Hover a band for its value; click a node to open its list; Table shows every number."] }],
    terms: ["Work in progress", "Offcut"],
  },
  {
    id: "costs",
    group: "Analysis",
    title: "Cost report",
    routes: ["/reports"],
    summary: "What things really cost: actual vs standard cost per product and per job, stock value, rental utilisation, and how costing methods compare.",
    flow: [
      { label: "Jobs completed", kind: "process" },
      { label: "Actual cost", sub: "per unit", kind: "money" },
      { label: "Compare", sub: "standard, methods", kind: "neutral" },
    ],
    tasks: [{ title: "Find a costly product", steps: ["Per product: sort by the gap between actual and standard cost, then open the jobs behind it."] }],
    terms: ["Standard cost", "Job cost", "Costing method", "COGS"],
  },
  {
    id: "items",
    group: "Setup",
    title: "Products & materials",
    routes: ["/items"],
    summary: "The list of things you buy, make and sell: units, standard cost, BOM, labour hours, sale and rental price, packing for export.",
    flow: [
      { label: "Material", sub: "bought (or made: component)", kind: "material" },
      { label: "BOM", sub: "per unit of product", kind: "process" },
      { label: "Product", sub: "price, rental rate", kind: "product" },
    ],
    tasks: [
      {
        title: "Add a product",
        steps: [
          "Add the materials first (with their purchase unit if you buy in rolls or boxes).",
          "New product → BOM per unit, labour hours, stages, prices.",
          "A material with a BOM is a component: it can be produced and planned as part of a bigger job.",
        ],
      },
    ],
    terms: ["BOM", "Component", "Standard cost", "Costing method"],
  },
  {
    id: "contacts",
    group: "Setup",
    title: "Customers & suppliers",
    routes: ["/contacts"],
    summary: "Who you buy from and sell or rent to. A contact is either a customer or a supplier.",
    flow: [
      { label: "Supplier", kind: "material" },
      { label: "Serat", kind: "process" },
      { label: "Customer", kind: "product" },
    ],
    tasks: [{ title: "Add a contact", steps: ["New contact → role, name, phone, country (for export documents)."] }],
  },
  {
    id: "settings",
    group: "Setup",
    title: "Settings",
    routes: ["/settings"],
    summary: "Company details, labour and overhead rates, exchange rates, warehouse locations, costing method, and your data (backup and restore).",
    flow: [
      { label: "Rates & method", kind: "money" },
      { label: "Every new calculation", kind: "process" },
    ],
    tasks: [
      {
        title: "Keep your data safe",
        steps: ["Data lives only in this browser. Download a backup regularly and keep the file somewhere safe.", "Restore checks the file and refuses broken ones without touching your data."],
      },
    ],
    terms: ["Costing method", "Overhead"],
  },
];

export interface GlossaryTerm {
  term: string;
  meaning: string;
  where?: string;
}

export const GLOSSARY: GlossaryTerm[] = [
  { term: "Lot", meaning: "One pile of the same item with one unit cost — e.g. 1.2 m³ of teak from one purchase. Stock is always kept in lots.", where: "Stock pages, lot codes LOT-…" },
  { term: "Unit cost", meaning: "What one unit of a lot cost you: purchase price plus its share of freight, or the actual job cost for things you made.", where: "Lot tables" },
  { term: "Job cost", meaning: "Materials used (minus offcuts and sold waste) + labour + overhead + other costs of one work order.", where: "Work order → Job cost" },
  { term: "Standard cost", meaning: "The planned cost from BOM or recipe at today's prices and rates. Used for estimates and partial receipts.", where: "Products, recipes, routes" },
  { term: "COGS", meaning: "Cost of goods sold: the unit cost of the exact lots you shipped.", where: "Sales orders" },
  { term: "Offcut", meaning: "A usable leftover with its own size and price. It goes back to stock and is suggested first next time.", where: "Stock → Offcuts" },
  { term: "Waste", meaning: "What cannot be used again. Its cost stays in the product; if you sell it (e.g. sawdust) that money lowers the job cost.", where: "Completing a work order" },
  { term: "Yield", meaning: "How much of the material issued ended up in the product rather than as offcut or waste.", where: "Job cost" },
  { term: "Work order", meaning: "One job on the floor. Types: Production, Conversion (product → other product), Merge (several → one), Dismantling, Repair.", where: "Work orders, codes WO-…" },
  { term: "Issue", meaning: "Take material out of stock into a work order.", where: "Work order → Issue materials" },
  { term: "Work in progress", meaning: "Value that went into open jobs and has not come out as goods yet.", where: "Flow map, process maps" },
  { term: "BOM", meaning: "Bill of materials: what one unit of a product (or component) needs.", where: "Products & materials" },
  { term: "Component", meaning: "A semi-finished part you make yourself (e.g. a frame) — a material with its own BOM or recipe.", where: "Production routes" },
  { term: "Recipe", meaning: "A reusable process: inputs, outputs, labour and expected offcut per batch.", where: "Recipes, codes RCP-…" },
  { term: "Batch", meaning: "One run of a recipe. A work order can run several batches.", where: "Recipes" },
  { term: "Route", meaning: "One way to obtain an item: make it (BOM or recipe), buy it, or recover it by dismantling.", where: "Production routes" },
  { term: "Dismantling", meaning: "Taking a product apart to recover materials. Recovered timber is a by-product and is never valued above new timber.", where: "Work orders" },
  { term: "Auxiliary materials", meaning: "Screws, finishing, packaging — needed but not what shapes the product. Hidden on route maps unless you ask.", where: "Production routes" },
  { term: "Landed cost", meaning: "Purchase price plus a share of freight and unloading.", where: "Purchasing" },
  { term: "Reserved", meaning: "Stock bought for one work order; other jobs cannot take it until that job ends.", where: "Lots" },
  { term: "Free stock", meaning: "Available and not reserved for another job.", where: "Requirements" },
  { term: "Costing method", meaning: "How the cost of stock leaving is decided: FIFO (default), moving average, specific identification, or LIFO (internal analysis only).", where: "Settings, Cost report" },
  { term: "Overhead", meaning: "Electricity, machines, rent — charged per labour hour.", where: "Settings, work orders" },
  { term: "Down payment", meaning: "Part of a sales order paid before delivery.", where: "Sales" },
  { term: "Receivables", meaning: "Money customers still owe you.", where: "Receivables & payables" },
  { term: "Payables", meaning: "Money you still owe suppliers.", where: "Receivables & payables" },
  { term: "On rent", meaning: "Units at a customer under a rental or loan. Still your stock and still counted in stock value.", where: "Rental & loan" },
  { term: "Late fee", meaning: "Days past the end date × daily rate × units.", where: "Rental & loan" },
  { term: "Deposit", meaning: "Money held for a rental; settled against the bill when it closes.", where: "Rental & loan" },
  { term: "Trace", meaning: "Following a lot back to its purchase and forward to its customers.", where: "Lot trace" },
  { term: "Stage", meaning: "A step in a product's route (Cutting, Assembly, Sanding…).", where: "Production board" },
];

/** Topic for a pathname: the longest matching route prefix. */
export function topicFor(pathname: string): HelpTopic | undefined {
  let best: HelpTopic | undefined;
  let bestLen = -1;
  for (const t of HELP_TOPICS) {
    for (const r of t.routes) {
      const match = r === "/" ? pathname === "/" : pathname === r || pathname.startsWith(`${r}/`);
      if (match && r.length > bestLen) {
        best = t;
        bestLen = r.length;
      }
    }
  }
  return best;
}

export const termByName = (name: string) => GLOSSARY.find((g) => g.term === name);
