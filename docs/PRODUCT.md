# Spesifikasi Produk — Serat

## Modul & alur utama

| Modul | Tugas pengguna | Hasil di sistem |
|-------|----------------|-----------------|
| **Pembelian** | Catat pembelian, ongkir, terima barang | Lot baru per baris, harga pokok = harga + porsi biaya tambahan (dibagi menurut nilai) |
| **Perintah Kerja** | Produksi baru · Konversi · Dekonstruksi · Perbaikan | Ambil bahan (lot) → selesaikan (output + sisa) → HPP terkunci |
| **Penjualan** | Supply domestik / Ekspor | Pengiriman mengambil lot produk → HPP penjualan & margin; proforma + packing list |
| **Sewa & Pinjam** | Booking, serah unit, terima kembali | Unit berstatus *disewa*; kembali *baik/rusak/hilang*; denda otomatis |
| **Gudang** | Lihat stok, sisa, mutasi, stok opname | Kartu stok digital per lot |
| **Laporan** | HPP, nilai stok, rendemen | Angka bisa ditelusuri sampai lot |

## Model data inti

- **Item** — material atau produk. Produk punya BOM (kebutuhan bahan per unit), jam kerja standar, harga jual, tarif sewa, HS code, data kemasan.
- **Lot** — satu tumpukan stok dengan harga pokok per satuan sendiri, asal (pembelian, produksi, sisa, dekonstruksi, retur), status (tersedia/disewa/rusak), opsional dimensi & cadangan untuk perintah kerja tertentu.
- **Mutasi stok** — jejak audit setiap perubahan qty lot, bertanda tangan dokumen sumber.

## Metode biaya (HPP)

Biaya dihitung per **lot**, sehingga sisa material membawa harganya sendiri. Lot biasa (yang bisa
saling menggantikan) mengikuti **metode biaya** perusahaan atau barang: FIFO, rata-rata bergerak,
identifikasi khusus, atau LIFO. Lihat [`COSTING.md`](COSTING.md).

### Pengambilan bahan
Urutan saran lot: (1) lot yang dicadangkan untuk perintah kerja ini → (2) lot **sisa** (terkecil yang cukup lebih dulu, agar potongan kecil habis) → (3) lot reguler menurut metode biaya (FIFO: terlama; LIFO: terbaru). Lot yang dicadangkan untuk perintah kerja lain tidak disarankan.

### Penyelesaian perintah kerja
```
Bahan bruto      = Σ qty diambil × harga lot
Kredit kembali   = Σ (utuh: qty × harga lot asal) + (sisa: qty × rata-rata harga bahan itu di WO ini)
Nilai limbah     = Σ nilai jual limbah (NRV by-product, mis. serbuk gergaji)
Bahan neto       = Bahan bruto − Kredit kembali − Nilai limbah
Total biaya      = Bahan neto + Tenaga kerja (jam × tarif) + Overhead + Biaya lain
```
Sisa *layak pakai* menjadi lot baru berlabel **Sisa** dengan harga rata-rata bahan tersebut di WO ini. Pengembalian per bahan tidak boleh melebihi yang diambil.

### Alokasi ke beberapa output (biaya bersama)
Bobot output = qty × dasar nilai. Dasar nilai: harga jual (produk) atau harga standar/pengganti (material). Jika semua bobot nol → dialokasikan menurut qty. Pengguna dapat menimpa porsi (%) secara manual.

**Dekonstruksi** memakai *lower of cost or NRV*: nilai bahan hasil bongkaran dibatasi maksimal nilai penggantinya; kelebihan biaya dicatat sebagai **rugi dekonstruksi** agar bahan bekas tidak bernilai lebih mahal daripada bahan baru.

### Sisa pembelian
Pembelian dapat ditautkan ke perintah kerja → lot dicadangkan. Saat WO selesai/batal, cadangan dilepas otomatis; sisa tetap di stok dengan harga beli + ongkir aslinya dan dipakai produksi berikutnya. HPP WO hanya menanggung qty yang diambil dikurangi yang dikembalikan.

### Penjualan
HPP penjualan = Σ qty dikirim × harga lot produk. Margin kotor = pendapatan (dalam IDR, memakai kurs order) − HPP.

## Sewa & pinjam
- Hari sewa = selisih tanggal + 1 (inklusif). Denda telat = hari terlambat × tarif harian × qty.
- Ketersediaan = unit milik (tersedia + disewa, tidak termasuk rusak) − unit yang dibooking pada rentang tanggal yang beririsan.
- Kembali **rusak** → lot berstatus *rusak* → tombol "Buat Perintah Perbaikan". **Hilang** → lot dikurangi (mutasi hilang) + biaya ganti.
- *Pinjam* = tarif 0 (mis. pemotretan, showroom mitra), alur sama.

## Ekspor
Field: Incoterm, pelabuhan muat/bongkar, negara tujuan, jenis kontainer, no. kontainer/segel, ETD, No. V-Legal (SVLK), referensi DDS EUDR. Estimasi kapasitas kontainer (praktis): 20GP ≈ 28 CBM, 40GP ≈ 58 CBM, 40HC ≈ 68 CBM — verifikasi dengan forwarder.

## Penyimpanan
Tanpa backend: `localStorage` (versi skema + migrasi), ekspor/impor cadangan JSON, reset ke data demo.

## v2 — aturan tambahan

- **Komponen**: material dengan BOM dapat menjadi output produksi. `requirements()` menandai kekurangan komponen sebagai `producible`; `createComponentOrders()` membuat perintah anak (`parentWoId`). Komponen tidak pernah muncul di saran pembelian.
- **Tenaga kerja**: bila ada catatan kerja, `labor = Σ(jam × tarif) + Σ(unit × tarif borongan)`; jika tidak, `jam rencana × tarif`.
- **Hasil bertahap**: lot diterima dengan HPP standar (`receiptId`). Saat penutupan, biaya total dialokasikan ke (hasil akhir + hasil bertahap) per item → HPP aktual per unit. Lot hasil bertahap yang masih ada direvaluasi (mutasi `revaluasi`, qty 0); `variance = qty sudah keluar × (aktual − sementara)`. Pekerjaan dengan hasil bertahap tidak bisa dibatalkan.
- **QC reject**: output `grade: "reject"` masuk sebagai lot `rusak` dengan HPP yang sama.
- **Pembayaran**: tidak boleh melebihi sisa tagihan; refund maksimal yang sudah dibayar (sewa: kelebihan deposit). Piutang = order yang sudah dikirim, atau sudah lewat tanggal bayar. Order hanya bisa "selesai" bila lunas.
- **Retur penjualan**: maksimal qty terkirim − sudah diretur; barang kembali dengan HPP kirim; kredit = qty × harga order.

## v3 — kasus negatif (aturan penolakan)

Setiap penolakan adalah `DomainError` berbahasa Indonesia dan **tidak mengubah data apa pun**
(operasi berjalan di salinan; diuji di `src/domain/negative.test.ts`).

| Area | Ditolak |
|---|---|
| Angka | NaN/Infinity/negatif untuk qty, harga, tarif, overhead, deposit, diskon, pembayaran, ukuran P×L×T |
| Master | kode ganda, resep yang memuat dirinya sendiri atau **melingkar** lewat komponen, ganti satuan saat masih ada stok |
| Arsip | item yang diarsipkan tidak bisa dipakai di dokumen **baru** (dokumen lama yang sudah memuatnya tetap bisa diubah) |
| Relasi | pelanggan sebagai pemasok dan sebaliknya; relasi yang tidak ada |
| Tanggal | tanggal kosong; jatuh tempo / target kirim / selesai sewa sebelum tanggal dokumen |
| Pengaturan | tarif bukan angka, umur sisa < 1 hari, lokasi kosong/ganda (dibersihkan), menghapus lokasi yang masih ada stok |
| Gudang | lokasi tak dikenal; opname, pindah, atau buang unit yang sedang **disewa** |
| Produksi | hasil yang bukan produk/komponen; hasil bertahap melebihi rencana; membatalkan induk saat perintah komponen masih terbuka; aksi apa pun pada pekerjaan yang sudah ditutup |
| Penjualan | konfirmasi tanpa pelanggan; mengubah total di bawah yang sudah dibayar; ganti mata uang setelah ada pembayaran |
| Sewa | mengubah booking di bawah yang sudah dibayar; kembali sebelum serah; serah ganda |
| Cadangan | file dengan id ganda, rujukan ke item/lot yang tidak ada, qty bukan angka, record tanpa nama — ditolak utuh dengan pesan "rusak" |
