/**
 * Core domain model. Everything the app persists lives in a single `Db` object so the
 * whole state can be validated, migrated, exported and imported as one JSON document.
 */

export type ID = string;
/** Full ISO timestamp, e.g. 2026-10-21T08:00:00.000Z */
export type ISODateTime = string;
/** Calendar date, e.g. 2026-10-21 */
export type ISODate = string;

export type ItemKind = "material" | "product";

export type Uom = "pcs" | "lembar" | "batang" | "m" | "m2" | "m3" | "kg" | "liter" | "set" | "roll";

export type MaterialCategory =
  | "kayu_solid"
  | "panel"
  | "kain"
  | "busa"
  | "hardware"
  | "finishing"
  | "logam"
  | "rotan"
  | "kemasan"
  | "lainnya";

export type ProductCategory = "kursi" | "meja" | "lemari" | "sofa" | "tempat_tidur" | "dekorasi" | "set" | "lainnya";

/** Millimetres. Thickness is optional for fabric/rolls. */
export interface Dimensions {
  length: number;
  width: number;
  thickness?: number;
}

export interface BomLine {
  materialId: ID;
  /** Quantity of material (in the material's UoM) per one unit of product. */
  qty: number;
  note?: string;
}

export interface PackingSpec {
  /** Carton/crate outer dimensions in centimetres. */
  length: number;
  width: number;
  height: number;
  /** Cartons per unit (knock-down furniture often ships in several). */
  cartonsPerUnit: number;
  grossWeightKg: number;
  netWeightKg: number;
}

export interface Item {
  id: ID;
  sku: string;
  name: string;
  kind: ItemKind;
  category: MaterialCategory | ProductCategory;
  uom: Uom;
  /**
   * Replacement / standard value per UoM. For materials: latest purchase price (auto-updated on
   * receipt). For products: standard cost estimate. Used for valuation bases and allocations.
   */
  standardCost: number;
  reorderPoint?: number;
  /** Materials: track leftovers as remnant lots. */
  trackRemnant?: boolean;
  /** Smallest leftover (in UoM) still considered usable; below that it is waste. */
  minRemnantQty?: number;
  /**
   * Bill of materials. Products always may have one; a material with a BOM is a semi-finished
   * component or processed material (e.g. chair frame, kiln-dried timber) that can be produced.
   */
  bom?: BomLine[];
  /** Standard labour hours per unit (products and producible materials). */
  laborHours?: number;
  /** Default production route (stage names) for this item. */
  stages?: string[];
  /** Unit used when buying, e.g. 1 roll = 50 m. Stock is always kept in `uom`. */
  purchaseUnit?: { label: string; factor: number };
  /** Overrides the company-wide cost formula for this item (see Settings.costingMethod). */
  costingMethod?: CostingMethod;
  // ---- product-only fields ----
  salePrice?: number;
  rentalRatePerDay?: number;
  hsCode?: string;
  packing?: PackingSpec;
  archived?: boolean;
  note?: string;
}

export type PartnerRole = "customer" | "supplier";

export interface Partner {
  id: ID;
  role: PartnerRole;
  name: string;
  contact?: string;
  phone?: string;
  email?: string;
  address?: string;
  country?: string;
  note?: string;
}

export type LotStatus = "tersedia" | "disewa" | "rusak";

export type LotOrigin =
  | "saldo_awal"
  | "pembelian"
  | "produksi"
  | "sisa_produksi"
  | "dekonstruksi"
  | "retur_sewa"
  | "retur_penjualan"
  | "penyesuaian";

export type DocType = "opening" | "purchase" | "workOrder" | "sale" | "rental" | "adjustment";

export interface DocRef {
  type: DocType;
  id: ID;
  code: string;
}

export interface Lot {
  id: ID;
  code: string;
  itemId: ID;
  qty: number;
  /** Cost per UoM, IDR. */
  unitCost: number;
  origin: LotOrigin;
  originRef?: DocRef;
  isRemnant: boolean;
  dimensions?: Dimensions;
  location: string;
  status: LotStatus;
  /** Set while units are out on a rental. */
  rentalId?: ID;
  /** Soft reservation: lot was bought for a specific work order. */
  reservedForWo?: ID;
  /** Set on lots received as partial output (provisional cost, revalued when the order closes). */
  receiptId?: ID;
  createdAt: ISODateTime;
  note?: string;
}

export type MoveType =
  | "saldo_awal"
  | "masuk_pembelian"
  | "keluar_produksi"
  | "kembali_produksi"
  | "masuk_produksi"
  | "masuk_sisa"
  | "keluar_penjualan"
  | "keluar_sewa"
  | "kembali_sewa"
  | "rusak_sewa"
  | "hilang"
  | "penyesuaian"
  | "limbah"
  | "transfer"
  | "retur_penjualan"
  | "revaluasi";

export interface StockMove {
  id: ID;
  at: ISODateTime;
  itemId: ID;
  lotId: ID;
  /** Signed quantity change applied to the lot (status-only changes use 0). */
  qty: number;
  unitCost: number;
  type: MoveType;
  ref: DocRef;
  note?: string;
}

export interface ExtraCost {
  id: ID;
  label: string;
  amount: number;
}

export type PaymentMethod = "transfer" | "tunai" | "giro" | "lc" | "lainnya";

export interface Payment {
  id: ID;
  date: ISODate;
  /** In the document currency. Negative = refund. */
  amount: number;
  method: PaymentMethod;
  note?: string;
}

// ------------------------------------------------------------------ Purchasing

export type PurchaseStatus = "draft" | "diterima" | "batal";

export interface PurchaseLine {
  id: ID;
  itemId: ID;
  qty: number;
  unitPrice: number;
  dimensions?: Dimensions;
}

export interface Purchase {
  id: ID;
  code: string;
  supplierId?: ID;
  date: ISODate;
  status: PurchaseStatus;
  lines: PurchaseLine[];
  /** Freight, unloading, etc. Allocated to lines by value (landed cost). */
  extraCosts: ExtraCost[];
  /** Purchase dedicated to a work order; received lots are reserved for it. */
  workOrderId?: ID;
  invoiceNo?: string;
  /** Supplier payment due date (tempo). */
  dueDate?: ISODate;
  note?: string;
  receivedAt?: ISODateTime;
  lotIds?: ID[];
  payments: Payment[];
}

// ------------------------------------------------------------------ Production

export type WorkOrderType = "produksi" | "konversi" | "dekonstruksi" | "perbaikan";
export type WorkOrderStatus = "rencana" | "berjalan" | "selesai" | "batal";
export type StageStatus = "menunggu" | "proses" | "selesai";
export type OutputGrade = "baik" | "reject";

export interface WoStage {
  id: ID;
  name: string;
  status: StageStatus;
  startedAt?: ISODateTime;
  doneAt?: ISODateTime;
}

/** Labour booked against a work order: time-based (hours × rate) and/or piece-rate (borongan). */
export interface LaborLog {
  id: ID;
  at: ISODateTime;
  stageId?: ID;
  worker: string;
  hours: number;
  rate: number;
  pieces: number;
  pieceRate: number;
  note?: string;
}

/** Output received before the order is closed, at provisional (standard) cost. */
export interface OutputReceipt {
  id: ID;
  at: ISODateTime;
  itemId: ID;
  qty: number;
  grade: OutputGrade;
  provisionalUnitCost: number;
  lotId: ID;
}

export interface PlannedOutput {
  id: ID;
  itemId: ID;
  qty: number;
}

/** A planned input that is not derived from a BOM (e.g. the unit being converted). */
export interface PlannedInput {
  id: ID;
  itemId: ID;
  qty: number;
  /** Optional specific lot (e.g. a damaged rental unit). */
  lotId?: ID;
}

export interface Issue {
  id: ID;
  lotId: ID;
  itemId: ID;
  qty: number;
  unitCost: number;
  at: ISODateTime;
}

export type ReturnKind = "utuh" | "sisa" | "limbah";

export interface ReturnEntry {
  id: ID;
  itemId: ID;
  kind: ReturnKind;
  qty: number;
  /** For `utuh`: the lot the material goes back to. */
  lotId?: ID;
  dimensions?: Dimensions;
  /** For `limbah`: total recoverable value (e.g. sawdust sold). */
  salvageValue?: number;
  note?: string;
}

export interface OutputEntry {
  id: ID;
  itemId: ID;
  qty: number;
  /** Manual allocation share in percent (0–100). When any output has it, all must. */
  sharePct?: number;
  dimensions?: Dimensions;
  /** QC result. Rejected units enter stock as damaged, ready for a repair order. */
  grade?: OutputGrade;
}

export interface CostLine {
  itemId: ID;
  issuedQty: number;
  issuedValue: number;
  returnedQty: number;
  returnedValue: number;
  scrapQty: number;
  scrapValue: number;
  netQty: number;
  netValue: number;
  avgUnitCost: number;
  standardQty: number;
}

export interface OutputCost {
  outputId: ID;
  itemId: ID;
  qty: number;
  weight: number;
  allocated: number;
  unitCost: number;
  /** Portion written off by the cost-or-NRV cap (deconstruction). */
  writeOff: number;
}

export interface CostSummary {
  materialGross: number;
  returnCredit: number;
  scrapRecovery: number;
  materialNet: number;
  labor: number;
  overhead: number;
  extra: number;
  total: number;
  writeOff: number;
  capitalized: number;
  lines: CostLine[];
  outputs: OutputCost[];
  /** Net consumed qty / issued qty across tracked materials (0–1). */
  yieldRatio: number;
  /** True when labour came from logged hours/pieces instead of the plan. */
  laborFromLogs: boolean;
  /** Units rejected by QC (all grades counted in qty). */
  rejectQty: number;
  /** Actual − provisional cost on partial output still in stock (lots revalued). */
  revalued: number;
  /** Actual − provisional cost on partial output already consumed/sold (cost variance). */
  variance: number;
}

export interface WorkOrder {
  id: ID;
  code: string;
  type: WorkOrderType;
  status: WorkOrderStatus;
  title: string;
  createdAt: ISODateTime;
  startedAt?: ISODateTime;
  completedAt?: ISODateTime;
  dueDate?: ISODate;
  salesOrderId?: ID;
  /** Set on component orders created for a parent order. */
  parentWoId?: ID;
  plannedOutputs: PlannedOutput[];
  plannedInputs: PlannedInput[];
  issues: Issue[];
  returns: ReturnEntry[];
  outputs: OutputEntry[];
  laborHours: number;
  laborRate: number;
  overhead: number;
  extraCosts: ExtraCost[];
  stages: WoStage[];
  laborLogs: LaborLog[];
  receipts: OutputReceipt[];
  cost?: CostSummary;
  createdLotIds?: ID[];
  note?: string;
}

// ------------------------------------------------------------------ Sales

export type SalesChannel = "supply" | "ekspor";
export type SalesStatus = "draft" | "dikonfirmasi" | "dikirim_sebagian" | "dikirim" | "selesai" | "batal";
export type Currency = "IDR" | "USD" | "EUR" | "SGD" | "AUD" | "JPY";
export type Incoterm = "EXW" | "FCA" | "FOB" | "CFR" | "CIF" | "DAP" | "DDP";
export type ContainerType = "LCL" | "20GP" | "40GP" | "40HC";

export interface SalesLine {
  id: ID;
  itemId: ID;
  qty: number;
  /** Price per unit in the order currency. */
  unitPrice: number;
  /** Custom specification (size, finish, fabric) for made-to-order lines. */
  spec?: string;
}

export interface ExportInfo {
  incoterm: Incoterm;
  portOfLoading: string;
  portOfDischarge: string;
  destinationCountry: string;
  containerType: ContainerType;
  containerNo?: string;
  sealNo?: string;
  etd?: ISODate;
  vLegalNo?: string;
  eudrDdsRef?: string;
  blNo?: string;
  shippingMark?: string;
}

export interface DeliveryLine {
  itemId: ID;
  lotId: ID;
  qty: number;
  unitCost: number;
}

export interface Delivery {
  id: ID;
  at: ISODateTime;
  lines: DeliveryLine[];
  note?: string;
}

export interface SalesReturn {
  id: ID;
  at: ISODateTime;
  itemId: ID;
  qty: number;
  condition: "baik" | "rusak";
  unitCost: number;
  /** Credit to the customer, in the order currency. */
  credit: number;
  lotId: ID;
  note?: string;
}

export interface SalesOrder {
  id: ID;
  code: string;
  channel: SalesChannel;
  customerId?: ID;
  date: ISODate;
  dueDate?: ISODate;
  status: SalesStatus;
  currency: Currency;
  /** IDR per 1 unit of currency. */
  exchangeRate: number;
  lines: SalesLine[];
  discount: number;
  shippingCharge: number;
  export?: ExportInfo;
  deliveries: Delivery[];
  returns: SalesReturn[];
  payments: Payment[];
  /** Required down payment in percent of total (e.g. 30). */
  dpPercent?: number;
  /** When the remaining balance must be paid. */
  paymentDueDate?: ISODate;
  note?: string;
}

// ------------------------------------------------------------------ Rentals

export type RentalKind = "sewa" | "pinjam";
export type RentalStatus = "dipesan" | "berjalan" | "selesai" | "batal";
export type ReturnCondition = "baik" | "rusak" | "hilang";

export interface RentalLine {
  id: ID;
  itemId: ID;
  qty: number;
  ratePerDay: number;
}

export interface RentalCheckout {
  id: ID;
  lotId: ID;
  itemId: ID;
  qty: number;
  at: ISODateTime;
}

export interface RentalReturn {
  id: ID;
  checkoutId: ID;
  itemId: ID;
  qty: number;
  condition: ReturnCondition;
  fee: number;
  at: ISODateTime;
  note?: string;
}

export interface Rental {
  id: ID;
  code: string;
  kind: RentalKind;
  customerId?: ID;
  project: string;
  startDate: ISODate;
  endDate: ISODate;
  status: RentalStatus;
  lines: RentalLine[];
  deposit: number;
  discount: number;
  /** Delivery, set-up, cleaning fees. */
  extraCharges: ExtraCost[];
  payments: Payment[];
  checkouts: RentalCheckout[];
  returns: RentalReturn[];
  /** Repair work orders spawned from damaged returns. */
  repairWoIds?: ID[];
  note?: string;
}

// ------------------------------------------------------------------ Settings & Db

/**
 * Cost formula for interchangeable stock (PSAK 14 / IAS 2):
 *  - fifo: oldest layer leaves first (PSAK & UU PPh)
 *  - rata_rata: perpetual moving average (PSAK & UU PPh)
 *  - lifo: newest layer leaves first (management reporting only; not PSAK, not UU PPh)
 *  - identifikasi: the cost of the exact lot taken (PSAK, for non-interchangeable goods)
 * Remnants, lots bought for a specific work order and damaged units are always specific.
 */
export type CostingMethod = "fifo" | "lifo" | "rata_rata" | "identifikasi";

export interface CostingChange {
  at: ISODateTime;
  from: CostingMethod;
  to: CostingMethod;
  /** Set when the change is an item override; absent for the company default. */
  itemId?: ID;
}

export interface Settings {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyEmail: string;
  npwp: string;
  laborRatePerHour: number;
  /** Overhead charged per direct labour hour. */
  overheadPerLaborHour: number;
  defaultLocation: string;
  locations: string[];
  /** IDR per unit of foreign currency. */
  exchangeRates: Record<Exclude<Currency, "IDR">, number>;
  /** Days before a remnant is flagged as ageing. */
  remnantAgingDays: number;
  /** Days before due date to start warning about rentals. */
  rentalReminderDays: number;
  /** Default production route for new work orders. */
  defaultStages: string[];
  costingMethod: CostingMethod;
  /** Audit trail: UU PPh requires the method to be applied consistently. */
  costingHistory: CostingChange[];
}

export type CounterKey = "lot" | "purchase" | "workOrder" | "sale" | "rental" | "adjustment" | "item" | "partner";

export interface Db {
  schemaVersion: number;
  settings: Settings;
  items: Item[];
  partners: Partner[];
  lots: Lot[];
  moves: StockMove[];
  purchases: Purchase[];
  workOrders: WorkOrder[];
  sales: SalesOrder[];
  rentals: Rental[];
  counters: Record<CounterKey, number>;
}
