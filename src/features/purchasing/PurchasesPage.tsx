import { Button, Tabs, type Key } from "@heroui/react";
import { Plus, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { purchaseTotals, type Purchase } from "@/domain";
import { DataTable, EmptyBlock, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR } from "@/lib/format";
import { PURCHASE_STATUS } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type Filter = "draft" | "diterima" | "semua";

export default function PurchasesPage() {
  const db = useDb();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("semua");

  const woCode = useMemo(() => new Map(db.workOrders.map((w) => [w.id, w.code])), [db.workOrders]);

  const rows = useMemo(() => {
    return [...db.purchases]
      .filter((p) => filter === "semua" || p.status === filter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  }, [db.purchases, filter]);

  const columns: Column<Purchase>[] = [
    { key: "code", header: "Code", isRowHeader: true, className: "whitespace-nowrap", cell: (p) => <span className="font-medium">{p.code}</span> },
    { key: "date", header: "Date", className: "whitespace-nowrap", cell: (p) => formatDate(p.date) },
    { key: "sup", header: "Supplier", cell: (p) => partnerName(p.supplierId) },
    {
      key: "items",
      header: "Items",
      cell: (p) => (
        <span className="line-clamp-2 min-w-48 text-sm">
          {p.lines.map((l) => item(l.itemId)?.name ?? "?").join(", ")}
        </span>
      ),
    },
    {
      key: "wo",
      header: "For",
      cell: (p) => (p.workOrderId ? <StatusChip tone="accent">{woCode.get(p.workOrderId) ?? "WO"}</StatusChip> : <span className="text-muted">General stock</span>),
    },
    { key: "total", header: "Total", align: "end", cell: (p) => formatIDR(purchaseTotals(p).total) },
    { key: "status", header: "Status", cell: (p) => <StatusChip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Purchasing"
        description="Unit cost = price + freight (split automatically). Purchases for a specific job stay reserved until the job is done."
        actions={
          <Button onPress={() => navigate("/purchases/new")}>
            <Plus className="size-4" /> New purchase
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="semua">
                All
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="draft">
                Awaiting delivery
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="diterima">
                Received
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <DataTable
        toolbar searchText={(p) => `${p.code} ${partnerName(p.supplierId)} ${p.lines.map((l) => item(l.itemId)?.name ?? "").join(" ")}`}
        label="Purchase list"
        columns={columns}
        rows={rows}
        onRowAction={(p) => navigate(`/purchases/${p.id}`)}
        empty={
          <EmptyBlock
            icon={<ShoppingCart className="size-5" />}
            title="No purchases yet"
            action={<Button onPress={() => navigate("/purchases/new")}>Record a purchase</Button>}
          />
        }
      />
    </>
  );
}
