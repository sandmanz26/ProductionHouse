/**
 * Demo dataset built exclusively through domain operations, so every number (lots, remnants,
 * HPP, ledger) is internally consistent. Dates are relative to "today" to keep the demo fresh.
 */
import { addPayment } from "./finance";
import { addOpeningStock, transferLot } from "./inventory";
import { addDays, today } from "./dates";
import { emptyDb } from "./db";
import { createItem, createPartner } from "./master";
import {
  addLaborLog,
  completeWorkOrder,
  createWorkOrder,
  issueMaterials,
  receiveOutput,
  setStageStatus,
  standardProductCost,
  suggestIssue,
} from "./production";
import { createPurchase, receivePurchase } from "./purchasing";
import { createRecipe, createWorkOrderFromRecipe, recipeCost } from "./recipes";
import { checkoutRental, createRental, returnRental } from "./rentals";
import { confirmSalesOrder, createSalesOrder, deliverSalesOrder, returnSale } from "./sales";
import type { Db, ID, WorkOrder } from "./types";

const at = (daysAgo: number, hour = 9) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
};
const dateAgo = (n: number) => addDays(today(), -n);

export function buildDemoDb(): Db {
  const db = emptyDb();
  db.settings = {
    ...db.settings,
    companyName: "Sekar Kayu Production House",
    companyAddress: "Jl. Raya Tahunan No. 18, Jepara, Jawa Tengah",
    companyPhone: "+62 291 555 018",
    companyEmail: "halo@sekarkayu.id",
    npwp: "01.234.567.8-516.000",
    laborRatePerHour: 28_000,
    overheadPerLaborHour: 12_000,
  };

  // ---------------------------------------------------------------- Materials
  const m = (
    sku: string,
    name: string,
    category: Parameters<typeof createItem>[1]["category"],
    uom: Parameters<typeof createItem>[1]["uom"],
    standardCost: number,
    extra: Partial<Parameters<typeof createItem>[1]> = {},
  ) => createItem(db, { sku, name, kind: "material", category, uom, standardCost, ...extra });

  const jati = m("KY-JATI-A", "Kayu Jati Grade A (kering oven)", "kayu_solid", "m3", 14_500_000, {
    trackRemnant: true,
    minRemnantQty: 0.004,
    reorderPoint: 0.5,
  });
  const mahoni = m("KY-MHN", "Kayu Mahoni", "kayu_solid", "m3", 7_800_000, { trackRemnant: true, minRemnantQty: 0.004, reorderPoint: 0.4 });
  const ply = m("PN-PLY18", "Plywood 18mm 122×244", "panel", "lembar", 285_000, { trackRemnant: true, minRemnantQty: 0.1, reorderPoint: 6 });
  const mdf = m("PN-MDF12", "MDF 12mm 122×244", "panel", "lembar", 168_000, { trackRemnant: true, minRemnantQty: 0.1, reorderPoint: 4 });
  const linen = m("KN-LINEN", "Kain Linen Natural (lebar 140)", "kain", "m", 92_000, { trackRemnant: true, minRemnantQty: 0.3, reorderPoint: 15 });
  const busa = m("BS-D30", "Busa D30 tebal 5cm", "busa", "lembar", 185_000, { trackRemnant: true, minRemnantQty: 0.15, reorderPoint: 4 });
  const rotan = m("RT-SINT", "Rotan Sintetis", "rotan", "kg", 68_000, { reorderPoint: 10 });
  const hollow = m("LG-HL44", "Besi Hollow 4×4", "logam", "batang", 98_000, { trackRemnant: true, minRemnantQty: 0.2, reorderPoint: 6 });
  const engsel = m("HW-ENGSEL", "Engsel Sendok Slow Motion", "hardware", "pcs", 9_500, { reorderPoint: 20 });
  const sekrup = m("HW-SKR440", "Sekrup Kayu 4×40", "hardware", "pcs", 160, { reorderPoint: 500 });
  const melamine = m("FN-MLM", "Melamine Clear Doff", "finishing", "liter", 96_000, { reorderPoint: 5 });
  const thinner = m("FN-THN", "Thinner Super", "finishing", "liter", 29_000, { reorderPoint: 5 });
  const kardus = m("KM-KRD5", "Kardus 5 Lapis + Sudut", "kemasan", "pcs", 38_000, { reorderPoint: 10 });
  const lem = m("FN-LEM-PVAC", "Lem Kayu PVAc D3", "finishing", "liter", 45_000, { reorderPoint: 3 });
  // Reclaimed timber: bought from collectors or recovered by dismantling, then processed.
  const bongkaran = m("KY-JATI-BKR", "Kayu Jati Bongkaran (mentah)", "kayu_solid", "m3", 5_200_000, { trackRemnant: true, minRemnantQty: 0.004 });
  const reclaimed = m("KY-JATI-RCL", "Kayu Jati Reclaimed (olahan)", "kayu_solid", "m3", 0, {
    trackRemnant: true,
    minRemnantQty: 0.004,
    note: "Bongkaran yang sudah dicabut pakunya, diserut, dan dioven ulang.",
  });

  // ---------------------------------------------------------------- Products
  const p = (
    sku: string,
    name: string,
    category: Parameters<typeof createItem>[1]["category"],
    extra: Partial<Parameters<typeof createItem>[1]>,
  ) => createItem(db, { sku, name, kind: "product", category, uom: "pcs", standardCost: 0, ...extra });

  const kursi = p("KRS-SEKAR", "Kursi Makan Jati Sekar", "kursi", {
    bom: [
      { materialId: jati.id, qty: 0.032 },
      { materialId: linen.id, qty: 0.6 },
      { materialId: busa.id, qty: 0.25 },
      { materialId: sekrup.id, qty: 12 },
      { materialId: melamine.id, qty: 0.15 },
      { materialId: thinner.id, qty: 0.1 },
    ],
    laborHours: 6,
    stages: ["Potong", "Rakit", "Amplas", "Jok", "Finishing", "QC", "Packing"],
    salePrice: 1_950_000,
    rentalRatePerDay: 75_000,
    hsCode: "9401.61",
    packing: { length: 52, width: 56, height: 96, cartonsPerUnit: 1, grossWeightKg: 9.5, netWeightKg: 7.8 },
  });
  const meja = p("MJ-MKN180", "Meja Makan Jati 180", "meja", {
    bom: [
      { materialId: jati.id, qty: 0.11 },
      { materialId: sekrup.id, qty: 24 },
      { materialId: melamine.id, qty: 0.6 },
      { materialId: thinner.id, qty: 0.4 },
      { materialId: kardus.id, qty: 2 },
    ],
    laborHours: 14,
    salePrice: 6_800_000,
    rentalRatePerDay: 250_000,
    hsCode: "9403.60",
    packing: { length: 188, width: 98, height: 18, cartonsPerUnit: 2, grossWeightKg: 56, netWeightKg: 49 },
  });
  const lemari = p("LM-2P-MHN", "Lemari 2 Pintu Mahoni", "lemari", {
    bom: [
      { materialId: mahoni.id, qty: 0.08 },
      { materialId: ply.id, qty: 2.5 },
      { materialId: mdf.id, qty: 1 },
      { materialId: engsel.id, qty: 4 },
      { materialId: sekrup.id, qty: 40 },
      { materialId: melamine.id, qty: 0.8 },
      { materialId: thinner.id, qty: 0.5 },
    ],
    laborHours: 18,
    salePrice: 5_400_000,
    hsCode: "9403.50",
    packing: { length: 100, width: 60, height: 190, cartonsPerUnit: 1, grossWeightKg: 72, netWeightKg: 63 },
  });
  const sofa = p("SF-RTN3", "Sofa Rotan 3 Dudukan", "sofa", {
    bom: [
      { materialId: rotan.id, qty: 6 },
      { materialId: hollow.id, qty: 3 },
      { materialId: busa.id, qty: 3 },
      { materialId: linen.id, qty: 6 },
      { materialId: sekrup.id, qty: 30 },
    ],
    laborHours: 16,
    stages: ["Rangka besi", "Anyam rotan", "Jok", "QC", "Packing"],
    salePrice: 8_200_000,
    rentalRatePerDay: 350_000,
    hsCode: "9401.71",
    packing: { length: 200, width: 85, height: 80, cartonsPerUnit: 1, grossWeightKg: 38, netWeightKg: 32 },
  });
  const mejaKerja = p("MJ-KRJ-RCL", "Meja Kerja Jati Reclaimed", "meja", {
    bom: [
      { materialId: jati.id, qty: 0.045 },
      { materialId: melamine.id, qty: 0.3 },
      { materialId: sekrup.id, qty: 16 },
    ],
    laborHours: 8,
    salePrice: 4_100_000,
    rentalRatePerDay: 150_000,
    hsCode: "9403.30",
    packing: { length: 125, width: 65, height: 15, cartonsPerUnit: 1, grossWeightKg: 28, netWeightKg: 24 },
  });
  const bangku = p("BK-DKR", "Bangku Dekor Kayu Sisa", "dekorasi", {
    bom: [
      { materialId: jati.id, qty: 0.01 },
      { materialId: melamine.id, qty: 0.08 },
      { materialId: sekrup.id, qty: 8 },
    ],
    laborHours: 3,
    salePrice: 750_000,
    rentalRatePerDay: 35_000,
    hsCode: "9403.60",
    note: "Didesain untuk menghabiskan sisa potongan jati.",
  });

  // Semi-finished component: produced in-house, then used in the bar stool's BOM.
  const rangka = m("KMP-RGK-BAR", "Rangka Kursi Bar (komponen)", "kayu_solid", "pcs", 0, {
    bom: [
      { materialId: jati.id, qty: 0.022 },
      { materialId: sekrup.id, qty: 10 },
    ],
    laborHours: 2.5,
    stages: ["Potong", "Rakit"],
    note: "Komponen setengah jadi — dibuat dulu, lalu dirakit menjadi Kursi Bar.",
  });
  rangka.standardCost = standardProductCost(db, rangka);
  const kursiBar = p("KRS-BAR", "Kursi Bar Jati", "kursi", {
    bom: [
      { materialId: rangka.id, qty: 1 },
      { materialId: linen.id, qty: 0.4 },
      { materialId: busa.id, qty: 0.2 },
      { materialId: melamine.id, qty: 0.12 },
    ],
    laborHours: 3,
    stages: ["Rakit", "Jok", "Finishing", "QC"],
    salePrice: 2_350_000,
    rentalRatePerDay: 90_000,
    hsCode: "9401.61",
    packing: { length: 45, width: 45, height: 110, cartonsPerUnit: 1, grossWeightKg: 8.5, netWeightKg: 7 },
  });
  linen.purchaseUnit = { label: "roll (50 m)", factor: 50 };

  // Made by merging: a dining set, and a panel glued up from teak offcuts.
  const setMakan = p("SET-MKN-SEKAR", "Set Makan Sekar (meja + 6 kursi)", "meja", {
    salePrice: 17_500_000,
    rentalRatePerDay: 450_000,
    hsCode: "9403.60",
    note: "Dirakit dari Meja Makan Jati 180 dan 6 Kursi Sekar lewat resep gabung.",
  });
  const panelSambung = m("PN-JATI-SMB", "Panel Jati Sambung 120×40", "kayu_solid", "lembar", 0, {
    note: "Panel finger-joint dari potongan sisa jati — dipakai untuk daun meja kecil dan rak.",
  });

  for (const prod of db.items.filter((i) => i.kind === "product")) prod.standardCost = standardProductCost(db, prod);

  // ---------------------------------------------------------------- Recipes
  const rKursi = createRecipe(db, {
    name: "Kursi Makan Sekar — standar",
    type: "produksi",
    inputs: (kursi.bom ?? []).map((b) => ({ itemId: b.materialId, qty: b.qty })),
    outputs: [{ itemId: kursi.id, qty: 1 }],
    laborHours: 6,
    expectedRemnantPct: 6,
    expectedWastePct: 4,
    stages: kursi.stages,
    note: "Rangka dari papan 5 cm; sisa papan ≥ 30 cm disimpan sebagai sisa.",
  });
  const rSet = createRecipe(db, {
    name: "Set Makan Sekar (meja + 6 kursi)",
    type: "gabung",
    inputs: [
      { itemId: meja.id, qty: 1 },
      { itemId: kursi.id, qty: 6 },
      { itemId: kardus.id, qty: 4 },
    ],
    outputs: [{ itemId: setMakan.id, qty: 1 }],
    laborHours: 2,
    stages: ["Pasang & setel warna", "QC set", "Packing"],
    note: "Pilih kursi dengan warna finishing paling dekat dengan meja.",
  });
  setMakan.standardCost = recipeCost(db, rSet).outputs[0]!.unitCost;
  const rPanel = createRecipe(db, {
    name: "Panel jati sambung dari sisa",
    type: "gabung",
    inputs: [
      { itemId: jati.id, qty: 0.03, note: "pakai lot sisa" },
      { itemId: lem.id, qty: 0.2 },
    ],
    outputs: [{ itemId: panelSambung.id, qty: 1 }],
    laborHours: 1.5,
    expectedWastePct: 12,
    stages: ["Serut & potong", "Finger-joint & lem", "Press", "Amplas"],
  });
  panelSambung.standardCost = recipeCost(db, rPanel).outputs[0]!.unitCost;
  createRecipe(db, {
    name: "Bongkar Meja Makan 180",
    type: "dekonstruksi",
    inputs: [{ itemId: meja.id, qty: 1 }],
    outputs: [
      { itemId: bongkaran.id, qty: 0.08 },
      { itemId: sekrup.id, qty: 10 },
    ],
    laborHours: 3,
    expectedWastePct: 20,
    stages: ["Bongkar", "Cabut paku & sekrup", "Sortir papan"],
  });
  createRecipe(db, {
    name: "Bongkar kursi rusak",
    type: "dekonstruksi",
    inputs: [{ itemId: kursi.id, qty: 1 }],
    outputs: [{ itemId: bongkaran.id, qty: 0.018 }],
    laborHours: 1,
    expectedWastePct: 35,
    stages: ["Bongkar", "Sortir papan"],
    note: "Untuk kursi yang rangkanya patah dan tidak layak diperbaiki.",
  });
  const rOlah = createRecipe(db, {
    name: "Olah kayu bongkaran",
    type: "produksi",
    inputs: [{ itemId: bongkaran.id, qty: 1.25 }],
    outputs: [{ itemId: reclaimed.id, qty: 1 }],
    laborHours: 10,
    expectedWastePct: 20,
    stages: ["Cabut paku", "Serut & ketam", "Potong ulang", "Oven ulang"],
  });
  reclaimed.standardCost = recipeCost(db, rOlah).outputs[0]!.unitCost;
  const rKursiReclaimed = createRecipe(db, {
    name: "Kursi Sekar — kayu reclaimed",
    type: "produksi",
    inputs: [
      { itemId: reclaimed.id, qty: 0.035 },
      { itemId: linen.id, qty: 0.6 },
      { itemId: busa.id, qty: 0.25 },
      { itemId: sekrup.id, qty: 12 },
      { itemId: melamine.id, qty: 0.15 },
      { itemId: thinner.id, qty: 0.1 },
    ],
    outputs: [{ itemId: kursi.id, qty: 1 }],
    laborHours: 7,
    expectedRemnantPct: 4,
    stages: kursi.stages,
    note: "Serat lebih berkarakter — untuk koleksi 'Jejak Kayu'. Butuh sedikit lebih banyak kayu karena cacat paku.",
  });

  // ---------------------------------------------------------------- Partners
  const sup = (name: string, extra: object = {}) => createPartner(db, { role: "supplier", name, ...extra });
  const cus = (name: string, extra: object = {}) => createPartner(db, { role: "customer", name, ...extra });
  const supJati = sup("CV Jati Mulya Jepara", { phone: "0812-2900-1144", address: "Jepara" });
  const supBangunan = sup("TB Sinar Abadi", { phone: "0291-591-222", address: "Kudus" });
  const supTekstil = sup("Tekstil Mandiri Bandung", { phone: "022-7301-889", address: "Bandung" });
  sup("Rotan Cirebon Jaya", { phone: "0231-882-117", address: "Cirebon" });
  const supRangka = sup("UD Rangka Kudus", { phone: "0291-430-118", address: "Kudus" });
  const supBekas = sup("Pengepul Kayu Bekas Jepara", { phone: "0813-2551-0901", address: "Jepara" });
  const griya = cus("PT Griya Interior Nusantara", { contact: "Ibu Maya", phone: "021-5550-7788", address: "Jakarta Selatan", country: "Indonesia" });
  const nordic = cus("Nordic Living B.V.", { contact: "Jesper Holm", email: "buying@nordicliving.example", address: "Keizersgracht 120, Amsterdam", country: "Belanda" });
  const kopi = cus("Kopi Senja Group", { contact: "Pak Arif", phone: "0813-1100-2299", address: "Semarang", country: "Indonesia" });
  const lensa = cus("Lensa Sinema Production", { contact: "Mbak Dita", phone: "0857-7712-3030", address: "Jakarta Barat", country: "Indonesia" });
  const arunika = cus("Hotel Arunika Ubud", { contact: "Made Wira", phone: "0361-975-123", address: "Ubud, Bali", country: "Indonesia" });

  // ---------------------------------------------------------------- Opening stock (60 days ago)
  const opening: [ID, number, number][] = [
    [mahoni.id, 0.45, 7_600_000],
    [ply.id, 6, 278_000],
    [mdf.id, 5, 165_000],
    [busa.id, 14, 180_000],
    [rotan.id, 30, 66_000],
    [hollow.id, 12, 95_000],
    [engsel.id, 48, 9_200],
    [sekrup.id, 2_500, 150],
    [thinner.id, 20, 28_000],
    [kardus.id, 30, 37_000],
    [lem.id, 6, 44_000],
  ];
  for (const [itemId, qty, unitCost] of opening) {
    const lot = addOpeningStock(db, { itemId, qty, unitCost });
    lot.createdAt = at(60);
  }
  for (const mv of db.moves) mv.at = at(60);

  // ---------------------------------------------------------------- Purchases
  const po1 = createPurchase(db, {
    supplierId: supJati.id,
    date: dateAgo(45),
    lines: [{ itemId: jati.id, qty: 1.2, unitPrice: 14_200_000 }],
    extraCosts: [{ label: "Ongkir truk Jepara", amount: 450_000 }],
    invoiceNo: "JM/IX/0912",
  });
  receivePurchase(db, po1.id, { at: at(45) });
  addPayment(db, "purchase", po1.id, { date: dateAgo(30), amount: 17_490_000, method: "transfer", note: "Lunas" });
  const po2 = createPurchase(db, {
    supplierId: supBangunan.id,
    date: dateAgo(40),
    lines: [
      { itemId: melamine.id, qty: 20, unitPrice: 94_000 },
      { itemId: ply.id, qty: 10, unitPrice: 285_000 },
    ],
    extraCosts: [{ label: "Bongkar muat", amount: 75_000 }],
  });
  po2.dueDate = addDays(today(), 2);
  receivePurchase(db, po2.id, { at: at(40) });
  const po3 = createPurchase(db, {
    supplierId: supTekstil.id,
    date: dateAgo(30),
    lines: [{ itemId: linen.id, qty: 50, unitPrice: 92_000 }],
    extraCosts: [{ label: "Ekspedisi", amount: 120_000 }],
  });
  po3.dueDate = addDays(today(), 15);
  receivePurchase(db, po3.id, { at: at(30) });
  addPayment(db, "purchase", po3.id, { date: dateAgo(30), amount: 2_000_000, method: "transfer", note: "DP" });

  const complete = (wo: WorkOrder, daysAgo: number, input: Parameters<typeof completeWorkOrder>[2]) =>
    completeWorkOrder(db, wo.id, input, { at: at(daysAgo, 16) });
  const issueBom = (wo: WorkOrder, daysAgo: number, overIssue: Record<ID, number> = {}) => {
    const reqs = new Map<ID, number>();
    for (const o of wo.plannedOutputs) {
      for (const b of db.items.find((i) => i.id === o.itemId)?.bom ?? []) {
        reqs.set(b.materialId, (reqs.get(b.materialId) ?? 0) + b.qty * o.qty);
      }
    }
    const picks = [...reqs].flatMap(([itemId, q]) => suggestIssue(db, wo, itemId, q + (overIssue[itemId] ?? 0)).picks);
    issueMaterials(db, wo.id, picks, at(daysAgo, 8));
  };

  // WO 1: dining chairs from the standard recipe — teak & fabric offcuts come back as remnants
  const wo1 = createWorkOrderFromRecipe(db, rKursi.id, { batches: 12, title: "Kursi Makan Sekar batch Oktober" });
  wo1.createdAt = at(28);
  issueBom(wo1, 27, { [jati.id]: 0.05, [linen.id]: 1.5 });
  complete(wo1, 20, {
    outputs: [{ itemId: kursi.id, qty: 12 }],
    returns: [
      { itemId: jati.id, kind: "sisa", qty: 0.028, dimensions: { length: 1200, width: 180, thickness: 50 }, note: "Papan sisa rangka" },
      { itemId: jati.id, kind: "limbah", qty: 0.012, salvageValue: 35_000, note: "Serbuk & serutan dijual" },
      { itemId: linen.id, kind: "sisa", qty: 1.4, dimensions: { length: 1400, width: 1400 } },
    ],
  });

  // WO 2: wardrobes — plywood offcuts
  const wo2 = createWorkOrder(db, {
    type: "produksi",
    title: "Lemari 2 Pintu untuk Hotel Arunika",
    plannedOutputs: [{ itemId: lemari.id, qty: 4 }],
  });
  wo2.createdAt = at(25);
  issueBom(wo2, 24, { [ply.id]: 1 });
  complete(wo2, 15, {
    outputs: [{ itemId: lemari.id, qty: 4 }],
    returns: [
      { itemId: ply.id, kind: "sisa", qty: 0.6, dimensions: { length: 1220, width: 1460, thickness: 18 } },
      { itemId: ply.id, kind: "sisa", qty: 0.25, dimensions: { length: 1220, width: 610, thickness: 18 } },
      { itemId: ply.id, kind: "limbah", qty: 0.15 },
      { itemId: mahoni.id, kind: "sisa", qty: 0.01, dimensions: { length: 800, width: 150, thickness: 80 } },
    ],
  });

  // WO 3: dining tables + sofas (multi-output, allocated by relative sales value)
  const wo3 = createWorkOrder(db, {
    type: "produksi",
    title: "Meja Makan & Sofa Rotan — stok showroom",
    plannedOutputs: [
      { itemId: meja.id, qty: 3 },
      { itemId: sofa.id, qty: 2 },
    ],
  });
  wo3.createdAt = at(19);
  issueBom(wo3, 18);
  complete(wo3, 9, {
    outputs: [
      { itemId: meja.id, qty: 3 },
      { itemId: sofa.id, qty: 2 },
    ],
    returns: [{ itemId: jati.id, kind: "sisa", qty: 0.018, dimensions: { length: 1800, width: 100, thickness: 40 } }],
  });

  // WO 4: conversion — dining table becomes a work desk (reuse)
  const mejaLot = db.lots.find((l) => l.itemId === meja.id && l.qty > 0)!;
  const wo4 = createWorkOrder(db, {
    type: "konversi",
    title: "Konversi Meja Makan → Meja Kerja (pesanan Kopi Senja)",
    plannedOutputs: [{ itemId: mejaKerja.id, qty: 1 }],
    plannedInputs: [
      { itemId: meja.id, qty: 1, lotId: mejaLot.id },
      { itemId: melamine.id, qty: 0.3 },
    ],
    laborHours: 6,
  });
  wo4.createdAt = at(8);
  issueMaterials(
    db,
    wo4.id,
    [...suggestIssue(db, wo4, meja.id, 1).picks, ...suggestIssue(db, wo4, melamine.id, 0.3).picks],
    at(8),
  );
  complete(wo4, 5, {
    outputs: [{ itemId: mejaKerja.id, qty: 1 }],
    returns: [],
  });

  // WO 5 (running): more chairs for export — uses remnants first
  const wo5 = createWorkOrder(db, {
    type: "produksi",
    title: "Kursi Sekar untuk Nordic Living",
    plannedOutputs: [{ itemId: kursi.id, qty: 24 }],
    dueDate: addDays(today(), 10),
  });
  wo5.createdAt = at(4);
  // Export-grade chairs need full-length boards, so remnants are skipped here.
  issueMaterials(db, wo5.id, suggestIssue(db, wo5, jati.id, 0.3, false).picks, at(3));
  const [sPotong, sRakit] = wo5.stages;
  addLaborLog(db, wo5.id, { stageId: sPotong!.id, worker: "Tim Pak Darto", hours: 16, at: at(3, 15) });
  setStageStatus(db, wo5.id, sPotong!.id, "selesai", at(2, 16));
  addLaborLog(db, wo5.id, { stageId: sRakit!.id, worker: "Mas Joko (borongan)", pieces: 12, pieceRate: 45_000, at: at(1, 16) });
  receiveOutput(db, wo5.id, { itemId: kursi.id, qty: 6, at: at(1, 17) });

  // WO 6 (planned): decorative benches from teak offcuts
  const wo6 = createWorkOrder(db, {
    type: "produksi",
    title: "Bangku Dekor dari sisa jati",
    plannedOutputs: [{ itemId: bangku.id, qty: 4 }],
    dueDate: addDays(today(), 14),
  });
  wo6.createdAt = at(1);

  // WO 7 (planned): bar stools need frames — a component that can be produced in-house
  const wo7 = createWorkOrder(db, {
    type: "produksi",
    title: "Kursi Bar untuk Hotel Arunika",
    plannedOutputs: [{ itemId: kursiBar.id, qty: 6 }],
    dueDate: addDays(today(), 18),
  });
  wo7.createdAt = at(0);

  // WO 8 (planned): a dining set assembled by merging stock, for a showroom partner
  const wo8 = createWorkOrderFromRecipe(db, rSet.id, { batches: 1, title: "Set Makan Sekar untuk showroom Griya", dueDate: addDays(today(), 12) });
  wo8.createdAt = at(0);

  // Dedicated purchase for WO5 (draft, waiting)
  createPurchase(db, {
    supplierId: supJati.id,
    date: today(),
    lines: [{ itemId: jati.id, qty: 0.5, unitPrice: 14_600_000 }],
    extraCosts: [{ label: "Ongkir", amount: 250_000 }],
    workOrderId: wo5.id,
    note: "Tambahan jati untuk order Nordic Living",
  });

  // An old offcut found during stock opname — flagged as ageing.
  const oldRemnant = addOpeningStock(db, {
    itemId: mdf.id,
    qty: 0.35,
    unitCost: 160_000,
    isRemnant: true,
    dimensions: { length: 1220, width: 850, thickness: 12 },
    location: "Workshop",
    note: "Potongan dari proyek kitchen set lama",
  });
  oldRemnant.createdAt = at(120);
  db.moves[db.moves.length - 1]!.at = at(120);

  // ---------------------------------------------------------------- Sales
  const so1 = createSalesOrder(db, {
    channel: "supply",
    customerId: arunika.id,
    date: dateAgo(26),
    dueDate: dateAgo(12),
    currency: "IDR",
    exchangeRate: 1,
    lines: [{ itemId: lemari.id, qty: 4, unitPrice: 5_250_000 }],
    shippingCharge: 1_500_000,
  });
  confirmSalesOrder(db, so1.id);
  addPayment(db, "sale", so1.id, { date: dateAgo(25), amount: 11_250_000, method: "transfer", note: "DP 50%" });
  deliverSalesOrder(db, so1.id, [{ itemId: lemari.id, qty: 4 }], { at: at(13) });
  addPayment(db, "sale", so1.id, { date: dateAgo(10), amount: 11_250_000, method: "transfer", note: "Pelunasan" });

  const so2 = createSalesOrder(db, {
    channel: "ekspor",
    customerId: nordic.id,
    date: dateAgo(6),
    dueDate: addDays(today(), 21),
    currency: "EUR",
    exchangeRate: db.settings.exchangeRates.EUR,
    lines: [
      { itemId: kursi.id, qty: 24, unitPrice: 135 },
      { itemId: meja.id, qty: 2, unitPrice: 420 },
    ],
    export: {
      incoterm: "FOB",
      portOfLoading: "Tanjung Emas, Semarang",
      portOfDischarge: "Rotterdam",
      destinationCountry: "Belanda",
      containerType: "20GP",
      etd: addDays(today(), 25),
      vLegalNo: "",
      shippingMark: "NORDIC LIVING / AMS / PO-7781",
    },
  });
  confirmSalesOrder(db, so2.id);
  wo5.salesOrderId = so2.id;
  so2.dpPercent = 30;
  so2.paymentDueDate = addDays(today(), 20);
  addPayment(db, "sale", so2.id, { date: dateAgo(5), amount: 1_224, method: "transfer", note: "DP 30% (T/T)" });

  const so3 = createSalesOrder(db, {
    channel: "supply",
    customerId: kopi.id,
    date: dateAgo(7),
    currency: "IDR",
    exchangeRate: 1,
    lines: [
      { itemId: mejaKerja.id, qty: 1, unitPrice: 4_100_000 },
      { itemId: kursi.id, qty: 4, unitPrice: 1_900_000 },
    ],
  });
  confirmSalesOrder(db, so3.id);
  so3.paymentDueDate = dateAgo(1);
  deliverSalesOrder(db, so3.id, [{ itemId: mejaKerja.id, qty: 1 }, { itemId: kursi.id, qty: 4 }], { at: at(4) });
  returnSale(db, so3.id, [{ itemId: kursi.id, qty: 1, condition: "rusak", note: "Kaki goyang saat diterima" }], { at: at(3) });
  addPayment(db, "sale", so3.id, { date: dateAgo(4), amount: 5_000_000, method: "tunai", note: "Bayar sebagian" });

  createSalesOrder(db, {
    channel: "supply",
    customerId: griya.id,
    date: today(),
    currency: "IDR",
    exchangeRate: 1,
    lines: [{ itemId: sofa.id, qty: 1, unitPrice: 8_000_000 }],
    note: "Menunggu konfirmasi desain kain",
  });

  // ---------------------------------------------------------------- Rentals
  const r1 = createRental(db, {
    kind: "sewa",
    customerId: lensa.id,
    project: "Film 'Rumah Nenek' — set ruang makan",
    startDate: dateAgo(9),
    endDate: dateAgo(2),
    lines: [
      { itemId: kursi.id, qty: 4, ratePerDay: 75_000 },
      { itemId: sofa.id, qty: 1, ratePerDay: 350_000 },
    ],
    deposit: 2_000_000,
    extraCharges: [{ label: "Antar-jemput & setting", amount: 350_000 }],
  });
  checkoutRental(db, r1.id, undefined, at(9));

  const r2 = createRental(db, {
    kind: "sewa",
    customerId: kopi.id,
    project: "Pop-up Kopi Senja Car Free Day",
    startDate: dateAgo(14),
    endDate: dateAgo(12),
    lines: [{ itemId: kursi.id, qty: 2, ratePerDay: 75_000 }],
    deposit: 500_000,
  });
  checkoutRental(db, r2.id, undefined, at(14));
  const co = r2.checkouts[0]!;
  returnRental(
    db,
    r2.id,
    [
      { checkoutId: co.id, qty: 1, condition: "baik" },
      { checkoutId: co.id, qty: 1, condition: "rusak", fee: 250_000, note: "Kaki retak, kain sobek" },
    ],
    at(12, 17),
  );

  createRental(db, {
    kind: "pinjam",
    customerId: griya.id,
    project: "Pemotretan katalog Griya Interior",
    startDate: addDays(today(), 3),
    endDate: addDays(today(), 5),
    lines: [{ itemId: meja.id, qty: 1, ratePerDay: 0 }],
  });

  const plyLot = db.lots.find((l) => l.itemId === ply.id && l.status === "tersedia" && !l.isRemnant && l.qty >= 2);
  if (plyLot) transferLot(db, plyLot.id, 2, "Workshop", "Untuk kitchen set minggu depan");

  // ---------------------------------------------------------------- Other routes to the same things
  // Reclaimed teak: bought from a collector, processed, then made into chairs.
  const poBekas = createPurchase(db, {
    supplierId: supBekas.id,
    date: dateAgo(16),
    lines: [{ itemId: bongkaran.id, qty: 0.6, unitPrice: 5_000_000 }],
    extraCosts: [{ label: "Angkut pikap", amount: 150_000 }],
    note: "Bongkaran rumah joglo, Kudus",
  });
  receivePurchase(db, poBekas.id, { at: at(16) });
  const woOlah = createWorkOrderFromRecipe(db, rOlah.id, { batches: 0.4, title: "Olah bongkaran joglo" });
  woOlah.createdAt = at(15);
  issueMaterials(db, woOlah.id, suggestIssue(db, woOlah, bongkaran.id, 0.5).picks, at(15));
  complete(woOlah, 12, { outputs: [{ itemId: reclaimed.id, qty: 0.4 }], returns: [{ itemId: bongkaran.id, kind: "limbah", qty: 0.1 }] });
  const woReclaimed = createWorkOrderFromRecipe(db, rKursiReclaimed.id, { batches: 4, title: "Kursi Sekar 'Jejak Kayu' — sampel" });
  woReclaimed.createdAt = at(11);
  for (const l of rKursiReclaimed.inputs) issueMaterials(db, woReclaimed.id, suggestIssue(db, woReclaimed, l.itemId, l.qty * 4).picks, at(11));
  complete(woReclaimed, 7, { outputs: [{ itemId: kursi.id, qty: 4 }], returns: [] });

  // Bar-stool frames: made in-house by BOM, and part of the need bought from a vendor.
  const poRangka = createPurchase(db, {
    supplierId: supRangka.id,
    date: dateAgo(3),
    lines: [{ itemId: rangka.id, qty: 4, unitPrice: 420_000 }],
    note: "Subkon rangka — kapasitas potong penuh minggu ini",
  });
  receivePurchase(db, poRangka.id, { at: at(3) });

  return db;
}
