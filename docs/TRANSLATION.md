# Translation guide (Indonesian → English)

The product UI, domain error messages, demo data and docs are English. This guide keeps terms
consistent. **Translate human-readable strings only.** Never rename identifiers, type/enum values
(`"produksi"`, `"sisa"`, `"lembar"`, `"tersedia"` …), object keys, routes/URLs (`/produksi`,
`/stok/sisa` …), storage keys (`mebelos:db`), CSS classes, or test ids.

## Voice
Plain workshop English, short sentences, name the number and the document
("SW-0001 is 2 days late", not "There is a delay on a rental transaction"). Error messages say
what to do next ("Location Showroom still holds stock — move it first."). No exclamation marks,
no emoji, no "seamless/powerful". Sentence case for labels and buttons ("New work order", not
"New Work Order"). Keep the em dash "—" where the Indonesian used it.

## Brand
| Indonesian | English |
|---|---|
| Setiap potongan punya harga. | Every offcut has a price. |
| Buku kerja produksi untuk bengkel mebel | The production ledger for furniture workshops |
| buku kerja | workbook / ledger (prefer "workbook" for the app, "ledger" for stock cards) |
| bengkel | workshop |
| Bengkel contoh / Bengkel saya | Sample workshop / My workshop |

## Core terms
| Indonesian | English |
|---|---|
| HPP (harga pokok produksi) of a job | job cost |
| HPP per unit / harga pokok (lot) | unit cost |
| HPP penjualan | COGS (cost of goods sold) |
| HPP standar / aktual / sementara | standard cost / actual cost / provisional cost |
| Laporan HPP | Cost report |
| biaya standar | standard cost |
| lot | lot |
| sisa, sisa material, potongan sisa | offcut(s) (the page is "Offcuts") |
| limbah | waste; "nilai limbah (dijual)" → salvage value |
| rendemen | yield |
| bahan / material | material(s) |
| bahan pembantu | auxiliary materials |
| komponen (setengah jadi) | component (semi-finished) |
| bahan olahan | processed material |
| produk | product |
| barang | item |
| stok bebas / tersedia | free stock / available |
| dicadangkan | reserved |
| perintah kerja (PK) | work order (WO) |
| jenis pekerjaan: produksi / konversi / gabung / dekonstruksi (bongkar) / perbaikan | Production / Conversion / Merge / Dismantling / Repair |
| ambil bahan | issue materials |
| kembali utuh | returned whole |
| hasil, hasil sebagian | output, partial output (receipt) |
| selesaikan (pekerjaan) | complete |
| tahap(an) | stage(s) |
| papan produksi | production board |
| catatan kerja | labour log |
| borongan | piece rate |
| tenaga kerja | labour |
| overhead | overhead |
| resep (proses) | recipe |
| batch | batch |
| jalur produksi | production routes |
| peta alur | flow map |
| peta proses | process map |
| telusur (lot) | trace |
| asal-usul | origin |
| gabung lot | merge lots |
| pembelian | purchasing / purchase (order) |
| pemasok | supplier |
| pelanggan | customer |
| relasi | contacts |
| penjualan, order penjualan | sales, sales order |
| ekspor | export |
| kirim / pengiriman | ship / delivery |
| retur | return |
| sewa & pinjam | rental & loan |
| serah unit / terima kembali | hand over / take back |
| denda telat | late fee |
| deposit | deposit |
| piutang / utang | receivables / payables |
| lewat tempo / jatuh tempo | overdue / due date |
| DP (uang muka) | down payment |
| pelunasan | final payment |
| refund | refund |
| gudang | warehouse (menu group "Stock") |
| mutasi stok | stock movements |
| stok opname | stock count |
| pindah lokasi | transfer |
| saldo awal | opening stock |
| penyesuaian | adjustment |
| data master | master data |
| pengaturan | settings |
| beranda | home |
| perlu tindakan | needs attention |
| arsipkan / pulihkan | archive / restore |
| metode biaya | costing method |
| rata-rata bergerak | moving average |
| identifikasi khusus | specific identification |
| kurs | exchange rate |

## Labels for enum values
| Value | English label |
|---|---|
| WO status rencana / berjalan / selesai / batal | Planned / In progress / Done / Cancelled |
| lot status tersedia / disewa / rusak | Available / On rent / Damaged |
| route tags BUAT / RESEP / BELI / BONGKAR / PERNAH | MAKE / RECIPE / BUY / DISMANTLE / PAST |
| return kind utuh / sisa / limbah | Whole / Offcut / Waste |
| grade baik / reject | Good / Reject |
| stage status menunggu / proses / selesai | Waiting / Working / Done |
| sales channel supply / ekspor | Supply / Export |

## Units (UOM labels; keys stay Indonesian)
pcs → pcs · lembar → sheet · batang → length · m → m · m2 → m² · m3 → m³ · kg → kg ·
liter → L · set → set · roll → roll

## Categories (keys stay)
Materials: kayu_solid → Solid wood · panel → Panel · kain → Fabric · busa → Foam ·
hardware → Hardware · finishing → Finishing · logam → Metal · rotan → Rattan ·
kemasan → Packaging · lainnya → Other.
Products: kursi → Chair · meja → Table · lemari → Cabinet · sofa → Sofa ·
tempat_tidur → Bed · dekorasi → Decor · set → Set · lainnya → Other.

## Document codes (prefixes)
Work order PK → **WO**, purchase PB → **PO**, sales order **SO**, rental SW → **RN**,
recipe RSP → **RCP**, item **ITM**, contact REL → **CT**, adjustment **ADJ**, lot **LOT**.

## Formatting
English locale: `en-GB` dates ("22 Oct 2026"), comma thousands ("Rp 1,234,567"), compact money
"Rp 36.4M", "Rp 1.2B", "Rp 635K".
