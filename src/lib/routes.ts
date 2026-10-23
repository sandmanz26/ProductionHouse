import type { DocRef } from "@/domain";

/** Route of the document that caused a stock movement, if it has a screen. */
export function docRoute(ref: DocRef): string | undefined {
  switch (ref.type) {
    case "purchase":
      return `/purchases/${ref.id}`;
    case "workOrder":
      return `/work-orders/${ref.id}`;
    case "sale":
      return `/sales/${ref.id}`;
    case "rental":
      return `/rentals/${ref.id}`;
    default:
      return undefined;
  }
}
