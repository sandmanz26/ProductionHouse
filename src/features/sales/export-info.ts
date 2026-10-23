import type { ExportInfo, Incoterm } from "@/domain";

export const INCOTERMS: { id: Incoterm; label: string; description: string }[] = [
  { id: "EXW", label: "EXW", description: "Ex Works — buyer collects at the warehouse" },
  { id: "FCA", label: "FCA", description: "Free Carrier" },
  { id: "FOB", label: "FOB", description: "Free on Board — up to the ship at the port of loading" },
  { id: "CFR", label: "CFR", description: "Cost & Freight" },
  { id: "CIF", label: "CIF", description: "Cost, Insurance & Freight" },
  { id: "DAP", label: "DAP", description: "Delivered at Place" },
  { id: "DDP", label: "DDP", description: "Delivered Duty Paid" },
];

export const emptyExport = (): ExportInfo => ({
  incoterm: "FOB",
  portOfLoading: "Tanjung Emas, Semarang",
  portOfDischarge: "",
  destinationCountry: "",
  containerType: "20GP",
});
