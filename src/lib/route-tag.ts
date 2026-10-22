import type { RouteKind } from "@/domain";

/** How each kind of production route is labelled and coloured on the route map. */
export const ROUTE_TAG: Record<RouteKind, { tag: string; color: string; legend: string }> = {
  bom: { tag: "BUAT", color: "var(--accent)", legend: "Buat sendiri (BOM / resep)" },
  resep: { tag: "RESEP", color: "var(--accent)", legend: "Buat sendiri (BOM / resep)" },
  beli: { tag: "BELI", color: "var(--flow-biaya)", legend: "Beli dari pemasok" },
  bongkar: { tag: "BONGKAR", color: "var(--flow-sisa)", legend: "Hasil bongkar / daur ulang" },
  riwayat: { tag: "PERNAH", color: "var(--flow-netral)", legend: "Konversi / gabung yang pernah dilakukan" },
};
