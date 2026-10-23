import type {
  FlowKind,
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
    label: "New production",
    short: "Production",
    description: "Raw materials → new product, per the BOM.",
    tone: "accent",
  },
  konversi: {
    label: "Conversion",
    short: "Conversion",
    description: "An existing product is turned into another product (e.g. dining table → desk).",
    tone: "warning",
  },
  gabung: {
    label: "Merge",
    short: "Merge",
    description: "Several items → one item: a table + chairs set, or offcuts glued into a panel.",
    tone: "default",
  },
  dekonstruksi: {
    label: "Dismantling",
    short: "Dismantle",
    description: "A product is taken apart into materials that can be used again.",
    tone: "danger",
  },
  perbaikan: {
    label: "Repair",
    short: "Repair",
    description: "A damaged unit (e.g. back from rental) is repaired so it can be used again.",
    tone: "success",
  },
};

export const WO_STATUS: Record<WorkOrderStatus, { label: string; tone: Tone }> = {
  rencana: { label: "Planned", tone: "default" },
  berjalan: { label: "In progress", tone: "accent" },
  selesai: { label: "Done", tone: "success" },
  batal: { label: "Cancelled", tone: "danger" },
};

export const PURCHASE_STATUS: Record<PurchaseStatus, { label: string; tone: Tone }> = {
  draft: { label: "Awaiting goods", tone: "warning" },
  diterima: { label: "Received", tone: "success" },
  batal: { label: "Cancelled", tone: "danger" },
};

export const SALES_STATUS: Record<SalesStatus, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "default" },
  dikonfirmasi: { label: "Confirmed", tone: "accent" },
  dikirim_sebagian: { label: "Partly shipped", tone: "warning" },
  dikirim: { label: "Shipped", tone: "success" },
  selesai: { label: "Done", tone: "success" },
  batal: { label: "Cancelled", tone: "danger" },
};

export const SALES_CHANNEL: Record<SalesChannel, string> = { supply: "Supply", ekspor: "Export" };

export const RENTAL_STATUS: Record<RentalStatus, { label: string; tone: Tone }> = {
  dipesan: { label: "Booked", tone: "default" },
  berjalan: { label: "With client", tone: "accent" },
  selesai: { label: "Done", tone: "success" },
  batal: { label: "Cancelled", tone: "danger" },
};

export const LOT_STATUS: Record<LotStatus, { label: string; tone: Tone }> = {
  tersedia: { label: "Available", tone: "success" },
  disewa: { label: "On rent", tone: "accent" },
  rusak: { label: "Damaged", tone: "danger" },
};

export const LOT_ORIGIN: Record<LotOrigin, string> = {
  saldo_awal: "Opening stock",
  pembelian: "Purchase",
  produksi: "Production",
  sisa_produksi: "Production offcut",
  dekonstruksi: "Dismantled",
  retur_sewa: "Rental return",
  retur_penjualan: "Sales return",
  penyesuaian: "Adjustment",
  gabung: "Merged lot",
};

export const RETURN_KIND: Record<ReturnKind, { label: string; description: string; tone: Tone }> = {
  utuh: { label: "Whole", description: "Not used, goes back to its original lot", tone: "default" },
  sisa: { label: "Offcut", description: "A piece that can still be used — becomes an offcut lot", tone: "success" },
  limbah: { label: "Waste", description: "Thrown away; enter a value if it is sold (e.g. sawdust)", tone: "warning" },
};

export const RETURN_CONDITION: Record<ReturnCondition, { label: string; tone: Tone }> = {
  baik: { label: "Good", tone: "success" },
  rusak: { label: "Damaged", tone: "warning" },
  hilang: { label: "Lost", tone: "danger" },
};

export const MOVE_TYPE: Record<MoveType, string> = {
  saldo_awal: "Opening stock",
  masuk_pembelian: "In · purchase",
  keluar_produksi: "Out · production",
  kembali_produksi: "Back · production",
  masuk_produksi: "In · production output",
  masuk_sisa: "In · offcut",
  keluar_penjualan: "Out · sale",
  keluar_sewa: "Rental · handed over",
  kembali_sewa: "Rental · taken back",
  rusak_sewa: "Rental · back damaged",
  hilang: "Lost",
  penyesuaian: "Adjustment",
  limbah: "Waste",
  transfer: "Transfer",
  retur_penjualan: "In · sales return",
  revaluasi: "Unit cost revaluation",
  gabung: "Merge lots",
};

export const MATERIAL_CATEGORY: Record<MaterialCategory, string> = {
  kayu_solid: "Solid wood",
  panel: "Panel (plywood/MDF)",
  kain: "Fabric",
  busa: "Foam",
  hardware: "Hardware",
  finishing: "Finishing",
  logam: "Metal",
  rotan: "Rattan",
  kemasan: "Packaging",
  lainnya: "Other",
};

export const PRODUCT_CATEGORY: Record<ProductCategory, string> = {
  kursi: "Chair",
  meja: "Table",
  lemari: "Cabinet",
  sofa: "Sofa",
  tempat_tidur: "Bed",
  dekorasi: "Decor",
  set: "Set",
  lainnya: "Other",
};

export const categoryLabel = (c: string) =>
  (MATERIAL_CATEGORY as Record<string, string>)[c] ?? (PRODUCT_CATEGORY as Record<string, string>)[c] ?? c;

export const STAGE_STATUS: Record<StageStatus, { label: string; tone: Tone }> = {
  menunggu: { label: "Waiting", tone: "default" },
  proses: { label: "Working", tone: "accent" },
  selesai: { label: "Done", tone: "success" },
};

export const OUTPUT_GRADE: Record<OutputGrade, string> = { baik: "Good", reject: "Reject" };

export const PAYMENT_METHOD: Record<PaymentMethod, string> = {
  transfer: "Transfer",
  tunai: "Cash",
  giro: "Giro / cheque",
  lc: "L/C",
  lainnya: "Other",
};

/** What each formula means on the shop floor, in one line. */
export const COSTING_HINT: Record<CostingMethod, string> = {
  fifo: "Stock that came in first goes out first. Remaining stock is valued at the latest prices.",
  rata_rata: "Every item goes out at the average price of all stock at that moment; recalculated each time goods come in.",
  identifikasi: "The price of the lot actually issued. Suits one-off items or project orders.",
  lifo: "Stock that came in last goes out first. For internal analysis only.",
};

/** Legend wording for process-map node kinds. */
export const FLOW_KIND: Record<FlowKind, string> = {
  bahan: "Material",
  produk: "Product",
  sisa: "Offcut",
  biaya: "Labour & overhead",
  proses: "Process",
  stok: "Stock / work in progress",
  rugi: "Waste & loss",
};
