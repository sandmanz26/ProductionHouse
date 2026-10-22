# Metode biaya persediaan

Serat mendukung empat metode. Metode perusahaan diatur di **Pengaturan → Metode biaya
persediaan**, dan bisa ditimpa per barang di **Data master → Metode biaya**.

| Metode | Cara kerja di Serat | PSAK 14 | UU PPh |
|---|---|:-:|:-:|
| **FIFO** (default) | Lot biasa keluar dari yang **terlama**. Sistem menolak pengambilan lot yang lebih baru selama lot lama masih ada. | ✓ | ✓ |
| **Rata-rata bergerak** | Semua lot biasa satu barang memakai **harga rata-rata yang sama**, dihitung ulang setiap ada barang masuk. Lot mana pun yang diambil, harganya sama. | ✓ | ✓ |
| **Identifikasi khusus** | Harga lot yang benar-benar diambil. Pengguna bebas memilih lot. | ✓ | — ¹ |
| **LIFO** | Lot biasa keluar dari yang **terbaru**. Ditandai "bukan PSAK" di semua layar. | ✗ | ✗ |

¹ UU PPh hanya menyebut rata-rata dan FIFO. Identifikasi khusus sah secara akuntansi untuk
barang yang tidak dapat saling menggantikan, tetapi untuk SPT sebaiknya dikonsultasikan.

## Yang selalu memakai harganya sendiri (identifikasi khusus)

PSAK 14 / IAS 2 mewajibkan identifikasi khusus untuk barang yang **tidak dapat saling
menggantikan** dan barang yang **dipisahkan untuk proyek tertentu**. Karena itu, apa pun
metodenya:

- **Sisa material**: potongan unik dengan ukuran sendiri. Tetap disarankan lebih dulu (janji
  "setiap potongan punya harga" tidak berubah).
- **Barang yang dibeli untuk satu perintah kerja**: tetap milik pekerjaan itu sampai cadangannya
  dilepas.
- **Unit yang direncanakan** (kursi yang diperbaiki atau dibongkar) dan **unit rusak**.

## Rincian perilaku

- **Urutan lapisan**: tanggal masuk lot, lalu nomor lot. Lot yang dipecah (pindah lokasi, serah sewa)
  mewarisi tanggal induknya, jadi tetap di posisi lapisan yang sama.
- **FIFO/LIFO**: urutan berlaku untuk seluruh perusahaan, bukan per lokasi. Dialog ambil bahan
  menandai lot "Keluar berikutnya" beserta lokasinya. Pilihan lot yang urutannya terbalik tetapi
  kombinasinya sah (mis. habiskan lot lama + sebagian lot baru) diurutkan ulang otomatis.
- **Rata-rata bergerak**: setiap perubahan harga lot dicatat sebagai mutasi `revaluasi` (qty 0,
  referensi "Rata-rata"), sehingga kartu stok tetap bisa diaudit. Total nilai tidak berubah.
- **Pengembalian bahan** (batal ambil, kembali utuh): masuk kembali dengan harga saat keluar. Bila
  harga lot sudah berubah (rata-rata), keduanya dicampur supaya tidak ada nilai yang muncul atau hilang.
- **Hasil bertahap**: saat pekerjaan ditutup, lot hasil bertahap disesuaikan sebesar **selisih**
  (HPP aktual − HPP sementara), bukan ditimpa. Lot yang sudah tercampur rata-rata tetap benar.
- **Ganti metode**: berlaku untuk barang yang keluar berikutnya; nilai yang sudah tercatat tidak
  diubah, kecuali beralih ke rata-rata (stok yang ada langsung dirata-ratakan). Setiap perubahan
  tercatat di riwayat (tanggal, dari, ke, barang). UU PPh mensyaratkan metode dipakai konsisten,
  dan perubahan untuk pajak perlu persetujuan DJP.

## Laporan HPP → Metode biaya

Kartu stok tiap barang diputar ulang dengan FIFO, rata-rata, dan LIFO. Untuk tiap metode,
laporan menunjukkan biaya barang keluar, nilai stok akhir, dan selisihnya terhadap buku. Barang
diurutkan dari rentang terbesar, yaitu yang paling sensitif terhadap pilihan metode.

Batasan simulasi: harga masuk dipakai sebagaimana tercatat. Dampak lanjutan ke HPP produk yang
dibuat dari bahan tersebut tidak dihitung ulang.

## Sumber

- IAI, PSAK 14 *Persediaan* (revisi 2008, berlaku 1 Januari 2009): LIFO tidak lagi diperkenankan.
  Ringkasan sekunder (bukan teks resmi IAI — rujuk standar aslinya untuk kutipan):
  [Jurnal Aplikasi Akuntansi, Universitas Mataram](https://jaa.unram.ac.id/index.php/jaa/article/download/103/68),
  [Jurnal.id](https://www.jurnal.id/id/blog/2018-perbedaan-metode-persediaan-fifo-lifo-dan-average).
- UU PPh Pasal 10 ayat (6): hanya rata-rata dan FIFO —
  [DDTCNews: mengapa LIFO tidak lagi dipakai](https://news.ddtc.co.id/berita/nasional/1805509/mengapa-pencatatan-persediaan-metode-lifo-tidak-lagi-dipakai),
  [DDTCNews: metode FIFO](https://news.ddtc.co.id/literasi/kamus/43616/terkait-dengan-pajak-penghasilan-apa-itu-metode-fifo),
  [Ortax: HPP dalam PPh Badan](https://ortax.org/mengenal-konsep-biaya-harga-pokok-penjualan-dalam-pph-badan),
  [DDTCNews: perubahan metode pembukuan](https://news.ddtc.co.id/review/konsultasi/6845/perubahan-metode-pembukuan).
- IAS 2: identifikasi khusus untuk barang yang tidak dapat saling menggantikan, FIFO/rata-rata
  untuk lainnya, LIFO dilarang —
  [KPMG](https://kpmg.com/us/en/articles/2026/inventory-accounting-ifrs-accounting-standards-vs-us-gaap.html),
  [Deloitte DART](https://dart.deloitte.com/USDART/home/publications/deloitte/additional-deloitte-guidance/roadmap-ifrs-us-gaap-comparison/chapter-1-assets/1-4-inventories),
  [BDO NZ IAS 2](https://www.bdo.nz/getmedia/6242451a-01c0-43ea-bb99-feeb85b19083/2025-NZ-IAS-2.pdf).
