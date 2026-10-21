# MebelOS — ERP Production House Furnitur

ERP **frontend-only** (React 19 + HeroUI v3 + Tailwind v4) untuk production house furnitur yang
memproduksi, mengekspor, men-supply, dan menyewakan/meminjamkan furnitur. Tanpa backend: semua data
tersimpan di browser (localStorage) dengan cadangan/pulihkan JSON.

> Riset lapangan & persona: [`docs/RESEARCH.md`](docs/RESEARCH.md) · Spesifikasi & metode HPP: [`docs/PRODUCT.md`](docs/PRODUCT.md)

## Yang membuatnya "cerdas"

| Masalah di lapangan | Cara MebelOS menyelesaikannya |
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

## Menjalankan

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit test engine domain (Vitest)
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
    engine.test.ts Unit test (HPP, sisa, alokasi, sewa, konsistensi ledger)
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
