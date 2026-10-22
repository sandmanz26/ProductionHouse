# Roast v1 → Rencana v2

Kritik jujur terhadap versi pertama MebelOS, ditulis sebelum perbaikan. Tujuannya bukan membela
apa yang sudah ada, tapi menemukan di mana sistem akan gagal di lantai produksi sungguhan.

## 1. UI — di mana terasa "AI slop"

| Gejala di v1 | Kenapa buruk | Perbaikan v2 |
|---|---|---|
| Sapaan "Selamat malam 👋" | Emoji dekoratif adalah tanda paling umum UI hasil AI; tidak membawa informasi | Header berisi tanggal & shift, tanpa emoji |
| Deretan kartu statistik dengan ikon di kotak pastel | Pola "tiga/empat kartu + ikon kecil" identik di ribuan dashboard generik | Satu *metric strip* bergaris tipis, angka monospace, tanpa ikon hiasan |
| Semua permukaan `rounded-3xl` + bayangan | Radius seragam di semua elemen = tidak ada hierarki | Radius kecil (6px), border 1px, tanpa bayangan; kartu hanya untuk pengelompokan |
| Subjudul panjang di setiap halaman | Menjelaskan hal yang sudah jelas; mendorong konten ke bawah | Satu baris pendek atau tidak ada |
| Chip berwarna berpasangan (jenis + status) di mana-mana | Warna kehilangan arti karena dipakai untuk semuanya | Warna hanya untuk status yang butuh tindakan; jenis ditulis biasa |
| Tile "Pekerjaan cepat" | Duplikat tombol "Buat" | Dihapus; diganti papan WIP per tahap |
| Font default | Tidak punya karakter "alat kerja" | IBM Plex Sans + Plex Mono untuk kode & angka |
| Tabel lebar di HP harus digeser | Tukang & kepala produksi memakai HP — tabel geser = tidak dipakai | Di layar kecil baris tabel otomatis jadi kartu bertumpuk |
| Tidak ada pencarian global | Admin harus klik 3 menu untuk menemukan "PK-0012" | Command palette `Ctrl/⌘ K` |
| Progres "Bahan 0%" | Indikator yang menyesatkan lebih buruk dari tidak ada | Progres berdasarkan **tahap produksi** yang benar-benar dilalui |

## 2. Kemampuan — skenario lapangan yang gagal di v1

Disusun dari riset (lihat sumber di bawah) dan pola umum produksi mebel.

| # | Skenario nyata | v1 | v2 |
|---|---|---|---|
| S1 | Rangka kursi dibuat dulu (komponen setengah jadi), baru dirakit dengan jok | ✗ output produksi harus produk | ✓ komponen = material dengan BOM; MRP multi-level menyarankan perintah kerja komponen |
| S2 | Kayu basah dikeringkan (KD) dan menyusut; papan dibelah jadi komponen | ✗ tidak ada olah bahan | ✓ produksi bahan → bahan, susut tercatat sebagai limbah dengan rendemen |
| S3 | Pekerjaan melewati potong → rakit → amplas → finishing → jok → QC → packing | ✗ hanya status rencana/berjalan | ✓ tahapan per perintah kerja, papan WIP per tahap |
| S4 | Tukang dibayar **borongan per unit**, finishing di-*maklon* ke luar | ✗ hanya jam × tarif | ✓ catatan kerja per tahap: jam × tarif **atau** unit × tarif borongan; biaya subkon per tahap |
| S5 | 24 kursi: 12 selesai dikirim duluan, sisanya minggu depan | ✗ harus selesai semua | ✓ **terima hasil sebagian** dengan HPP sementara; saat ditutup, lot direvaluasi ke HPP aktual dan selisih atas barang yang sudah terjual dicatat sebagai **selisih HPP** |
| S6 | QC menolak 2 unit (finishing terlalu glossy) → rework | ✗ | ✓ hasil *reject* masuk sebagai unit rusak → perintah perbaikan; tingkat reject dilaporkan |
| S7 | Beli kayu per batang dengan ukuran (kubikasi), kain per roll 50 m | ✗ harus hitung manual | ✓ kalkulator kubikasi (T×L×P) & satuan beli dengan konversi |
| S8 | Buyer bayar DP 30%, pelunasan sebelum kapal berangkat; supplier ditagih tempo | ✗ tidak ada pembayaran | ✓ pembayaran per order/sewa/pembelian, piutang & utang dengan umur, peringatan "kirim tapi belum lunas" |
| S9 | Pesanan custom: ukuran 200 cm, finishing walnut | ✗ | ✓ spesifikasi per baris order, ikut ke perintah kerja |
| S10 | Jual serbuk/potongan sisa, jual unit bekas sewa | ✗ penjualan hanya produk | ✓ penjualan boleh material (sisa/limbah bernilai) |
| S11 | Pelanggan mengembalikan barang (cacat/batal) | ✗ | ✓ **retur penjualan** dengan kondisi baik/rusak, kembali ke stok dengan HPP asal |
| S12 | Pindah 2 lembar plywood dari gudang ke workshop | ✗ hanya ubah lokasi seluruh lot | ✓ transfer sebagian lot antar lokasi |
| S13 | Sewa event: ongkos antar & setting; analisa unit paling laku/utilisasi | ✗ | ✓ biaya tambahan sewa, laporan utilisasi per produk |

## 3. Prinsip yang tetap dipegang

- Semua aturan bisnis ada di `src/domain` (TypeScript murni) dan dibuktikan dengan test skenario.
- Setiap aksi atomik: gagal = tidak ada data yang berubah.
- Jumlah mutasi setiap lot selalu sama dengan qty lot (diuji di setiap skenario).

## Sumber

- Tahapan produksi furnitur & tracking WIP: [Ksolves Odoo furniture](https://www.ksolves.com/industries/odoo-manufacturing/furniture), [Ecosire custom furniture](https://ecosire.com/industries/custom-furniture), [Viindoo furniture ERP](https://viindoo.com/page/furniture-erp-software)
- Spesifikasi ukuran custom mengubah BOM & biaya: [Ecosire custom furniture production](https://ecosire.com/apps/odoo/custom-furniture-production)
- Kubikasi kayu (T cm × L cm × P m / 10.000): [KapanLagi](https://www.kapanlagi.com/feeds/cara-menghitung-kubikasi-kayu-235da1514b.html)
- Susut pengeringan & rendemen kayu olahan ±50%: [ULM — penyusutan volumetris](https://ppjp.ulm.ac.id/journal/index.php/jht/article/view/1586), [UNISKA](https://ojs.uniska-bjm.ac.id/index.php/AIJP/article/view/2364/1814)
- DP 30% / pelunasan 70% sebelum kirim, inspeksi pra-pengapalan AQL: [Alibaba seller blog](https://seller.alibaba.com/blogs/2026/southeast-asia/apparel/lc-payment-quality-control-guide-alibaba-b2b), [QualityInspection.org](https://qualityinspection.org/10-inspection), [newbuyingagent](https://www.newbuyingagent.com/es/resources/buying-furniture-from-a-china-manufacturer-step-by-step-process-from-rfq-to-delivery)
- Penyebab rework (potong, bor, perakitan, finishing glossy ditolak): [UFPB case study](https://repositorio.ufpb.br/jspui/handle/123456789/36262), [Oracle WIP example](https://docs.oracle.com/cd/A60725_05/html/comnls/us/wip/nsdj.htm), [Auditing wood machining](https://qualityinspection.org/wood-furniture-process-china/)
- Sewa event: zona siap/cuci/rusak, utilisasi menentukan return: [Beancount event rental guide](https://beancount.io/blog/2026/08/18/event-rental-business-bookkeeping-rental-fleet-depreciation-deposits-inventory-loss-guide), [Events Partner](https://eventspartner.com.sg/why-furniture-upkeep-matters-in-event-rentals-and-why-you-can-trust-events-partner)
- Tanda-tanda UI "AI slop": [noqta.tn](https://noqta.tn/en/blog/ai-design-slop-overused-ui-patterns-fix-2026), [SuperDesign](https://www.superdesign.dev/blog/why-ai-design-looks-generic), [Spot the slop](https://world.hey.com/kostac/spot-the-slop-a-ui-designer-s-guide-to-fixing-ai-defaults-4c448c9c)
