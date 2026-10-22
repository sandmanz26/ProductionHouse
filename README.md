# Serat — buku kerja produksi untuk bengkel mebel

> *Setiap potongan punya harga.*

Serat (dulu "MebelOS") adalah ERP **frontend-only** (React 19 + HeroUI v3 + Tailwind v4) untuk production house furnitur yang
memproduksi, mengekspor, men-supply, dan menyewakan/meminjamkan furnitur. Tanpa backend: semua data
tersimpan di browser (localStorage) dengan cadangan/pulihkan JSON.

> Riset lapangan & persona: [`docs/RESEARCH.md`](docs/RESEARCH.md) · Spesifikasi & metode HPP: [`docs/PRODUCT.md`](docs/PRODUCT.md) · Identitas merek: [`docs/BRAND.md`](docs/BRAND.md)

## Yang membuatnya "cerdas"

| Masalah di lapangan | Cara Serat menyelesaikannya |
|---|---|
| Barang mentah → produk, produk → produk lain, produk → bahan, unit rusak → layak | Satu konsep **Perintah Kerja** dengan 4 jenis: Produksi, Konversi, Dekonstruksi, Perbaikan |
| Sisa potongan dibuang karena tidak tercatat | Sisa layak pakai jadi **lot sisa** (dengan ukuran P×L×T & nilai), otomatis **disarankan lebih dulu** saat ambil bahan, plus saran "cukup untuk N× produk X" |
| Sisa pembelian proyek "hilang" | Pembelian bisa ditautkan ke perintah kerja → dicadangkan; saat selesai, sisanya **otomatis jadi stok bebas** dengan harga beli + ongkir aslinya |
| HPP tidak akurat | HPP = bahan diambil − kredit sisa − nilai limbah + tenaga kerja + overhead + biaya lain; biaya per lot (identifikasi spesifik), ongkir dibagi menurut nilai (landed cost) |
| Beberapa output dari satu proses | Alokasi biaya bersama menurut **nilai jual relatif** (atau porsi manual) |
| Bongkaran dinilai terlalu mahal | Dekonstruksi memakai **lower of cost or NRV** — kelebihan dicatat sebagai rugi |
| Double booking & kerusakan sewa | Grid ketersediaan 14 hari, cek bentrok tanggal, kembali per kondisi (baik/rusak/hilang), denda telat otomatis, unit rusak → perintah perbaikan sekali klik |
| Dokumen ekspor | Proforma invoice & packing list siap cetak, estimasi isi kontainer (20GP/40GP/40HC), peringatan V-Legal (SVLK) & DDS EUDR untuk tujuan UE |
| Banyak hal harus dipantau | Beranda "Perlu perhatian": sewa terlambat, bahan kurang, saran pembelian, sisa menua, dokumen ekspor belum lengkap |

## Baru di v2 — skenario produksi yang rumit

Ditambahkan setelah *roast* terhadap v1 ([`docs/ROAST.md`](docs/ROAST.md)):

- **Komponen setengah jadi & bahan olahan** — material bisa punya BOM (rangka kursi, kayu KD). MRP bertingkat menyarankan perintah kerja komponen; HPP komponen ikut naik ke produk.
- **Tahapan produksi + papan WIP** — rute per produk (potong → rakit → amplas → jok → finishing → QC → packing), dimajukan dari papan atau HP.
- **Catatan kerja harian & borongan** — jam × tarif atau unit × tarif borongan; HPP memakai catatan nyata, bukan rencana.
- **Hasil bertahap** — terima sebagian unit lebih dulu (HPP sementara); saat ditutup, stok direvaluasi ke HPP aktual dan selisih atas unit yang sudah terjual dilaporkan sebagai **selisih HPP**.
- **QC reject** — unit gagal QC masuk sebagai rusak, siap perintah perbaikan; tingkat reject di laporan.
- **Pembayaran** — DP %, pelunasan, refund deposit; piutang & utang dengan umur (aging); order tidak bisa ditutup bila belum lunas.
- **Retur penjualan**, **transfer antar lokasi**, **kubikasi kayu** (T × L × P), **satuan beli** (roll, dus), **spesifikasi custom** per baris order, **jual material/sisa**, **biaya antar/setting sewa**, **utilisasi unit sewa**.
- **UI** — tanpa pola generik: IBM Plex, garis tipis alih-alih bayangan, strip metrik, tabel otomatis jadi kartu di HP, command palette `Ctrl/⌘ K`.

## Baru di v3 — kasus negatif & identitas

- **Audit kasus negatif**: aturan penolakan baru (angka tidak valid, resep melingkar, item
  diarsipkan, peran relasi salah, unit sewa yang mau di-opname, file cadangan rusak, …). Semuanya
  atomik — data tidak berubah sedikit pun saat ditolak. Daftar lengkap di `docs/PRODUCT.md`.
- **Serat**: nama, tanda sambungan ekor burung, IBM Plex Serif untuk judul, palet jati/arang/kertas,
  layar sambutan (bengkel contoh vs bengkel sendiri), langkah pertama untuk bengkel baru, dan
  suara yang konsisten di keadaan kosong & halaman buntu. Lihat `docs/BRAND.md`.

## Baru di v3.3 — jalur produksi per barang

Klik satu barang untuk melihat semua jalan menuju barang itu: BOM, setiap resep, dibeli dari
pemasok, hasil bongkar, serta konversi/gabung yang pernah dilakukan. Jalurnya bertingkat sampai
ke bahan dasar (mis. kursi ← jati reclaimed ← kayu bongkaran ← dibeli dari pengepul / bongkar
kursi rusak). Peta juga membandingkan HPP per jalur dan menampilkan riwayat nyata ke mana barang
itu pergi. Lihat [`docs/PROCESS.md`](docs/PROCESS.md#jalur-produksi-per-barang).

## Baru di v3.2 — peta proses, resep, gabung

- **Peta proses** (diagram Sankey, lebar = rupiah): per perintah kerja, per resep, telusur lot
  (asal-usul → tujuan, untuk SVLK/EUDR), dan **Peta alur** seluruh bengkel per periode.
- **Resep proses**: banyak hasil, banyak cara membuat barang yang sama, batch, perkiraan sisa &
  limbah, riwayat pemakaian (hasil & bahan vs resep).
- **Gabung**: jenis perintah kerja baru (set meja-kursi, panel dari potongan sisa) dan **gabung lot**
  di gudang.

Detail: [`docs/PROCESS.md`](docs/PROCESS.md).

## Baru di v3.1 — metode biaya persediaan

FIFO (default), rata-rata bergerak, identifikasi khusus, dan LIFO (khusus analisa internal), dengan
override per barang, riwayat perubahan, dan tab **Laporan HPP → Metode biaya** yang membandingkan
ketiganya dari kartu stok. Sisa material dan barang khusus pekerjaan tetap memakai harganya sendiri
(sesuai PSAK 14). Detail & sumber: [`docs/COSTING.md`](docs/COSTING.md).

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit + skenario test engine domain (Vitest)
npm run test:e2e   # E2E Playwright terhadap UI asli (desktop + mobile)
npm run lint
npm run build      # output statis di dist/ — bisa di-host di mana saja (hash router, base relatif)
```

Pertama kali dibuka, aplikasi memuat **data demo** yang dibangun lewat engine yang sama (stok, HPP, dan
mutasi konsisten). Kosongkan atau muat ulang demo di **Pengaturan → Data**.

## Arsitektur

```
src/
  domain/        Engine bisnis murni TypeScript (tanpa React) — bisa dipindah ke backend kelak
    types.ts       Model data (Item, Lot, StockMove, Purchase, WorkOrder, SalesOrder, Rental, …)
    core.ts        Lot, ledger mutasi, saran lot (cadangan → sisa → FIFO), transaksi atomik
    purchasing.ts  Pembelian & landed cost
    production.ts  Perintah kerja, kebutuhan bahan (MRP), perhitungan & alokasi HPP
    sales.ts       Order, pengiriman (HPP penjualan), packing list, cek dokumen ekspor
    rentals.ts     Ketersediaan, serah-terima, pengembalian, denda
    analytics.ts   Valuasi persediaan, saran pembelian, insight otomatis
    db.ts          Skema, migrasi, cadangan
    seed.ts        Data demo
    finance.ts     Pembayaran, piutang/utang, aging
    engine.test.ts    Unit test (HPP, sisa, alokasi, sewa, konsistensi ledger)
    scenarios.test.ts Test skenario lapangan S1–S14 (komponen, KD, tahapan, borongan, hasil bertahap, reject, DP, retur, transfer…)
e2e/             Test Playwright untuk alur utama di browser
  store/         Zustand + persist (localStorage aman, sinkron antar tab)
  components/    Shell aplikasi & komponen UI di atas HeroUI v3
  features/      Halaman per modul
```

Prinsip penting:

- **Atomik** — setiap aksi dijalankan pada salinan database; jika aturan dilanggar (stok minus,
  pengembalian melebihi pengambilan, dll.) tidak ada data yang berubah dan pesan jelas ditampilkan.
- **Ledger dapat diaudit** — jumlah mutasi setiap lot selalu sama dengan qty lot (diuji otomatis).
- **Bahasa pengguna** — UI berbahasa Indonesia sehari-hari, alur berbasis tugas, responsif untuk HP/tablet.

## Batasan (frontend-only)

- Data hanya ada di browser perangkat itu; gunakan cadangan JSON untuk pindah perangkat.
- Kapasitas localStorage ±5 MB (cukup untuk ribuan transaksi).
- Belum ada multi-pengguna/hak akses, akuntansi buku besar, atau pajak — engine `domain/` disiapkan
  agar mudah dipindah ke backend ketika dibutuhkan.
