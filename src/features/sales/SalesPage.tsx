import { Button, SearchField, Tabs, type Key } from "@heroui/react";
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
  const [q, setQ] = useState("");

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...db.sales]
      .filter((s) => filter === "semua" || s.channel === filter)
      .filter((s) => !term || s.code.toLowerCase().includes(term) || partnerName(s.customerId).toLowerCase().includes(term))
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code))
      .map((s) => ({ ...s, totals: salesTotals(db, s), warnings: exportWarnings(db, s).length }));
  }, [db, filter, q, partnerName]);

  type RowT = SalesOrder & { totals: ReturnType<typeof salesTotals>; warnings: number };
  const columns: Column<RowT>[] = [
    { key: "code", header: "Kode", isRowHeader: true, className: "whitespace-nowrap", cell: (s) => <span className="font-medium">{s.code}</span> },
    { key: "date", header: "Tanggal", className: "whitespace-nowrap", cell: (s) => formatDate(s.date) },
    {
      key: "cust",
      header: "Pelanggan",
      cell: (s) => (
        <div className="min-w-40">
          <p className="font-medium">{partnerName(s.customerId)}</p>
          {s.export && <p className="text-xs text-muted">{s.export.destinationCountry} · {s.export.incoterm} {s.export.portOfDischarge}</p>}
        </div>
      ),
    },
    {
      key: "ch",
      header: "Jalur",
      cell: (s) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusChip tone={s.channel === "ekspor" ? "accent" : "default"}>{SALES_CHANNEL[s.channel]}</StatusChip>
          {s.warnings > 0 && s.status !== "selesai" && s.status !== "batal" && <AlertTriangle className="size-4 text-warning" aria-label="Dokumen belum lengkap" />}
        </span>
      ),
    },
    {
      key: "total",
      header: "Nilai",
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
        title="Penjualan & Ekspor"
        description="Supply domestik dan ekspor. Margin dihitung dari HPP lot yang benar-benar dikirim."
        actions={
          <Button onPress={() => navigate("/penjualan/baru")}>
            <Plus className="size-4" /> Order baru
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter jalur">
              <Tabs.Tab id="semua">
                Semua
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="supply">
                Supply
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="ekspor">
                Ekspor
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <SearchField value={q} onChange={setQ} aria-label="Cari order" className="sm:w-72">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Cari kode atau pelanggan…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>
      <DataTable
        label="Daftar order penjualan"
        columns={columns}
        rows={rows}
        onRowAction={(s) => navigate(`/penjualan/${s.id}`)}
        empty={<EmptyBlock icon={<Ship className="size-5" />} title="Belum ada order" action={<Button onPress={() => navigate("/penjualan/baru")}>Buat order</Button>} />}
      />
    </>
  );
}
