import { Button, Link } from "@heroui/react";
import { ArrowLeftRight } from "lucide-react";
import { useMemo, useState } from "react";
import type { MoveType, StockMove } from "@/domain";
import { SelectInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { DataTable, EmptyBlock, PageHeader, type Column } from "@/components/ui";
import { formatDateTime, formatIDR, formatQty } from "@/lib/format";
import { MOVE_TYPE } from "@/lib/labels";
import { docRoute } from "@/lib/routes";
import { useDb, useLookups } from "@/store/db-store";

const PAGE = 100;

export function MovesTable({ moves, showItem = true }: { moves: StockMove[]; showItem?: boolean }) {
  const db = useDb();
  const { item } = useLookups();
  const lotCode = useMemo(() => new Map(db.lots.map((l) => [l.id, l.code])), [db.lots]);
  const columns: Column<StockMove>[] = [
    { key: "at", header: "Waktu", isRowHeader: true, className: "whitespace-nowrap", cell: (m) => formatDateTime(m.at) },
    ...(showItem ? [{ key: "item", header: "Item", cell: (m: StockMove) => item(m.itemId)?.name ?? "?" }] : []),
    { key: "lot", header: "Lot", className: "whitespace-nowrap", cell: (m) => lotCode.get(m.lotId) ?? "?" },
    {
      key: "type",
      header: "Jenis",
      cell: (m) => (
        <div>
          <p>{MOVE_TYPE[m.type]}</p>
          {m.note && <p className="text-xs text-muted">{m.note}</p>}
        </div>
      ),
    },
    {
      key: "qty",
      header: "Qty",
      align: "end",
      cell: (m) => (
        <span className={m.qty > 0 ? "text-success" : m.qty < 0 ? "text-danger" : "text-muted"}>
          {m.qty > 0 ? "+" : ""}
          {m.qty === 0 ? "status" : formatQty(m.qty, item(m.itemId)?.uom)}
        </span>
      ),
    },
    { key: "value", header: "Nilai", align: "end", cell: (m) => (m.qty ? formatIDR(m.qty * m.unitCost) : "—") },
    {
      key: "ref",
      header: "Dokumen",
      className: "whitespace-nowrap",
      cell: (m) => {
        const route = docRoute(m.ref);
        return route ? <Link href={route}>{m.ref.code}</Link> : <span className="text-muted">{m.ref.code}</span>;
      },
    },
  ];
  return (
    <DataTable
      label="Mutasi stok"
      columns={columns}
      rows={moves}
      dependencies={[lotCode]}
      empty={<EmptyBlock icon={<ArrowLeftRight className="size-5" />} title="Belum ada mutasi" description="Setiap barang masuk, keluar, dipotong, atau dipindah meninggalkan jejak di sini." />}
    />
  );
}

export default function MovesPage() {
  const db = useDb();
  const [itemId, setItemId] = useState<string | null>(null);
  const [type, setType] = useState("semua");
  const [limit, setLimit] = useState(PAGE);
  const filtered = useMemo(
    () =>
      [...db.moves]
        .filter((m) => (!itemId || m.itemId === itemId) && (type === "semua" || m.type === type))
        .sort((a, b) => b.at.localeCompare(a.at)),
    [db.moves, itemId, type],
  );
  return (
    <>
      <PageHeader title="Mutasi Stok" description="Jejak audit setiap perubahan stok. Tidak bisa diubah manual." />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-[20rem_16rem]">
        <ItemPicker value={itemId} onChange={setItemId} aria-label="Filter item" />
        <SelectInput
          aria-label="Jenis mutasi"
          value={type}
          onChange={setType}
          options={[{ id: "semua", label: "Semua jenis" }, ...(Object.keys(MOVE_TYPE) as MoveType[]).map((t) => ({ id: t, label: MOVE_TYPE[t] }))]}
        />
      </div>
      <MovesTable moves={filtered.slice(0, limit)} />
      {filtered.length > limit && (
        <div className="mt-4 flex justify-center">
          <Button variant="secondary" onPress={() => setLimit(limit + PAGE)}>
            Tampilkan lebih banyak ({filtered.length - limit} lagi)
          </Button>
        </div>
      )}
    </>
  );
}
