# Field research — ERP for furniture production houses

> Written as *discovery* before design. The goal is to understand user behaviour, conditions on
> the production floor, and the real problems the system has to solve — not just a list of
> features.

## 1. Summary of findings

| # | Finding | Design impact |
|---|--------|------------------|
| 1 | Stock records at many small furniture businesses (MSMEs; case studies in Jepara) still use **paper stock cards that are later copied into Excel**, so the records are messy and error-prone. | Input must be as fast as writing on a stock card: few fields, smart defaults, works from a phone/tablet. |
| 2 | Unpredictable orders → **shortages or surpluses of raw materials** (a case where a teak shortage delayed production). | Automatic material requirements check (simple MRP) when creating a work order, plus a one-click draft purchase for shortfalls. |
| 3 | Furniture materials are **hard to quantify** (wood with defects, fabric by the metre, finishing liquids by the litre). | Free choice of unit per material (m³, sheet, m, L, kg, pcs) and records per *lot*, each with its own cost. |
| 4 | **Fewer than 2% of furniture manufacturers record remnant details**; operators decide on their own whether to use an offcut, with no guidelines. Offcuts get thrown away because nobody knows their size. | Offcuts become *first-class citizens*: they have a lot, a size (L×W×H), a value, an age, and are **prioritised automatically** the next time materials are issued. |
| 5 | 4 × 0.25 sheet of offcuts ≠ 1 whole sheet. Area-based planning can mislead when no piece is large enough. | Offcuts are kept as separate lots (not merged into whole stock), with their dimensions; each material has a minimum usable offcut threshold. |
| 6 | Furniture industry waste is very large (reports from Jepara cite sawdust waste up to about 58%; sawmills 20–48%). Some waste still has value (sawdust, pieces for laminated board). | Three return categories: **whole**, **usable offcut**, **waste** (can have a sales value → reduces job cost). Yield report per work order. |
| 7 | Job cost at small furniture businesses is driven mainly by material cost; costing often ignores labour & overhead or does not account for offcuts. | Job cost = net materials (issued − offcut credit) + labour + overhead + other costs. Transparent, traceable to the lot. |
| 8 | *Joint cost* in a process with several outputs is most reasonably allocated by the **relative sales value method**; *by-products*/scrap are deducted from the joint cost at their realisable value. Allocation must be easy to calculate and defensible, not falsely precise. | Allocation engine: weight = qty × selling price (products) or replacement value (materials). Dismantling uses the *lower of cost or NRV* principle: excess cost is booked as a loss instead of inflating the value of used material. |
| 9 | Exports of processed timber from Indonesia require **SVLK / a V-Legal Document** (Indonesia's timber legality assurance system). **EUDR** (EU Regulation 2025/2650) applies from **30 Dec 2026** for large/medium companies and **30 Jun 2027** for micro/small ones — it requires a *Due Diligence Statement* reference number. The industry association (HIMKI) complains about the double burden of SVLK + EUDR. | Export orders store the V-Legal no. & EUDR DDS reference, and the system **warns** when the destination is the EU but the documents are incomplete. |
| 10 | Furniture packing lists are recorded per carton/crate: description, product code, quantity, gross/net weight, dimensions, CBM, *shipping mark*. *Knock-down* furniture is often split across several cartons. | Products store packaging data (dimensions, weight, cartons per unit). Packing list & proforma invoice print automatically + container fill estimate (20GP/40GP/40HC). |
| 11 | Furniture rental businesses struggle with **damage documentation**, assigning responsibility, automatic late fees, and **double booking**. | Availability check by date range, return per unit with condition (good/damaged/lost) + charges, automatic late fees, a damaged unit can go straight to a repair order. |
| 12 | Why factory software fails to get adopted: systems built for large enterprises, shop-floor workers ignored, poor usability drives *workarounds* — trained staff still record on paper. | The "no fuss" principle: plain everyday language, task-based flows (not accounting modules), at most one screen per task, responsive for tablet/phone. |

## 2. Personas

**Pak Darto — Production head (workshop floor).**
Directs the craftsmen, takes materials from the warehouse, decides which pieces get used.
Uses an Android phone. *Needs:* to know whether there are enough materials, what offcuts there are, and to record usage in seconds.
*Frustrations:* writing the same thing again on paper & laptop; not knowing where last week's plywood offcut went.

**Bu Sinta — Warehouse & purchasing admin.**
Receives goods from suppliers, records freight, prepares POs. *Needs:* a ready-made shortage list, purchase price + freight split across items automatically.
*Frustrations:* purchases for one project leave a lot over, which then "disappears" from the records and gets bought again.

**Mas Raka — Sales & export.**
Handles overseas buyers, proformas, packing lists, containers, V-Legal documents. *Needs:* documents out fast and correct, knowing how many CBM still fit.

**Mbak Lia — Rental/loan coordinator (events, film, photo shoots).**
*Needs:* to know which units are available on a given date, when units come back, who damaged them.

**Pak Hendra — Owner.**
*Needs:* true job cost per product, margins, stock value & offcut value, early warnings.

## 3. Core problems solved

1. **Item transformation** — raw material → new product; product → different product (conversion);
   product → material (dismantling); damaged product → sellable (repair). All through **one concept:
   the work order**, with inputs (any lot) and outputs (any item).
2. **Offcuts** from every process go back into stock as lots with a value, are prioritised to be
   used first, and reduce the cost of the process that produced them.
3. **Purchase leftovers** — a purchase made for one project is reserved for that project; once the
   project is done, the leftover is released automatically for the next production run at its
   original purchase price. Job cost only bears what was actually used.
4. **Three ways out for goods** — domestic supply, export, and rental/loan (goods come back).

## 4. Design principles

1. **One task, one screen.** Users think "issue materials", "complete production", not "inventory journal".
2. **The system suggests, people decide.** Lots are picked automatically (reserved → offcut → FIFO) and can be changed.
3. **Every number can be traced.** Every rupiah of job cost can be clicked through to its lot and the purchase it came from.
4. **Warn, don't block.** The system reminds (short stock, incomplete export documents, late rentals) without stopping work — except for things that would corrupt data (negative stock, returning more than was issued).
5. **Offline-first.** No backend: data is stored on the device, with JSON backup export/import.

## 5. Sources

- Manual stock card records — Dampit Outdoor Jepara Furniture: https://eprints.umk.ac.id/17455/2/BAB%20I.pdf
- Teak shortages caused by unpredictable orders — WT Furniture Jepara: https://eprints.umk.ac.id/23028/2/Bab%201%20TA.pdf
- Job cost & cutting efficiency in furniture clusters: https://journal.uii.ac.id/JATTEC/article/download/36830/17520/126955
- Effect of raw material cost on the profit of Jepara wood MSMEs: https://www.jurnal.politeknik-kebumen.ac.id/E-Bis/article/download/2376/1320/
- Raw material requirements planning: https://journal.unisnu.ac.id/jra/article/download/jra.v2i2.249/149
- Plywood remnants (< 2% of manufacturers record offcuts): https://www.woodworkingnetwork.com/red-book/best-practices-guide/converting-plywood-remnants-throughput
- Remnant ≠ whole unit (Acumatica forum): https://community.acumatica.com/distribution-6/inventory-pieces-remnants-any-ideas-on-best-way-to-deal-with-this-8194
- The challenge of hard-to-quantify materials: https://ventor.tech/industries/manufacturing/odoo-for-furniture-kitchen-and-bathrooms-manufacturing/
- Sawmill waste: https://ppjp.ulm.ac.id/journals/index.php/jss/article/view/9221
- Sawdust waste in the Jepara furniture industry: https://abdimasku.lppm.dinus.ac.id/index.php/jurnalabdimasku/article/download/91/70
- By-product & joint costing: https://www.accountingtools.com/articles/2017/5/14/by-product-costing-and-joint-product-costing
- Joint products (ACCA): https://opentuition.com/acca/ma/notes/ma-13-process-costing-joint-products/
- The double burden of EUDR & SVLK: https://indonesiabusinesspost.com/1356/business-and-investment/eudr-and-svlk-overlapping-regulations-strain-indonesian-furniture-exports
- EUDR postponement (Reg. 2025/2650) to 30 Dec 2026 / 30 Jun 2027: https://wikifarmer.com/library/en/article/eudr-deforestation-regulation-december-2026
- Furniture packing list: https://arcedior.com/blog/export-packing-list-for-furniture-example
- HS 9403: https://ximpex.in/hs-codes/9403
- Furniture rental problems (damage, late returns, double booking): https://gitnux.org/best/furniture-rental-software/ , https://apps.odoo.com/apps/modules/18.0/rental_product_damage_tracker
- Software adoption on the production floor: https://sapinsider.org/?p=86801 , https://www.manufacturing.net/operations/article/13240874/technology-on-the-shop-floor-empowering-your-manufacturing-team

> Note: some sources are case studies, undergraduate theses, or vendor material; the figures are
> used as design direction, not as hard statistics. The EUDR dates should be re-checked against
> official EU sources before being used for compliance decisions.
