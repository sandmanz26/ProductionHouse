# Roast v1 → Plan v2

An honest critique of the first version of MebelOS, written before fixing it. The goal is not to
defend what exists, but to find where the system will fail on a real production floor.

## 1. UI — where it feels like "AI slop"

| Symptom in v1 | Why it is bad | v2 fix |
|---|---|---|
| Greeting "Selamat malam 👋" ("Good evening") | Decorative emoji are the most common sign of AI-generated UI; they carry no information | Header shows the date & shift, no emoji |
| A row of stat cards with icons in pastel boxes | The "three/four cards + small icon" pattern is identical across thousands of generic dashboards | One hairline *metric strip*, monospace numbers, no decorative icons |
| Every surface `rounded-3xl` + shadow | The same radius on every element = no hierarchy | Small radius (6px), 1px border, no shadows; cards only for grouping |
| Long subtitles on every page | They explain the obvious and push content down | One short line or none |
| Paired coloured chips (type + status) everywhere | Colour loses meaning when it is used for everything | Colour only for statuses that need action; type in plain text |
| "Quick jobs" tile | Duplicates the "New" button | Removed; replaced by a WIP board per stage |
| Default font | No "work tool" character | IBM Plex Sans + Plex Mono for codes & numbers |
| Wide tables need side-scrolling on phones | Craftsmen & production heads use phones — a scrolling table = an unused table | On small screens, table rows turn into stacked cards automatically |
| No global search | An admin has to click through 3 menus to find "WO-0012" | Command palette `Ctrl/⌘ K` |
| "Materials 0%" progress | A misleading indicator is worse than none | Progress based on the **production stages** actually completed |

## 2. Capabilities — field scenarios that failed in v1

Compiled from research (see sources below) and common furniture production patterns.

| # | Real scenario | v1 | v2 |
|---|---|---|---|
| S1 | Chair frames are made first (semi-finished component), then assembled with upholstery | ✗ production output had to be a product | ✓ component = material with a BOM; multi-level MRP suggests component work orders |
| S2 | Green wood is kiln-dried (KD) and shrinks; boards are ripped into components | ✗ no material processing | ✓ material → material production, shrinkage recorded as waste with yield |
| S3 | A job goes through cut → assemble → sand → finish → upholster → QC → pack | ✗ only planned/in-progress status | ✓ stages per work order, WIP board per stage |
| S4 | Craftsmen are paid **piece rate per unit**, finishing is *subcontracted* out | ✗ only hours × rate | ✓ labour log per stage: hours × rate **or** units × piece rate; subcontract cost per stage |
| S5 | 24 chairs: 12 finished and shipped first, the rest next week | ✗ everything had to be finished | ✓ **receive partial output** at provisional cost; on close, lots are revalued to actual cost and the difference on goods already sold is booked as **cost variance** |
| S6 | QC rejects 2 units (finish too glossy) → rework | ✗ | ✓ *reject* output comes in as damaged units → repair order; reject rate reported |
| S7 | Buy timber by the length with dimensions (volume), fabric by the 50 m roll | ✗ manual calculation | ✓ timber volume calculator (T×W×L) & purchase units with conversion |
| S8 | Buyer pays a 30% down payment, final payment before the ship sails; suppliers bill on terms | ✗ no payments | ✓ payments per order/rental/purchase, receivables & payables with aging, "shipped but not paid" warning |
| S9 | Custom order: 200 cm size, walnut finish | ✗ | ✓ specification per order line, carried to the work order |
| S10 | Sell sawdust/offcuts, sell ex-rental units | ✗ sales were products only | ✓ sales may include materials (offcuts/waste with value) |
| S11 | A customer returns goods (defect/cancellation) | ✗ | ✓ **sales returns** with good/damaged condition, back into stock at the original cost |
| S12 | Move 2 sheets of plywood from the warehouse to the workshop | ✗ could only change the location of the whole lot | ✓ partial lot transfer between locations |
| S13 | Event rental: delivery & setup fees; analysis of best-renting units/utilisation | ✗ | ✓ extra rental charges, utilisation report per product |

## 3. Principles we keep

- All business rules live in `src/domain` (pure TypeScript) and are proven by scenario tests.
- Every action is atomic: failure = no data changes.
- The sum of movements for every lot always equals the lot qty (tested in every scenario).

## Sources

- Furniture production stages & WIP tracking: [Ksolves Odoo furniture](https://www.ksolves.com/industries/odoo-manufacturing/furniture), [Ecosire custom furniture](https://ecosire.com/industries/custom-furniture), [Viindoo furniture ERP](https://viindoo.com/page/furniture-erp-software)
- Custom size specifications change the BOM & cost: [Ecosire custom furniture production](https://ecosire.com/apps/odoo/custom-furniture-production)
- Timber volume (T cm × W cm × L m / 10,000): [KapanLagi](https://www.kapanlagi.com/feeds/cara-menghitung-kubikasi-kayu-235da1514b.html)
- Drying shrinkage & processed timber yield of about 50%: [ULM — volumetric shrinkage](https://ppjp.ulm.ac.id/journal/index.php/jht/article/view/1586), [UNISKA](https://ojs.uniska-bjm.ac.id/index.php/AIJP/article/view/2364/1814)
- 30% down payment / 70% final payment before shipping, AQL pre-shipment inspection: [Alibaba seller blog](https://seller.alibaba.com/blogs/2026/southeast-asia/apparel/lc-payment-quality-control-guide-alibaba-b2b), [QualityInspection.org](https://qualityinspection.org/10-inspection), [newbuyingagent](https://www.newbuyingagent.com/es/resources/buying-furniture-from-a-china-manufacturer-step-by-step-process-from-rfq-to-delivery)
- Causes of rework (cutting, drilling, assembly, glossy finish rejected): [UFPB case study](https://repositorio.ufpb.br/jspui/handle/123456789/36262), [Oracle WIP example](https://docs.oracle.com/cd/A60725_05/html/comnls/us/wip/nsdj.htm), [Auditing wood machining](https://qualityinspection.org/wood-furniture-process-china/)
- Event rental: ready/cleaning/damaged zones, utilisation drives returns: [Beancount event rental guide](https://beancount.io/blog/2026/08/18/event-rental-business-bookkeeping-rental-fleet-depreciation-deposits-inventory-loss-guide), [Events Partner](https://eventspartner.com.sg/why-furniture-upkeep-matters-in-event-rentals-and-why-you-can-trust-events-partner)
- Signs of "AI slop" UI: [noqta.tn](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026), [SuperDesign](https://www.superdesign.dev/blog/why-ai-design-looks-generic), [Spot the slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)
