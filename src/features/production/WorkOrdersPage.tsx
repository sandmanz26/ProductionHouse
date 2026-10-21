import { Button, SearchField, Tabs, type Key } from "@heroui/react";
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
  const [q, setQ] = useState("");
  const t = today();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...db.workOrders]
      .filter((w) => (filter === "aktif" ? isOpenWo(w) : filter === "selesai" ? !isOpenWo(w) : true))
      .filter(
        (w) =>
          !term ||
          w.code.toLowerCase().includes(term) ||
          w.title.toLowerCase().includes(term) ||
          w.plannedOutputs.some((o) => item(o.itemId)?.name.toLowerCase().includes(term)),
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [db.workOrders, filter, q, item]);

  const columns: Column<WorkOrder>[] = [
    { key: "code", header: "Kode", cell: (w) => <span className="font-medium">{w.code}</span>, isRowHeader: true },
    {
      key: "type",
      header: "Jenis",
      cell: (w) => <StatusChip tone={WO_TYPE[w.type].tone}>{WO_TYPE[w.type].short}</StatusChip>,
    },
    {
      key: "title",
      header: "Pekerjaan",
      cell: (w) => (
        <div className="min-w-48">
          <p className="truncate font-medium">{w.title}</p>
          <p className="truncate text-xs text-muted">
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
      header: "Target",
      cell: (w) =>
        w.dueDate ? (
          <span className={isOpenWo(w) && w.dueDate < t ? "font-medium text-danger" : ""}>{formatDate(w.dueDate)}</span>
        ) : (
          <span className="text-muted">—</span>
        ),
    },
    {
      key: "hpp",
      header: "HPP total",
      align: "end",
      cell: (w) => (w.cost ? formatIDR(w.cost.total) : <span className="text-muted">—</span>),
    },
  ];

  return (
    <>
      <PageHeader
        title="Produksi"
        description="Perintah kerja untuk produksi baru, konversi produk, dekonstruksi, dan perbaikan. Sisa material dan HPP dihitung otomatis saat pekerjaan diselesaikan."
        actions={
          <Button onPress={() => navigate("/produksi/baru")}>
            <Plus className="size-4" /> Perintah kerja
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="aktif">
                Aktif
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="selesai">
                Riwayat
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="semua">
                Semua
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <SearchField value={q} onChange={setQ} aria-label="Cari perintah kerja" className="sm:w-72">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Cari kode, judul, produk…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>
      <DataTable
        label="Daftar perintah kerja"
        columns={columns}
        rows={rows}
        onRowAction={(w) => navigate(`/produksi/${w.id}`)}
        empty={
          <EmptyBlock
            icon={<Hammer className="size-5" />}
            title={filter === "aktif" ? "Tidak ada produksi aktif" : "Belum ada perintah kerja"}
            description="Mulai dari produksi baru, konversi produk lama, atau bongkar produk menjadi bahan."
            action={<Button onPress={() => navigate("/produksi/baru")}>Buat perintah kerja</Button>}
          />
        }
      />
    </>
  );
}
