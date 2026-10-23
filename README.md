# Serat — the production ledger for furniture workshops

*Formerly called MebelOS.*

> *Every offcut has a price.*

Serat is a **frontend-only** ERP (React 19 + HeroUI v3 + Tailwind v4) for furniture production houses that
make, export, supply, and rent out or lend furniture. There is no backend: all data lives in the
browser (localStorage), with JSON backup and restore.

> Field research & personas: [`docs/RESEARCH.md`](docs/RESEARCH.md) · Specification & costing method: [`docs/PRODUCT.md`](docs/PRODUCT.md) · Brand identity: [`docs/BRAND.md`](docs/BRAND.md)

## What makes it "smart"

| Problem on the shop floor | How Serat solves it |
|---|---|
| Raw material → product, product → another product, product → material, damaged unit → sellable | One **work order** concept with 4 types: Production, Conversion, Dismantling, Repair |
| Offcuts get thrown away because nobody records them | Usable offcuts become **offcut lots** (with L×W×H size & value), are **suggested first** automatically when issuing materials, plus a hint "enough for N× product X" |
| Leftovers from project purchases "disappear" | A purchase can be linked to a work order → reserved; when the job is done, the leftover **becomes free stock automatically** at its original purchase price + freight |
| Inaccurate job cost | Job cost = materials issued − offcut credit − salvage value + labour + overhead + other costs; cost per lot (specific identification), freight split by value (landed cost) |
| Several outputs from one process | Joint cost allocated by **relative sales value** (or manual shares) |
| Dismantled material valued too high | Dismantling uses **lower of cost or NRV** — the excess is booked as a loss |
| Double booking & rental damage | 14-day availability grid, date-clash check, return by condition (good/damaged/lost), automatic late fees, damaged unit → repair order in one click |
| Export documents | Print-ready proforma invoice & packing list, container fill estimate (20GP/40GP/40HC), V-Legal (SVLK) & EUDR DDS warnings for EU destinations |
| Too many things to watch | Home "Needs attention": late rentals, short materials, purchase suggestions, ageing offcuts, incomplete export documents |

## New in v2 — complex production scenarios

Added after a *roast* of v1 ([`docs/ROAST.md`](docs/ROAST.md)):

- **Semi-finished components & processed materials** — a material can have a BOM (chair frame, kiln-dried wood). Multi-level MRP suggests component work orders; component cost rolls up into the product.
- **Production stages + WIP board** — a route per product (cut → assemble → sand → upholster → finish → QC → pack), advanced from the board or a phone.
- **Daily labour log & piece rate** — hours × rate or units × piece rate; job cost uses the actual log, not the plan.
- **Partial output** — receive some units early (provisional cost); on close, stock is revalued to actual cost and the difference on units already sold is reported as **cost variance**.
- **QC reject** — units that fail QC come in as damaged, ready for a repair order; reject rate in reports.
- **Payments** — down payment %, final payment, deposit refund; receivables & payables with aging; an order cannot be closed until it is paid in full.
- **Sales returns**, **transfers between locations**, **timber volume** (T × W × L), **purchase units** (roll, box), **custom specification** per order line, **selling materials/offcuts**, **rental delivery/setup fees**, **rental unit utilisation**.
- **UI** — no generic patterns: IBM Plex, hairlines instead of shadows, a metric strip, tables that turn into cards on phones, command palette `Ctrl/⌘ K`.

## New in v3 — negative cases & identity

- **Negative-case audit**: new rejection rules (invalid numbers, circular recipes, archived
  items, wrong contact role, rental units in a stock count, corrupt backup file, …). All of them are
  atomic — not a single piece of data changes when an action is rejected. Full list in `docs/PRODUCT.md`.
- **Serat**: the name, a dovetail-joint mark, IBM Plex Serif for headings, a teak/charcoal/paper palette,
  a welcome screen (sample workshop vs your own workshop), first steps for a new workshop, and a
  consistent voice in empty states & dead-end pages. See `docs/BRAND.md`.

## New in v4 — English, help and searchable tables

- **English throughout** — UI, routes (`/work-orders`, `/stock/offcuts` …), demo data, messages
  and docs. Terms are fixed in [docs/TRANSLATION.md](docs/TRANSLATION.md).
- **First-visit tour** — six short steps with small flow diagrams: lots, work orders, offcuts,
  selling and getting paid. Replay it from Help.
- **Help & guide** (`/help`) — a clickable map of the whole workshop, "your first day", how a job
  cost is made, a guide for every page (flow, step-by-step tasks, what it changes elsewhere),
  a searchable glossary and common questions. Content lives in `src/help/content.ts`.
- **How this works** — a button on every page opens that page's guide in a side panel; the first
  time a page is opened a one-line tip offers it.
- **Sort, search and filter on every table** — click a column header to sort (dates and money
  sort by value), search across all visible columns, and see "x of y" rows.

## New in v3.3 — production routes per item

Click an item to see every way to get it: the BOM, each recipe, buying from a supplier,
dismantling output, and conversions/merges done in the past. Routes go down level by level to
base materials (e.g. chair ← reclaimed teak (processed) ← reclaimed teak (raw) ← bought from a
collector / dismantled from a broken chair). The map also compares unit cost per route and shows
the real history of where the item went. See [`docs/PROCESS.md`](docs/PROCESS.md#production-routes-per-item).

## New in v3.2 — process maps, recipes, merge

- **Process maps** (Sankey diagrams, width = rupiah): per work order, per recipe, lot trace
  (origin → destination, for SVLK/EUDR), and a workshop-wide **Flow map** per period.
- **Recipes**: multiple outputs, several ways to make the same item, batches, expected offcuts &
  waste, usage history (output & materials vs recipe).
- **Merge**: a new work order type (table-and-chairs set, panel from offcuts) and **merge lots**
  in the warehouse.

Details: [`docs/PROCESS.md`](docs/PROCESS.md).

## New in v3.1 — inventory costing methods

FIFO (default), moving average, specific identification, and LIFO (internal analysis only), with
per-item overrides, a change history, and a **Cost report → Costing method** tab that compares
all three from the stock cards. Offcuts and job-specific items always keep their own cost
(per PSAK 14). Details & sources: [`docs/COSTING.md`](docs/COSTING.md).

## Running

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + scenario tests of the domain engine (Vitest)
npm run test:e2e   # Playwright E2E against the real UI (desktop + mobile)
npm run lint
npm run build      # static output in dist/ — host it anywhere (hash router, relative base)
```

On first open, the app loads **demo data** built through the same engine (stock, costs, and
movements are consistent). Clear or reload the demo in **Settings → Data**.

## Architecture

```
src/
  domain/        Pure TypeScript business engine (no React) — can move to a backend later
    types.ts       Data model (Item, Lot, StockMove, Purchase, WorkOrder, SalesOrder, Rental, …)
    core.ts        Lots, movement ledger, lot suggestions (reserved → offcut → FIFO), atomic transactions
    purchasing.ts  Purchasing & landed cost
    production.ts  Work orders, material requirements (MRP), job cost calculation & allocation
    sales.ts       Orders, delivery (COGS), packing list, export document check
    rentals.ts     Availability, hand-over, return, late fees
    analytics.ts   Inventory valuation, purchase suggestions, automatic insights
    db.ts          Schema, migrations, backup
    seed.ts        Demo data
    finance.ts     Payments, receivables/payables, aging
    engine.test.ts    Unit tests (job cost, offcuts, allocation, rentals, ledger consistency)
    scenarios.test.ts Field scenario tests S1–S14 (components, KD, stages, piece rate, partial output, reject, down payment, returns, transfers…)
e2e/             Playwright tests for the main flows in the browser
  store/         Zustand + persist (safe localStorage, synced across tabs)
  components/    App shell & UI components on top of HeroUI v3
  features/      One page set per module
```

Key principles:

- **Atomic** — every action runs on a copy of the database; if a rule is broken (negative stock,
  returning more than was issued, etc.) no data changes and a clear message is shown.
- **Auditable ledger** — the sum of movements for every lot always equals the lot qty (tested automatically).
- **The user's language** — plain workshop English in the UI, task-based flows, responsive for phones/tablets.

## Limitations (frontend-only)

- Data exists only in that device's browser; use a JSON backup to move to another device.
- localStorage capacity is about 5 MB (enough for thousands of transactions).
- No multi-user/permissions, general-ledger accounting, or tax yet — the `domain/` engine is built
  to move to a backend easily when needed.
