import { Button } from "@heroui/react";
import { AlertTriangle, CheckCircle2, Recycle } from "lucide-react";
import type { Requirement } from "@/domain";
import { DataTable, type Column } from "@/components/ui";
import { formatQty } from "@/lib/format";
import { useLookups } from "@/store/db-store";

export function RequirementsTable({
  reqs,
  onIssue,
  showIssued = true,
}: {
  reqs: Requirement[];
  onIssue?: (r: Requirement) => void;
  showIssued?: boolean;
}) {
  const { item } = useLookups();
  type Row = Requirement & { id: string };
  const rows: Row[] = reqs.map((r) => ({ ...r, id: r.itemId }));
  const columns: Column<Row>[] = [
    {
      key: "item",
      header: "Material",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-36">
          <p className="font-medium">{item(r.itemId)?.name ?? "?"}</p>
          <p className="text-xs text-muted">{item(r.itemId)?.sku}</p>
        </div>
      ),
    },
    { key: "req", header: "Needed", align: "end", cell: (r) => formatQty(r.required, item(r.itemId)?.uom) },
    ...(showIssued
      ? [{ key: "issued", header: "Issued", align: "end" as const, cell: (r: Row) => formatQty(r.issued, item(r.itemId)?.uom) }]
      : []),
    {
      key: "free",
      header: "Stock",
      align: "end",
      cell: (r) => (
        <div>
          <p>{formatQty(r.free, item(r.itemId)?.uom)}</p>
          {r.freeRemnant > 0 && (
            <p className="inline-flex items-center gap-1 text-xs text-success">
              <Recycle className="size-3" /> offcut {formatQty(r.freeRemnant, item(r.itemId)?.uom)}
            </p>
          )}
          {r.reservedForThis > 0 && <p className="text-xs text-accent">reserved {formatQty(r.reservedForThis)}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.remaining <= 0 ? (
          <span className="inline-flex items-center gap-1 text-[13px] whitespace-nowrap text-success">
            <CheckCircle2 className="size-3.5" /> Complete
          </span>
        ) : r.shortage > 0 ? (
          <span className="inline-flex items-center gap-1 text-[13px] font-medium whitespace-nowrap text-danger">
            <AlertTriangle className="size-3.5" /> −{formatQty(r.shortage, item(r.itemId)?.uom)}
            {r.producible && <span className="font-normal text-muted">· component</span>}
          </span>
        ) : (
          <span className="text-[13px] whitespace-nowrap text-muted">Ready</span>
        ),
    },
    ...(onIssue
      ? [
          {
            key: "act",
            header: "",
            align: "end" as const,
            cell: (r: Row) =>
              r.remaining > 0 && r.free > 0 ? (
                <Button size="sm" variant="secondary" onPress={() => onIssue(r)}>
                  Issue
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  return <DataTable label="Material requirements" columns={columns} rows={rows} dependencies={[onIssue]} />;
}
