# Inventory costing methods

Serat supports four methods. The company method is set in **Settings → Inventory costing
method**, and can be overridden per item in **Master data → Costing method**.

| Method | How it works in Serat | PSAK 14 | UU PPh |
|---|---|:-:|:-:|
| **FIFO** (default) | Regular lots leave from the **oldest**. The system rejects issuing a newer lot while an older lot is still in stock. | ✓ | ✓ |
| **Moving average** | All regular lots of an item use **the same average cost**, recalculated on every receipt. Whichever lot is issued, the cost is the same. | ✓ | ✓ |
| **Specific identification** | The cost of the lot actually issued. Users may pick any lot. | ✓ | — ¹ |
| **LIFO** | Regular lots leave from the **newest**. Flagged "not PSAK" on every screen. | ✗ | ✗ |

PSAK 14 is the Indonesian financial accounting standard for inventories (aligned with IAS 2); UU PPh
is the Indonesian Income Tax Law.

¹ The Income Tax Law only names average and FIFO. Specific identification is valid in accounting
for items that are not interchangeable, but check with a tax adviser before using it for the
tax return (SPT).

## What always keeps its own cost (specific identification)

PSAK 14 / IAS 2 require specific identification for items that are **not interchangeable** and
items **segregated for a specific project**. So, whatever the method:

- **Offcuts**: unique pieces with their own size. Still suggested first (the promise
  "every offcut has a price" does not change).
- **Items bought for one work order**: they stay with that job until the reservation is
  released.
- **Planned units** (chairs being repaired or dismantled) and **damaged units**.

## Behaviour in detail

- **Layer order**: lot receipt date, then lot number. Split lots (transfer, rental hand-over)
  inherit their parent's date, so they keep the same place in the layers.
- **FIFO/LIFO**: the order applies company-wide, not per location. The issue materials dialog
  marks the "Next out" lot and its location. A lot selection in the wrong order whose combination is
  still valid (e.g. use up the old lot + part of the new lot) is reordered automatically.
- **Moving average**: every change to a lot's cost is recorded as a `revaluasi` movement (qty 0,
  reference "Average"), so the stock card stays auditable. Total value does not change.
- **Material returns** (cancelled issue, returned whole): come back at the cost they left at. If
  the lot cost has since changed (average), the two are blended so no value appears or disappears.
- **Partial output**: when the job is closed, partial-output lots are adjusted by the **difference**
  (actual cost − provisional cost), not overwritten. Lots already blended into the average stay correct.
- **Changing method**: applies to items issued from then on; values already recorded are not
  changed, except when switching to average (existing stock is averaged immediately). Every change
  is logged in the history (date, from, to, item). The Income Tax Law requires the method to be
  applied consistently, and a change for tax purposes needs approval from DJP (the Directorate
  General of Taxes).

## Cost report → Costing method

Each item's stock card is replayed with FIFO, average, and LIFO. For each method, the report
shows the cost of items issued, the closing stock value, and the difference from the books. Items
are sorted by the widest range, i.e. the ones most sensitive to the choice of method.

Simulation limits: incoming costs are used as recorded. Knock-on effects on the job cost of
products made from those materials are not recalculated.

## Sources

- IAI, PSAK 14 *Persediaan* (Inventories) (revised 2008, effective 1 January 2009): LIFO is no
  longer permitted. Secondary summaries (not the official IAI text — refer to the standard itself
  for quotations):
  [Jurnal Aplikasi Akuntansi, Universitas Mataram](https://jaa.unram.ac.id/index.php/jaa/article/download/103/68),
  [Jurnal.id](https://www.jurnal.id/id/blog/2018-perbedaan-metode-persediaan-fifo-lifo-dan-average).
- UU PPh Pasal 10 ayat (6) (Income Tax Law, Article 10(6)): average and FIFO only —
  [DDTCNews: why LIFO is no longer used](https://news.ddtc.co.id/berita/nasional/1805509/mengapa-pencatatan-persediaan-metode-lifo-tidak-lagi-dipakai),
  [DDTCNews: the FIFO method](https://news.ddtc.co.id/literasi/kamus/43616/terkait-dengan-pajak-penghasilan-apa-itu-metode-fifo),
  [Ortax: COGS in corporate income tax](https://ortax.org/mengenal-konsep-biaya-harga-pokok-penjualan-dalam-pph-badan),
  [DDTCNews: changing the bookkeeping method](https://news.ddtc.co.id/review/konsultasi/6845/perubahan-metode-pembukuan).
- IAS 2: specific identification for items that are not interchangeable, FIFO/average for the
  rest, LIFO prohibited —
  [KPMG](https://kpmg.com/us/en/articles/2026/inventory-accounting-ifrs-accounting-standards-vs-us-gaap.html),
  [Deloitte DART](https://dart.deloitte.com/USDART/home/publications/deloitte/additional-deloitte-guidance/roadmap-ifrs-us-gaap-comparison/chapter-1-assets/1-4-inventories),
  [BDO NZ IAS 2](https://www.bdo.nz/getmedia/6242451a-01c0-43ea-bb99-feeb85b19083/2025-NZ-IAS-2.pdf).
