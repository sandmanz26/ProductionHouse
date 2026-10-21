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
      header: "Bahan",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-40">
          <p className="font-medium">{item(r.itemId)?.name ?? "?"}</p>
          <p className="text-xs text-muted">{item(r.itemId)?.sku}</p>
        </div>
      ),
    },
    { key: "req", header: "Kebutuhan", align: "end", cell: (r) => formatQty(r.required, item(r.itemId)?.uom) },
    ...(showIssued
      ? [{ key: "issued", header: "Diambil", align: "end" as const, cell: (r: Row) => formatQty(r.issued, item(r.itemId)?.uom) }]
      : []),
    {
      key: "free",
      header: "Stok bebas",
      align: "end",
      cell: (r) => (
        <div>
          <p>{formatQty(r.free, item(r.itemId)?.uom)}</p>
          {r.freeRemnant > 0 && (
            <p className="inline-flex items-center gap-1 text-xs text-success">
              <Recycle className="size-3" /> sisa {formatQty(r.freeRemnant, item(r.itemId)?.uom)}
            </p>
          )}
          {r.reservedForThis > 0 && <p className="text-xs text-accent">dicadangkan {formatQty(r.reservedForThis)}</p>}
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      cell: (r) =>
        r.remaining <= 0 ? (
          <span className="inline-flex items-center gap-1 text-sm text-success">
            <CheckCircle2 className="size-4" /> Lengkap
          </span>
        ) : r.shortage > 0 ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-danger">
            <AlertTriangle className="size-4" /> Kurang {formatQty(r.shortage, item(r.itemId)?.uom)}
          </span>
        ) : (
          <span className="text-sm text-muted">Siap diambil</span>
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
                  Ambil
                </Button>
              ) : null,
          },
        ]
      : []),
  ];
  return <DataTable label="Kebutuhan bahan" columns={columns} rows={rows} dependencies={[onIssue]} />;
}
