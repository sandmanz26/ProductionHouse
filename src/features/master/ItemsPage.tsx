import { Button, SearchField, Tabs, type Key } from "@heroui/react";
import { Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { standardProductCost, type Item, type ItemKind } from "@/domain";
import { SwitchInput } from "@/components/fields";
import { DataTable, EmptyBlock, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatIDR, formatQty } from "@/lib/format";
import { categoryLabel } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

export default function ItemsPage() {
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind: ItemKind = params.get("jenis") === "material" ? "material" : "product";
  const [q, setQ] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return db.items
      .filter((i) => i.kind === kind && (showArchived || !i.archived))
      .filter((i) => !term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.items, kind, q, showArchived]);

  const nameCol: Column<Item> = {
    key: "name",
    header: kind === "product" ? "Produk" : "Material",
    isRowHeader: true,
    cell: (i) => (
      <div className="min-w-44">
        <p className="font-medium">
          {i.name} {i.archived && <StatusChip tone="default">Diarsipkan</StatusChip>}
        </p>
        <p className="text-xs text-muted">
          {i.sku} · {categoryLabel(i.category)}
        </p>
      </div>
    ),
  };
  const columns: Column<Item>[] =
    kind === "product"
      ? [
          nameCol,
          { key: "bom", header: "BOM", align: "end", cell: (i) => `${i.bom?.length ?? 0} bahan` },
          { key: "labor", header: "Jam kerja", align: "end", cell: (i) => formatQty(i.laborHours ?? 0) },
          { key: "std", header: "HPP standar", align: "end", cell: (i) => formatIDR(standardProductCost(db, i)) },
          { key: "price", header: "Harga jual", align: "end", cell: (i) => (i.salePrice ? formatIDR(i.salePrice) : "—") },
          { key: "rent", header: "Sewa/hari", align: "end", cell: (i) => (i.rentalRatePerDay ? formatIDR(i.rentalRatePerDay) : "—") },
          { key: "stock", header: "Stok", align: "end", cell: (i) => stock.get(i.id)?.total ?? 0 },
        ]
      : [
          nameCol,
          { key: "uom", header: "Satuan", cell: (i) => i.uom },
          { key: "std", header: "Harga terakhir", align: "end", cell: (i) => formatIDR(i.standardCost) },
          { key: "rem", header: "Lacak sisa", cell: (i) => (i.trackRemnant ? <StatusChip tone="success">Ya</StatusChip> : <span className="text-muted">Tidak</span>) },
          { key: "rop", header: "Titik pesan", align: "end", cell: (i) => (i.reorderPoint ? formatQty(i.reorderPoint, i.uom) : "—") },
          { key: "stock", header: "Stok", align: "end", cell: (i) => formatQty(stock.get(i.id)?.available ?? 0, i.uom) },
        ];

  return (
    <>
      <PageHeader
        title="Produk & Material"
        description="Data master: BOM (kebutuhan bahan per produk), harga, tarif sewa, HS code, dan data kemasan untuk ekspor."
        actions={
          <Button onPress={() => navigate(`/master/item/baru?jenis=${kind}`)}>
            <Plus className="size-4" /> {kind === "product" ? "Produk baru" : "Material baru"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={kind} onSelectionChange={(k: Key) => setParams({ jenis: String(k) }, { replace: true })}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Jenis item">
              <Tabs.Tab id="product">
                Produk
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="material">
                Material
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SwitchInput isSelected={showArchived} onChange={setShowArchived} label="Tampilkan arsip" />
          <SearchField value={q} onChange={setQ} aria-label="Cari" className="sm:w-64">
            <SearchField.Group>
              <SearchField.SearchIcon />
              <SearchField.Input placeholder="Cari nama atau kode…" />
              <SearchField.ClearButton />
            </SearchField.Group>
          </SearchField>
        </div>
      </div>
      <DataTable
        label="Daftar item"
        columns={columns}
        rows={rows}
        dependencies={[kind, stock]}
        onRowAction={(i) => navigate(`/master/item/${i.id}`)}
        empty={<EmptyBlock icon={<Package className="size-5" />} title="Belum ada data" action={<Button onPress={() => navigate(`/master/item/baru?jenis=${kind}`)}>Tambah</Button>} />}
      />
    </>
  );
}
