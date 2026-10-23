import type { Item, Lot } from "@/domain";
import { formatDims, formatIDR, formatQty } from "@/lib/format";
import { LOT_STATUS } from "@/lib/labels";

export function lotLabel(lot: Lot, item?: Item) {
  const parts = [
    lot.code,
    item ? formatQty(lot.qty, item.uom) : String(lot.qty),
    `unit cost ${formatIDR(lot.unitCost)}`,
    lot.status !== "tersedia" ? LOT_STATUS[lot.status].label : "",
    lot.isRemnant ? "OFFCUT" : "",
    lot.dimensions ? formatDims(lot.dimensions) : "",
  ];
  return parts.filter(Boolean).join(" · ");
}
