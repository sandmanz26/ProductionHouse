import { Button, SearchField, Tabs, type Key } from "@heroui/react";
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
  const [q, setQ] = useState("");

  const woCode = useMemo(() => new Map(db.workOrders.map((w) => [w.id, w.code])), [db.workOrders]);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...db.purchases]
      .filter((p) => filter === "semua" || p.status === filter)
      .filter(
        (p) =>
          !term ||
          p.code.toLowerCase().includes(term) ||
          partnerName(p.supplierId).toLowerCase().includes(term) ||
          p.lines.some((l) => item(l.itemId)?.name.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.date.localeCompare(a.date) || b.code.localeCompare(a.code));
  }, [db.purchases, filter, q, item, partnerName]);

  const columns: Column<Purchase>[] = [
    { key: "code", header: "Kode", isRowHeader: true, className: "whitespace-nowrap", cell: (p) => <span className="font-medium">{p.code}</span> },
    { key: "date", header: "Tanggal", className: "whitespace-nowrap", cell: (p) => formatDate(p.date) },
    { key: "sup", header: "Pemasok", cell: (p) => partnerName(p.supplierId) },
    {
      key: "items",
      header: "Barang",
      cell: (p) => (
        <span className="line-clamp-2 min-w-48 text-sm">
          {p.lines.map((l) => item(l.itemId)?.name ?? "?").join(", ")}
        </span>
      ),
    },
    {
      key: "wo",
      header: "Untuk",
      cell: (p) => (p.workOrderId ? <StatusChip tone="accent">{woCode.get(p.workOrderId) ?? "PK"}</StatusChip> : <span className="text-muted">Stok umum</span>),
    },
    { key: "total", header: "Total", align: "end", cell: (p) => formatIDR(purchaseTotals(p).total) },
    { key: "status", header: "Status", cell: (p) => <StatusChip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Pembelian"
        description="Harga pokok = harga + ongkir (dibagi otomatis). Pembelian khusus proyek dicadangkan sampai proyek selesai."
        actions={
          <Button onPress={() => navigate("/pembelian/baru")}>
            <Plus className="size-4" /> Pembelian baru
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="semua">
                Semua
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="draft">
                Menunggu barang
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="diterima">
                Diterima
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <SearchField value={q} onChange={setQ} aria-label="Cari pembelian" className="sm:w-72">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Cari kode, pemasok, barang…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>
      <DataTable
        label="Daftar pembelian"
        columns={columns}
        rows={rows}
        onRowAction={(p) => navigate(`/pembelian/${p.id}`)}
        empty={
          <EmptyBlock
            icon={<ShoppingCart className="size-5" />}
            title="Belum ada pembelian"
            action={<Button onPress={() => navigate("/pembelian/baru")}>Catat pembelian</Button>}
          />
        }
      />
    </>
  );
}
