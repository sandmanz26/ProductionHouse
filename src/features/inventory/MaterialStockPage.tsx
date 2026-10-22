import { Button, SearchField } from "@heroui/react";
import { Layers, ShoppingCart } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { emptySummary, freeQtyFor, openDemand, sum, type Item, type MaterialCategory, type StockSummary } from "@/domain";
import { SelectInput } from "@/components/fields";
import { DataTable, EmptyBlock, PageHeader, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatIDR, formatIDRCompact, formatQty } from "@/lib/format";
import { MATERIAL_CATEGORY } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type RowT = Item & { s: StockSummary; free: number; demand: number; status: "aman" | "menipis" | "kurang" | "habis" };

export default function MaterialStockPage() {
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("semua");

  const rows = useMemo<RowT[]>(() => {
    const demand = openDemand(db);
    const term = q.trim().toLowerCase();
    return db.items
      .filter((i) => i.kind === "material" && !i.archived)
      .filter((i) => cat === "semua" || i.category === cat)
      .filter((i) => !term || i.name.toLowerCase().includes(term) || i.sku.toLowerCase().includes(term))
      .map((i) => {
        const s = stock.get(i.id) ?? emptySummary(i.id);
        const free = freeQtyFor(db, i.id);
        const d = demand.get(i.id) ?? 0;
        const status: RowT["status"] =
          s.available <= 0 ? "habis" : free < d ? "kurang" : free - d < (i.reorderPoint ?? 0) ? "menipis" : "aman";
        return { ...i, s, free, demand: d, status };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db, stock, q, cat]);

  const totalValue = sum(rows.map((r) => r.s.value));
  const remnantValue = sum(rows.map((r) => r.s.remnantValue));
  const attention = rows.filter((r) => r.status !== "aman").length;

  const STATUS = {
    aman: { label: "Aman", tone: "success" },
    menipis: { label: "Menipis", tone: "warning" },
    kurang: { label: "Kurang untuk produksi", tone: "danger" },
    habis: { label: "Habis", tone: "danger" },
  } as const;

  const columns: Column<RowT>[] = [
    {
      key: "name",
      header: "Material",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">
            {r.sku} · {MATERIAL_CATEGORY[r.category as MaterialCategory] ?? r.category}
          </p>
        </div>
      ),
    },
    {
      key: "avail",
      header: "Tersedia",
      align: "end",
      cell: (r) => (
        <div>
          <p className="font-medium">{formatQty(r.s.available, r.uom)}</p>
          {r.s.remnant > 0 && <p className="text-xs text-success">sisa {formatQty(r.s.remnant, r.uom)}</p>}
          {r.s.reserved > 0 && <p className="text-xs text-accent">dicadangkan {formatQty(r.s.reserved, r.uom)}</p>}
        </div>
      ),
    },
    { key: "demand", header: "Dibutuhkan produksi", align: "end", cell: (r) => (r.demand ? formatQty(r.demand, r.uom) : <span className="text-muted">—</span>) },
    { key: "avg", header: "Harga rata-rata", align: "end", cell: (r) => formatIDR(r.s.avgUnitCost || r.standardCost) },
    { key: "value", header: "Nilai", align: "end", cell: (r) => formatIDR(r.s.value) },
    { key: "status", header: "Status", cell: (r) => <StatusChip tone={STATUS[r.status].tone}>{STATUS[r.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Stok Material"
        description="Tersedia = termasuk sisa material dan stok yang dicadangkan untuk perintah kerja."
        actions={
          <Button variant="secondary" onPress={() => navigate("/pembelian/baru?dari=saran")}>
            <ShoppingCart className="size-4" /> Beli yang menipis
          </Button>
        }
      />
      <MetricStrip className="mb-5" items={[{ label: "Nilai material", value: formatIDRCompact(totalValue) }, { label: "Di antaranya sisa material", value: formatIDRCompact(remnantValue), tone: "success", onPress: () => navigate("/stok/sisa") }, { label: "Perlu perhatian", value: attention, hint: "Menipis, kurang, atau habis", tone: attention ? "warning" : "default" }]} />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row">
        <SearchField value={q} onChange={setQ} aria-label="Cari material" className="sm:w-72">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Cari nama atau kode…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
        <SelectInput
          aria-label="Kategori"
          className="sm:w-56"
          value={cat}
          onChange={setCat}
          options={[{ id: "semua", label: "Semua kategori" }, ...Object.entries(MATERIAL_CATEGORY).map(([id, label]) => ({ id, label }))]}
        />
      </div>
      <DataTable
        label="Stok material"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/stok/item/${r.id}`)}
        empty={<EmptyBlock icon={<Layers className="size-5" />} title="Tidak ada material" description="Tambahkan material di menu Produk & Material." />}
      />
    </>
  );
}
