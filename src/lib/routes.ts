import type { DocRef } from "@/domain";

/** Route of the document that caused a stock movement, if it has a screen. */
export function docRoute(ref: DocRef): string | undefined {
  switch (ref.type) {
    case "purchase":
      return `/pembelian/${ref.id}`;
    case "workOrder":
      return `/produksi/${ref.id}`;
    case "sale":
      return `/penjualan/${ref.id}`;
    case "rental":
      return `/sewa/${ref.id}`;
    default:
      return undefined;
  }
}
