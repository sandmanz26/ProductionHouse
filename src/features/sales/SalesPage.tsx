import { Button, Tabs, type Key } from "@heroui/react";
import { AlertTriangle, Plus, Ship } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { exportWarnings, salesTotals, type SalesOrder } from "@/domain";
import { DataTable, EmptyBlock, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR, formatMoney, formatPct } from "@/lib/format";
import { SALES_CHANNEL, SALES_STATUS } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type Filter = "semua" | "supply" | "ekspor";

export default function SalesPage() {
  const db = useDb();
  const { partnerName } = useLookups();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("semua");

  const rows = useMemo(() => {
    return [...db.sales]
      .filter((s) => filter === "semua" || s.channel === filter)
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code))
      .map((s) => ({ ...s, totals: salesTotals(db, s), warnings: exportWarnings(db, s).length }));
  }, [db, filter]);

  type RowT = SalesOrder & { totals: ReturnType<typeof salesTotals>; warnings: number };
  const columns: Column<RowT>[] = [
    { key: "code", header: "Code", isRowHeader: true, className: "whitespace-nowrap", cell: (s) => <span className="font-medium">{s.code}</span> },
    { key: "date", header: "Date", className: "whitespace-nowrap", cell: (s) => formatDate(s.date) },
    {
      key: "cust",
      header: "Customer",
      cell: (s) => (
        <div className="sm:min-w-40">
          <p className="font-medium">{partnerName(s.customerId)}</p>
          {s.export && <p className="text-xs text-muted">{s.export.destinationCountry} · {s.export.incoterm} {s.export.portOfDischarge}</p>}
        </div>
      ),
    },
    {
      key: "ch",
      header: "Channel",
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusChip tone={s.channel === "ekspor" ? "accent" : "default"}>{SALES_CHANNEL[s.channel]}</StatusChip>
          {s.warnings > 0 && s.status !== "selesai" && s.status !== "batal" && <AlertTriangle className="size-4 text-warning" aria-label="Documents incomplete" />}
        </span>
      ),
    },
    {
      key: "total",
      header: "Value",
      align: "end",
      cell: (s) => (
        <div>
          <p>{formatMoney(s.totals.total, s.currency)}</p>
          {s.currency !== "IDR" && <p className="text-xs text-muted">{formatIDR(s.totals.totalIdr)}</p>}
        </div>
      ),
    },
    { key: "margin", header: "Margin", align: "end", cell: (s) => <span className={s.totals.marginPct < 0.15 ? "text-warning" : ""}>{formatPct(s.totals.marginPct)}</span> },
    { key: "status", header: "Status", cell: (s) => <StatusChip tone={SALES_STATUS[s.status].tone}>{SALES_STATUS[s.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Sales & export"
        description="Domestic supply and export. Margin is calculated from the unit cost of the lots actually shipped."
        actions={
          <Button onPress={() => navigate("/sales/new")}>
            <Plus className="size-4" /> New order
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter channel">
              <Tabs.Tab id="semua">
                All
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="supply">
                Supply
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="ekspor">
                Export
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <DataTable
        toolbar searchText={(s) => `${s.code} ${partnerName(s.customerId)}`}
        label="Sales order list"
        columns={columns}
        rows={rows}
        onRowAction={(s) => navigate(`/sales/${s.id}`)}
        empty={<EmptyBlock icon={<Ship className="size-5" />} title="No orders yet" description="Supply to shops or export by the container — COGS is taken from the product lots shipped." action={<Button onPress={() => navigate("/sales/new")}>Create order</Button>} />}
      />
    </>
  );
}
