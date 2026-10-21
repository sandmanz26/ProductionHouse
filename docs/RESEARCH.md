# Riset Lapangan — ERP Production House Furnitur

> Disusun sebagai *discovery* sebelum desain. Tujuannya memahami perilaku pengguna,
> kondisi lantai produksi, dan masalah nyata yang harus diselesaikan sistem — bukan
> sekadar daftar fitur.

## 1. Ringkasan temuan

| # | Temuan | Dampak ke desain |
|---|--------|------------------|
| 1 | Pencatatan stok di banyak UMKM mebel (contoh studi kasus di Jepara) masih memakai **kartu stok kertas lalu disalin ke Excel**, sehingga arsip tidak rapi dan rawan salah catat. | Input harus secepat menulis di kartu stok: sedikit field, nilai default cerdas, bisa dari HP/tablet. |
| 2 | Pesanan tidak menentu → **kekurangan atau kelebihan bahan baku** (kasus kekurangan kayu jati yang membuat produksi terlambat). | Cek kebutuhan bahan (MRP sederhana) otomatis saat membuat perintah kerja, plus draf pembelian sekali klik untuk kekurangan. |
| 3 | Material furnitur **sulit dikuantifikasi** (kayu dengan cacat, kain per meter, cairan finishing per liter). | Satuan per material bebas (m³, lembar, m, liter, kg, pcs) dan pencatatan per *lot* dengan harga sendiri. |
| 4 | **Kurang dari 2% produsen furnitur mencatat detail sisa (remnant)**; operator memutuskan sendiri memakai sisa atau tidak, tanpa pedoman. Sisa dibuang karena tidak ada yang tahu ukurannya. | Sisa material menjadi *warga kelas satu*: punya lot, ukuran (P×L×T), nilai, umur, dan **diprioritaskan otomatis** saat pengambilan bahan berikutnya. |
| 5 | 4 × 0,25 lembar sisa ≠ 1 lembar utuh. Perencanaan berbasis luas bisa menyesatkan bila tidak ada potongan yang cukup besar. | Sisa disimpan sebagai lot terpisah (bukan dilebur ke stok utuh), lengkap dengan dimensi; ada ambang minimum sisa yang layak pakai per material. |
| 6 | Limbah industri mebel sangat besar (laporan di Jepara menyebut limbah serbuk hingga ±58%; sawmill 20–48%). Sebagian limbah masih bernilai (serbuk, potongan untuk papan laminasi). | Tiga kategori pengembalian: **utuh**, **sisa layak pakai**, **limbah** (bisa punya nilai jual → mengurangi HPP). Laporan rendemen/yield per perintah kerja. |
| 7 | HPP UMKM mebel dipengaruhi kuat oleh biaya bahan; perhitungan HPP sering mengabaikan tenaga kerja & overhead atau tidak memperhitungkan sisa. | HPP = bahan neto (diambil − kredit sisa) + tenaga kerja + overhead + biaya lain. Transparan, bisa ditelusuri ke lot. |
| 8 | Biaya bersama (*joint cost*) pada proses yang menghasilkan beberapa output paling wajar dialokasikan dengan **metode nilai jual relatif**; *by-product*/scrap dikurangi dari biaya bersama sebesar nilai realisasinya. Alokasi harus mudah dihitung & dapat dipertanggungjawabkan, bukan presisi semu. | Mesin alokasi: bobot = qty × harga jual (produk) atau nilai pengganti (material). Dekonstruksi memakai prinsip *lower of cost or NRV*: kelebihan biaya dicatat sebagai rugi, bukan menggelembungkan nilai bahan bekas. |
| 9 | Ekspor kayu olahan dari Indonesia wajib **SVLK / Dokumen V-Legal**. **EUDR** (Regulasi Uni Eropa 2025/2650) berlaku **30 Des 2026** untuk perusahaan besar/menengah dan **30 Jun 2027** untuk mikro/kecil — membutuhkan nomor referensi *Due Diligence Statement*. Asosiasi (HIMKI) mengeluhkan beban ganda SVLK + EUDR. | Order ekspor menyimpan No. V-Legal & referensi DDS EUDR, dan sistem **memperingatkan** bila tujuan EU tetapi dokumen belum lengkap. |
| 10 | Packing list furnitur dicatat per karton/peti: deskripsi, kode produk, jumlah, berat kotor/bersih, dimensi, CBM, *shipping mark*. Furnitur *knock-down* sering terpecah ke beberapa karton. | Produk menyimpan data kemasan (dimensi, berat, jumlah karton/unit). Packing list & proforma invoice tercetak otomatis + estimasi isi kontainer (20GP/40GP/40HC). |
| 11 | Bisnis sewa furnitur kesulitan di **dokumentasi kerusakan**, penetapan tanggung jawab, denda keterlambatan otomatis, dan **double booking**. | Cek ketersediaan berdasarkan rentang tanggal, pengembalian per unit dengan kondisi (baik/rusak/hilang) + biaya, denda telat otomatis, unit rusak langsung bisa dijadikan perintah perbaikan. |
| 12 | Kegagalan adopsi software pabrik: sistem dibuat untuk enterprise besar, pekerja lantai produksi diabaikan, usability buruk memicu *workaround* — staf yang sudah dilatih tetap mencatat di kertas. | Prinsip "tidak ribet": bahasa Indonesia sehari-hari, alur berbasis tugas (bukan modul akuntansi), maksimal satu layar per tugas, responsif untuk tablet/HP. |

## 2. Persona

**Pak Darto — Kepala Produksi (lantai workshop).**
Mengatur tukang, mengambil bahan dari gudang, memutuskan potongan mana yang dipakai.
Pakai HP Android. *Butuh:* tahu bahan cukup atau tidak, tahu ada sisa apa, mencatat pemakaian dalam hitungan detik.
*Frustrasi:* harus menulis ulang hal yang sama di kertas & laptop; tidak tahu sisa plywood minggu lalu ada di mana.

**Bu Sinta — Admin Gudang & Pembelian.**
Menerima barang dari supplier, mencatat ongkir, menyusun PO. *Butuh:* daftar kekurangan yang sudah jadi, harga beli + ongkir otomatis terbagi ke barang.
*Frustrasi:* pembelian untuk satu proyek sisa banyak, lalu "hilang" dari catatan dan dibeli lagi.

**Mas Raka — Sales & Ekspor.**
Mengurus buyer luar negeri, proforma, packing list, kontainer, dokumen V-Legal. *Butuh:* dokumen keluar cepat dan benar, tahu berapa CBM yang masih muat.

**Mbak Lia — Koordinator Sewa/Pinjam (event, film, pemotretan).**
*Butuh:* tahu unit mana yang tersedia di tanggal tertentu, kapan unit kembali, siapa yang merusak.

**Pak Hendra — Pemilik.**
*Butuh:* HPP sebenarnya per produk, margin, nilai stok & nilai sisa material, peringatan dini.

## 3. Masalah inti yang diselesaikan

1. **Transformasi barang** — bahan mentah → produk baru; produk → produk berbeda (konversi);
   produk → bahan (dekonstruksi); produk rusak → layak (perbaikan). Semua lewat **satu konsep:
   Perintah Kerja** dengan input (lot apa pun) dan output (item apa pun).
2. **Sisa material** dari setiap proses kembali ke stok sebagai lot bernilai, diprioritaskan
   untuk dipakai lebih dulu, dan mengurangi HPP proses yang menghasilkannya.
3. **Sisa pembelian** — pembelian khusus untuk satu proyek dicadangkan untuk proyek itu; begitu
   proyek selesai, sisanya otomatis dibebaskan untuk produksi berikutnya dengan harga beli aslinya.
   HPP hanya menanggung yang benar-benar terpakai.
4. **Tiga jalur keluar barang** — supply domestik, ekspor, dan sewa/pinjam (barang kembali).

## 4. Prinsip desain

1. **Satu tugas, satu layar.** Pengguna berpikir "ambil bahan", "selesaikan produksi", bukan "jurnal persediaan".
2. **Sistem yang menyarankan, manusia yang memutuskan.** Lot dipilih otomatis (cadangan → sisa → FIFO), bisa diubah.
3. **Angka bisa ditelusuri.** Setiap rupiah HPP bisa diklik sampai ke lot dan pembelian asalnya.
4. **Peringatan, bukan blokir.** Sistem mengingatkan (stok kurang, dokumen ekspor belum lengkap, sewa terlambat) tanpa menghentikan pekerjaan — kecuali untuk hal yang merusak data (stok minus, pengembalian melebihi pengambilan).
5. **Offline-first.** Tanpa backend: data tersimpan di perangkat, dengan ekspor/impor cadangan JSON.

## 5. Sumber

- Pencatatan kartu stok manual — Dampit Outdoor Jepara Furniture: https://eprints.umk.ac.id/17455/2/BAB%20I.pdf
- Kekurangan kayu jati akibat pesanan tidak menentu — WT Furniture Jepara: https://eprints.umk.ac.id/23028/2/Bab%201%20TA.pdf
- HPP & efisiensi pemotongan di sentra mebel: https://journal.uii.ac.id/JATTEC/article/download/36830/17520/126955
- Pengaruh biaya bahan baku terhadap keuntungan UMKM kayu Jepara: https://www.jurnal.politeknik-kebumen.ac.id/E-Bis/article/download/2376/1320/
- Perencanaan kebutuhan bahan baku: https://journal.unisnu.ac.id/jra/article/download/jra.v2i2.249/149
- Remnant plywood (< 2% produsen mencatat sisa): https://www.woodworkingnetwork.com/red-book/best-practices-guide/converting-plywood-remnants-throughput
- Remnant ≠ unit utuh (forum Acumatica): https://community.acumatica.com/distribution-6/inventory-pieces-remnants-any-ideas-on-best-way-to-deal-with-this-8194
- Tantangan material sulit dikuantifikasi: https://ventor.tech/industries/manufacturing/odoo-for-furniture-kitchen-and-bathrooms-manufacturing/
- Limbah sawmill: https://ppjp.ulm.ac.id/journals/index.php/jss/article/view/9221
- Limbah serbuk industri mebel Jepara: https://abdimasku.lppm.dinus.ac.id/index.php/jurnalabdimasku/article/download/91/70
- By-product & joint costing: https://www.accountingtools.com/articles/2017/5/14/by-product-costing-and-joint-product-costing
- Joint products (ACCA): https://opentuition.com/acca/ma/notes/ma-13-process-costing-joint-products/
- EUDR & SVLK beban ganda: https://indonesiabusinesspost.com/1356/business-and-investment/eudr-and-svlk-overlapping-regulations-strain-indonesian-furniture-exports
- Penundaan EUDR (Reg. 2025/2650) ke 30 Des 2026 / 30 Jun 2027: https://wikifarmer.com/library/en/article/eudr-deforestation-regulation-december-2026
- Packing list furnitur: https://arcedior.com/blog/export-packing-list-for-furniture-example
- HS 9403: https://ximpex.in/hs-codes/9403
- Masalah sewa furnitur (kerusakan, telat, double booking): https://gitnux.org/best/furniture-rental-software/ , https://apps.odoo.com/apps/modules/18.0/rental_product_damage_tracker
- Adopsi software di lantai produksi: https://sapinsider.org/?p=86801 , https://www.manufacturing.net/operations/article/13240874/technology-on-the-shop-floor-empowering-your-manufacturing-team

> Catatan: sebagian sumber adalah studi kasus, skripsi, atau materi vendor; angka-angka
> dipakai sebagai arah desain, bukan statistik pasti. Tanggal EUDR perlu diverifikasi ulang
> terhadap sumber resmi UE sebelum dipakai untuk keputusan kepatuhan.
