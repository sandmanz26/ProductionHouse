import type { RouteKind } from "@/domain";

/** How each kind of production route is labelled and coloured on the route map. */
export const ROUTE_TAG: Record<RouteKind, { tag: string; color: string; legend: string }> = {
  bom: { tag: "MAKE", color: "var(--accent)", legend: "Made in-house (BOM / recipe)" },
  resep: { tag: "RECIPE", color: "var(--accent)", legend: "Made in-house (BOM / recipe)" },
  beli: { tag: "BUY", color: "var(--flow-biaya)", legend: "Bought from a supplier" },
  bongkar: { tag: "DISMANTLE", color: "var(--flow-sisa)", legend: "Dismantled / recycled" },
  riwayat: { tag: "PAST", color: "var(--flow-netral)", legend: "Conversions / merges done before" },
};
