/**
 * Product identity. Everything user-facing that names the product reads from here, so a rename
 * is a one-line change. The tenant's own company name lives in Settings, not here.
 */
export const BRAND = {
  name: "Serat",
  version: "3.3",
  /** The promise, used on the welcome screen and in metadata. */
  line: "Setiap potongan punya harga.",
  descriptor: "Buku kerja produksi untuk bengkel mebel",
  pitch:
    "Bahan diambil per lot, sisa kembali ke gudang dengan harganya sendiri, dan HPP terkunci saat pekerjaan ditutup — dari kayu gelondong sampai kontainer ekspor.",
} as const;
