import { Button, Tabs, type Key } from "@heroui/react";
import { Hammer, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { isOpenWo, today, type WorkOrder } from "@/domain";
import { DataTable, EmptyBlock, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR, formatQty } from "@/lib/format";
import { WO_STATUS, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type Filter = "aktif" | "selesai" | "semua";

export default function WorkOrdersPage() {
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("aktif");
  const t = today();

  const rows = useMemo(() => {
    return [...db.workOrders]
      .filter((w) => (filter === "aktif" ? isOpenWo(w) : filter === "selesai" ? !isOpenWo(w) : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db.workOrders, filter]);

  const columns: Column<WorkOrder>[] = [
    { key: "code", header: "Code", cell: (w) => <span className="font-medium">{w.code}</span>, isRowHeader: true },
    {
      key: "type",
      header: "Type",
      cell: (w) => <StatusChip tone={WO_TYPE[w.type].tone}>{WO_TYPE[w.type].short}</StatusChip>,
    },
    {
      key: "title",
      header: "Job",
      cell: (w) => (
        <div className="sm:min-w-48">
          <p className="line-clamp-2 font-medium">{w.title}</p>
          <p className="line-clamp-2 text-xs text-muted">
            {(w.status === "selesai" ? w.outputs : w.plannedOutputs)
              .map((o) => `${formatQty(o.qty, item(o.itemId)?.uom)} ${item(o.itemId)?.name ?? ""}`)
              .join(", ") || "—"}
          </p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (w) => <StatusChip tone={WO_STATUS[w.status].tone}>{WO_STATUS[w.status].label}</StatusChip> },
    {
      key: "due",
      header: "Due",
      cell: (w) =>
        w.dueDate ? (
          <span className={isOpenWo(w) && w.dueDate < t ? "font-medium text-danger" : ""}>{formatDate(w.dueDate)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "hpp",
      header: "Total cost",
      align: "end",
      cell: (w) => (w.cost ? formatIDR(w.cost.total) : <span className="text-muted">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Production"
        description="Production, conversion, dismantling and repair. Job cost is calculated when the job is closed."
        actions={
          <Button onPress={() => navigate("/work-orders/new")}>
            <Plus className="size-4" /> Work order
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="aktif">
                Active
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="selesai">
                History
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="semua">
                All
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <DataTable
        toolbar searchText={(w) => `${w.code} ${w.title} ${w.plannedOutputs.map((o) => item(o.itemId)?.name ?? "").join(" ")}`}
        label="Work order list"
        columns={columns}
        rows={rows}
        onRowAction={(w) => navigate(`/work-orders/${w.id}`)}
        empty={
          <EmptyBlock
            icon={<Hammer className="size-5" />}
            title={filter === "aktif" ? "No active work orders" : "No work orders yet"}
            description="Start a new production run, convert an old product, or dismantle a product into materials."
            action={<Button onPress={() => navigate("/work-orders/new")}>Create work order</Button>}
          />
        }
      />
    </>
  );
}
