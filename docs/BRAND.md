# Serat — identitas merek

**Serat** = serat kayu (*wood grain*). Arah serat menentukan di mana kayu boleh dipotong; buku
kerja ini menentukan ke mana setiap potongan — dan harganya — pergi.

## Janji

> **Setiap potongan punya harga.**

Satu kalimat yang hanya benar untuk produk ini: sisa material punya lot, ukuran, dan harga pokok
sendiri; HPP terkunci saat pekerjaan ditutup. Kalimat ini dipakai di layar sambutan, metadata,
dan kaki sidebar — tidak di tempat lain, supaya tidak jadi slogan kosong.

*Descriptor*: **Buku kerja produksi untuk bengkel mebel.** Kami menyebut diri "buku kerja", bukan
"platform" atau "solusi". Pengguna kami pemilik bengkel, kepala produksi, dan admin gudang di
Jepara, Klaten, Cirebon, Pasuruan — bukan pembeli perangkat lunak.

## Tanda (logo)

Sambungan **ekor burung** (*dovetail*) dilihat dari muka: dua papan yang hanya mengunci karena
setiap potongannya diukur. Papan atas penuh warna jati, papan bawah 38% — agar sambungan tetap
terbaca di 16 px. Hanya garis lurus: bertahan di favicon, cetak hitam-putih, dan stempel.

- Kode: `src/brand/Logo.tsx` (`LogoMark`, `Wordmark`), favicon `public/favicon.svg`.
- Wordmark selalu huruf kecil: **serat**, IBM Plex Serif 600, tracking −2%.
- Jarak aman = lebar satu ekor (¼ tinggi tanda). Jangan diberi bayangan, gradasi, atau garis luar.

## Perangkat dekoratif

**Cincin tahun** (*end grain*) — elips sedikit eksentrik, karena cincin pohon asli tidak pernah
konsentris. Dipakai hanya di dua tempat: panel sambutan dan halaman buntu (404/galat). Tidak pernah
di belakang data.

## Warna

| Nama | Peran | Nilai |
|---|---|---|
| **Jati** | aksen, tindakan utama, tanda | `oklch(0.5 0.115 50)` (gelap: `oklch(0.74 0.11 62)`) |
| **Arang** | tinta, panel sambutan, favicon | `oklch(0.2 0.008 60)` |
| **Kertas** | latar | `oklch(0.972 0.005 85)` |
| **Serbuk** | sorotan di atas arang | `oklch(0.83 0.06 78)` |

Merah/kuning/hijau hanya untuk status (telat, perlu perhatian, lengkap) — tidak pernah dekorasi.

## Tipografi

- **IBM Plex Serif** — judul halaman dan wordmark. Suara "buku".
- **IBM Plex Sans** — semua yang dikerjakan: form, tabel, tombol.
- **IBM Plex Mono** — angka yang dibandingkan: kode dokumen, qty, uang. Angka tabular.

Satu keluarga, tiga suara: rapi seperti gambar kerja, tidak seperti dasbor pemasaran.

## Suara

- Bahasa Indonesia sehari-hari bengkel: *ambil bahan*, *sisa*, *bongkar*, *serah unit*, *lewat tempo*.
- Kalimat pendek yang menyebut angka dan dokumennya: "SW-0001 terlambat 2 hari", bukan "Ada
  keterlambatan pada transaksi sewa".
- Pesan galat menjelaskan **apa yang harus dilakukan**: "Lokasi Showroom masih ada stok —
  pindahkan stoknya dulu."
- Keadaan kosong menjelaskan dari mana datanya akan datang, bukan sekadar "Belum ada data".
- Tidak ada emoji, tanda seru, "✨ AI", atau kata *seamless/powerful/revolusioner*.

## Yang sengaja tidak dipakai

Gradasi ungu-biru, kartu kaca (*glassmorphism*), ikon di dalam lingkaran berwarna, sudut membulat
besar, bayangan lembut di mana-mana, ilustrasi 3D. Garis tipis (*hairline*) menggantikan bayangan;
radius 4 px.
