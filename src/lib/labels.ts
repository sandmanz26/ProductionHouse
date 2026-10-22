import type {
  CostingMethod,
  LotOrigin,
  OutputGrade,
  PaymentMethod,
  StageStatus,
  LotStatus,
  MaterialCategory,
  MoveType,
  ProductCategory,
  PurchaseStatus,
  RentalStatus,
  ReturnCondition,
  ReturnKind,
  SalesChannel,
  SalesStatus,
  WorkOrderStatus,
  WorkOrderType,
} from "@/domain";

export type Tone = "default" | "accent" | "success" | "warning" | "danger";

export const WO_TYPE: Record<WorkOrderType, { label: string; short: string; description: string; tone: Tone }> = {
  produksi: {
    label: "Produksi Baru",
    short: "Produksi",
    description: "Bahan mentah → produk baru, sesuai BOM.",
    tone: "accent",
  },
  konversi: {
    label: "Konversi",
    short: "Konversi",
    description: "Produk yang ada diubah menjadi produk lain (mis. meja makan → meja kerja).",
    tone: "warning",
  },
  dekonstruksi: {
    label: "Dekonstruksi",
    short: "Bongkar",
    description: "Produk dibongkar menjadi bahan yang bisa dipakai lagi.",
    tone: "danger",
  },
  perbaikan: {
    label: "Perbaikan",
    short: "Perbaikan",
    description: "Unit rusak (mis. kembali dari sewa) diperbaiki agar layak lagi.",
    tone: "success",
  },
};

export const WO_STATUS: Record<WorkOrderStatus, { label: string; tone: Tone }> = {
  rencana: { label: "Rencana", tone: "default" },
  berjalan: { label: "Berjalan", tone: "accent" },
  selesai: { label: "Selesai", tone: "success" },
  batal: { label: "Batal", tone: "danger" },
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  draft: { label: "Menunggu barang", tone: "warning" },
  diterima: { label: "Diterima", tone: "success" },
  batal: { label: "Batal", tone: "danger" },
};

export const SALES_STATUS: Record<SalesStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "default" },
  dikonfirmasi: { label: "Dikonfirmasi", tone: "accent" },
  dikirim_sebagian: { label: "Dikirim sebagian", tone: "warning" },
  dikirim: { label: "Terkirim", tone: "success" },
  selesai: { label: "Selesai", tone: "success" },
  batal: { label: "Batal", tone: "danger" },
};

export const SALES_CHANNEL: Record<SalesChannel, string> = { supply: "Supply", ekspor: "Ekspor" };

export const RENTAL_STATUS: Record<RentalStatus, { label: string; tone: Tone }> = {
  dipesan: { label: "Dipesan", tone: "default" },
  berjalan: { label: "Di klien", tone: "accent" },
  selesai: { label: "Selesai", tone: "success" },
  batal: { label: "Batal", tone: "danger" },
};

export const LOT_STATUS: Record<LotStatus, { label: string; tone: Tone }> = {
  tersedia: { label: "Tersedia", tone: "success" },
  disewa: { label: "Disewa", tone: "accent" },
  rusak: { label: "Rusak", tone: "danger" },
};

export const LOT_ORIGIN: Record<LotOrigin, string> = {
  saldo_awal: "Saldo awal",
  pembelian: "Pembelian",
  produksi: "Produksi",
  sisa_produksi: "Sisa produksi",
  dekonstruksi: "Hasil bongkar",
  retur_sewa: "Retur sewa",
  retur_penjualan: "Retur penjualan",
  penyesuaian: "Penyesuaian",
};

export const RETURN_KIND: Record<ReturnKind, { label: string; description: string; tone: Tone }> = {
  utuh: { label: "Utuh", description: "Tidak terpakai, kembali ke lot asal", tone: "default" },
  sisa: { label: "Sisa layak pakai", description: "Potongan yang masih bisa dipakai — jadi lot sisa", tone: "success" },
  limbah: { label: "Limbah", description: "Terbuang; isi nilai jika dijual (mis. serbuk)", tone: "warning" },
};

export const RETURN_CONDITION: Record<ReturnCondition, { label: string; tone: Tone }> = {
  baik: { label: "Baik", tone: "success" },
  rusak: { label: "Rusak", tone: "warning" },
  hilang: { label: "Hilang", tone: "danger" },
};

export const MOVE_TYPE: Record<MoveType, string> = {
  saldo_awal: "Saldo awal",
  masuk_pembelian: "Masuk · pembelian",
  keluar_produksi: "Keluar · produksi",
  kembali_produksi: "Kembali · produksi",
  masuk_produksi: "Masuk · hasil produksi",
  masuk_sisa: "Masuk · sisa material",
  keluar_penjualan: "Keluar · penjualan",
  keluar_sewa: "Sewa · diserahkan",
  kembali_sewa: "Sewa · kembali",
  rusak_sewa: "Sewa · kembali rusak",
  hilang: "Hilang",
  penyesuaian: "Penyesuaian",
  limbah: "Limbah",
  transfer: "Pindah lokasi",
  retur_penjualan: "Masuk · retur penjualan",
  revaluasi: "Revaluasi HPP",
};

export const MATERIAL_CATEGORY: Record<MaterialCategory, string> = {
  kayu_solid: "Kayu solid",
  panel: "Panel (plywood/MDF)",
  kain: "Kain",
  busa: "Busa",
  hardware: "Hardware",
  finishing: "Finishing",
  logam: "Logam",
  rotan: "Rotan",
  kemasan: "Kemasan",
  lainnya: "Lainnya",
};

export const PRODUCT_CATEGORY: Record<ProductCategory, string> = {
  kursi: "Kursi",
  meja: "Meja",
  lemari: "Lemari",
  sofa: "Sofa",
  tempat_tidur: "Tempat tidur",
  dekorasi: "Dekorasi",
  set: "Set",
  lainnya: "Lainnya",
};

export const categoryLabel = (c: string) =>
  (MATERIAL_CATEGORY as Record<string, string>)[c] ?? (PRODUCT_CATEGORY as Record<string, string>)[c] ?? c;

export const STAGE_STATUS: Record<StageStatus, { label: string; tone: Tone }> = {
  menunggu: { label: "Menunggu", tone: "default" },
  proses: { label: "Dikerjakan", tone: "accent" },
  selesai: { label: "Selesai", tone: "success" },
};

export const OUTPUT_GRADE: Record<OutputGrade, string> = { baik: "Lolos QC", reject: "Reject QC" };

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  transfer: "Transfer",
  tunai: "Tunai",
  giro: "Giro / cek",
  lc: "L/C",
  lainnya: "Lainnya",
};

/** What each formula means on the shop floor, in one line. */
export const COSTING_HINT: Record<CostingMethod, string> = {
  fifo: "Stok yang masuk paling dulu keluar paling dulu. Sisa stok bernilai harga terbaru.",
  rata_rata: "Setiap barang keluar dengan harga rata-rata semua stok saat itu; dihitung ulang tiap barang masuk.",
  identifikasi: "Harga lot yang benar-benar diambil. Cocok untuk barang unik atau pesanan proyek.",
  lifo: "Stok yang masuk terakhir keluar lebih dulu. Hanya untuk analisa internal.",
};
