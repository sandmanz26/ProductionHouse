# Peta proses, resep, dan gabung

## Peta proses — empat sudut pandang, satu bahasa gambar

Semua peta memakai diagram yang sama: kolom simpul dihubungkan aliran yang **lebarnya rupiah**.
Ukurannya rupiah, bukan qty, karena aliran dari kayu (m³) menjadi kursi (pcs) hanya bisa
dijumlahkan dalam uang. Warna menunjukkan isi aliran:

| Warna | Arti |
|---|---|
| Jati (cokelat) | Bahan |
| Biru | Produk (termasuk yang terjual) |
| Hijau | Sisa material — potongan yang kembali ke gudang dengan harganya |
| Ungu | Tenaga kerja & overhead |
| Abu-abu | Proses, stok, dalam proses |
| Abu-abu bergaris | Limbah & rugi |

Palet divalidasi untuk buta warna (protan/deutan/tritan) dan kontras di mode terang maupun
gelap. Setiap peta punya **tampilan tabel** (tombol "Tabel"), tooltip saat diarahkan, dan simpul
yang bisa diklik untuk membuka datanya. Aliran bergaris putus-putus adalah perkiraan (harga standar).

| Peta | Di mana | Isinya |
|---|---|---|
| **Peta proses pekerjaan** | Detail perintah kerja | Bahan per lot (sisa terpisah) + tenaga kerja → pekerjaan → hasil, sisa, kembali utuh, limbah dijual, rugi bongkar → **nasib hasilnya** (terjual ke siapa, disewa, di gudang, diolah lagi). Rencana tanpa bahan diambil digambar pada harga standar. |
| **Peta resep** | Detail & form resep, form perintah kerja | Bahan + jam kerja per batch → resep → hasil + perkiraan sisa, pada harga standar. Bisa dikalikan batch. |
| **Telusur lot** | Klik kode lot di halaman stok | Dua langkah ke belakang (pembelian/pekerjaan → bahan-bahannya) dan dua langkah ke depan (pekerjaan → produk → penjualan). Lot hasil pecah atau gabung ditelusuri ke induknya. Jejak ini yang dibutuhkan untuk SVLK dan uji tuntas EUDR. |
| **Peta alur** | Menu Analisa → Peta alur | Seluruh bengkel per periode: pembelian, saldo awal, sisa & olahan → gudang bahan → produksi (+ tenaga kerja) → produk jadi, sisa, limbah, dalam proses → **nasib produk yang dibuat pada periode itu**, ditelusuri lot demi lot. |

Setiap peta **menjaga nilai**: yang masuk ke simpul proses sama dengan yang keluar (diuji di
`src/domain/process.test.ts`). Selisih produksi muncul terang-terangan sebagai "Dalam proses".

## Resep proses

BOM menjawab satu pertanyaan: *produk ini butuh bahan apa?* Resep menjawab yang lebih luas:

- **Banyak hasil**: satu papan → daun meja + kaki + potongan laci, dengan porsi biaya tetap (%)
  atau dibagi menurut nilai jual.
- **Banyak cara** membuat barang yang sama (mis. kursi dari jati baru vs dari kayu bongkaran).
- **Semua jenis proses**: produksi, konversi, gabung, dekonstruksi.
- **Batch**: jumlah ditulis per batch; perintah kerja mengalikannya (bahan, hasil, jam kerja).
- **Perkiraan sisa & limbah**: sisa layak (% nilai bahan) dikreditkan pada biaya standar.
  Limbah (% qty) dipakai untuk perencanaan.
- **Tahapan & catatan** untuk tukang ikut ke perintah kerja.

Perintah kerja dari resep memakai bahan resep, **bukan** BOM produk, supaya tidak dihitung dua
kali. Porsi biaya tetap dari resep terbawa ke form penyelesaian. Material yang dihasilkan resep
(produksi/konversi/gabung) dianggap bisa diproduksi. "Produksi komponen" lalu membuat perintah
kerja dari resepnya dalam batch utuh (butuh 3 panel, 2 per batch → 2 batch). Resep dekonstruksi
tidak membuat bahan dianggap bisa diproduksi: kayu bongkaran adalah hasil sampingan, bukan
sesuatu yang direncanakan.

**Riwayat pemakaian** membandingkan setiap pekerjaan selesai dengan resepnya: hasil vs rencana,
pemakaian bahan vs standar (100% = sesuai resep), sisa yang kembali, dan HPP aktual vs standar.
Inilah tanda kapan resep perlu diperbarui.

Resep yang sudah dipakai tidak bisa dihapus, hanya diarsipkan, agar riwayatnya tetap terbaca.

## Gabung

### Perintah kerja jenis Gabung
Beberapa barang dari stok menjadi **satu jenis** barang:
- **Set**: 1 meja + 6 kursi + kardus → 1 Set Makan. HPP set = HPP lot meja & kursi yang diambil
  + tenaga kerja.
- **Panel dari potongan**: potongan sisa jati + lem → panel sambung (*finger-joint*). Sisa
  material dipakai lebih dulu, jadi potongan kecil berubah menjadi barang bernilai.

Aturan: tepat satu jenis hasil; minimal dua jenis barang atau dua unit; barang hasil tidak boleh
menjadi bahannya sendiri. Hasil gabung tidak harus berupa produk (panel adalah material).

### Gabung lot (gudang)
Di halaman stok barang → **Gabung lot**: satukan beberapa lot barang yang sama, mis. potongan sisa
seukuran yang diikat jadi satu. Hasilnya:
- qty dijumlah, harga pokok **rata-rata tertimbang** (nilai tidak berubah);
- tanggal masuk = lot **tertua**, jadi tetap di depan antrean FIFO;
- `mergedFrom` menyimpan lot asal untuk penelusuran; setiap lot asal mendapat mutasi "Gabung lot".

Ditolak: barang berbeda, sisa dicampur stok biasa, cadangan pekerjaan yang berbeda, lot yang
sedang disewa/rusak, lokasi yang tidak dikenal, atau kurang dari dua lot.
