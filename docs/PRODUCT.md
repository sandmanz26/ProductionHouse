# Product specification — Serat

## Modules & main flows

| Module | User task | Result in the system |
|-------|----------------|-----------------|
| **Purchasing** | Record purchases, freight, receive goods | A new lot per line, unit cost = price + share of extra costs (split by value) |
| **Work orders** | New production · Conversion · Dismantling · Repair | Issue materials (lots) → complete (output + offcuts) → job cost locked |
| **Sales** | Domestic supply / Export | Delivery takes product lots → COGS & margin; proforma + packing list |
| **Rental & loan** | Booking, hand over, take back | Units get status *on rent*; come back *good/damaged/lost*; automatic late fees |
| **Warehouse** | View stock, offcuts, stock movements, stock count | Digital stock card per lot |
| **Reports** | Job cost, stock value, yield | Every figure can be traced down to the lot |

## Core data model

- **Item** — a material or a product. A product has a BOM (materials needed per unit), standard labour hours, a selling price, a rental rate, an HS code, and packaging data.
- **Lot** — one pile of stock with its own unit cost, an origin (purchase, production, offcut, dismantling, return), a status (available/on rent/damaged), and optional dimensions & a reservation for a specific work order.
- **Stock movement** — an audit trail of every change to a lot's qty, stamped with its source document.

## Costing method (job cost)

Cost is tracked per **lot**, so offcuts carry their own cost. Regular (interchangeable) lots
follow the company's or the item's **costing method**: FIFO, moving average, specific
identification, or LIFO. See [`COSTING.md`](COSTING.md).

### Issuing materials
Lot suggestion order: (1) lots reserved for this work order → (2) **offcut** lots (the smallest that is large enough first, so small pieces get used up) → (3) regular lots by costing method (FIFO: oldest; LIFO: newest). Lots reserved for another work order are not suggested.

### Completing a work order
```
Gross materials  = Σ qty issued × lot cost
Return credit    = Σ (whole: qty × source lot cost) + (offcut: qty × average cost of that material in this WO)
Salvage value    = Σ sales value of waste (by-product NRV, e.g. sawdust)
Net materials    = Gross materials − Return credit − Salvage value
Total cost       = Net materials + Labour (hours × rate) + Overhead + Other costs
```
*Usable* offcuts become a new lot labelled **Offcut** at the average cost of that material in this WO. Returns per material may not exceed what was issued.

### Allocation to several outputs (joint cost)
Output weight = qty × value basis. Value basis: selling price (products) or standard/replacement cost (materials). If all weights are zero → allocated by qty. Users can override the shares (%) manually.

**Dismantling** uses *lower of cost or NRV*: the value of recovered materials is capped at their replacement value; the excess cost is booked as a **dismantling loss**, so used material is never worth more than new material.

### Purchase leftovers
A purchase can be linked to a work order → its lots are reserved. When the WO is done or cancelled, the reservation is released automatically; the leftover stays in stock at its original purchase price + freight and is used by the next production run. The WO's job cost only bears the qty issued minus the qty returned.

### Sales
COGS = Σ qty shipped × product lot cost. Gross margin = revenue (in IDR, at the order's exchange rate) − COGS.

## Rental & loan
- Rental days = date difference + 1 (inclusive). Late fee = days late × daily rate × qty.
- Availability = owned units (available + on rent, excluding damaged) − units booked in overlapping date ranges.
- Returned **damaged** → lot status *damaged* → "Create repair order" button. **Lost** → lot reduced (loss movement) + replacement charge.
- *Loan* = rate 0 (e.g. photo shoots, partner showrooms), same flow.

## Export
Fields: Incoterm, port of loading/discharge, destination country, container type, container/seal no., ETD, V-Legal no. (SVLK, Indonesia's timber legality assurance system), EUDR DDS reference. Practical container capacity estimates: 20GP ≈ 28 CBM, 40GP ≈ 58 CBM, 40HC ≈ 68 CBM — confirm with your forwarder.

## Storage
No backend: `localStorage` (schema version + migrations), JSON backup export/import, reset to demo data.

## v2 — additional rules

- **Components**: a material with a BOM can be a production output. `requirements()` flags component shortfalls as `producible`; `createComponentOrders()` creates child orders (`parentWoId`). Components never appear in purchase suggestions.
- **Labour**: if there are labour log entries, `labor = Σ(hours × rate) + Σ(units × piece rate)`; otherwise `planned hours × rate`.
- **Partial output**: lots are received at standard cost (`receiptId`). On close, total cost is allocated to (final output + partial output) per item → actual unit cost. Partial-output lots still in stock are revalued (`revaluasi` movement, qty 0); `variance = qty already issued × (actual − provisional)`. A job with partial output cannot be cancelled.
- **QC reject**: output with `grade: "reject"` comes in as a `rusak` (damaged) lot at the same cost.
- **Payments**: may not exceed the balance due; refunds are capped at what has been paid (rentals: excess deposit). Receivables = orders already shipped, or past their payment date. An order can only be "done" once paid in full.
- **Sales returns**: at most qty shipped − qty already returned; goods come back at their shipped cost; credit = qty × order price.

## v3 — negative cases (rejection rules)

Every rejection is a `DomainError` with a plain-English message and **changes no data at all**
(operations run on a copy; tested in `src/domain/negative.test.ts`).

| Area | Rejected |
|---|---|
| Numbers | NaN/Infinity/negative for qty, price, rate, overhead, deposit, discount, payment, L×W×H size |
| Master data | duplicate codes, a recipe that contains itself or is **circular** through components, changing the unit while stock exists |
| Archive | archived items cannot be used in **new** documents (existing documents that already contain them can still be edited) |
| Contacts | a customer used as a supplier and vice versa; contacts that do not exist |
| Dates | empty dates; due date / target ship date / rental end before the document date |
| Settings | non-numeric rates, offcut age < 1 day, empty/duplicate locations (cleaned up), deleting a location that still holds stock |
| Warehouse | unknown locations; counting, transferring, or writing off a unit that is **on rent** |
| Production | output that is not a product/component; partial output above plan; cancelling a parent while component orders are still open; any action on a job that is already closed |
| Sales | confirming without a customer; changing the total below what has been paid; changing currency after a payment |
| Rentals | changing a booking below what has been paid; taking back before hand-over; handing over twice |
| Backup | files with duplicate ids, references to items/lots that do not exist, non-numeric qty, records without a name — rejected as a whole with a "corrupt" message |

## v3.2 — recipes, merge, process maps

See [`PROCESS.md`](PROCESS.md). In short:
- Work order from a recipe: materials & output = recipe × batches; the product BOM is not used.
- **Merge** type: one output item, at least two items or two units in, the output may be a material.
- **Merge lots**: same item, status available, same kind (offcut/regular), same reservation;
  weighted-average cost; date = oldest lot.
- Process maps conserve value at every process node; any difference shows as "Work in progress".
