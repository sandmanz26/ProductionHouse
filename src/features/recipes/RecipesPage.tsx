import { Button } from "@heroui/react";
import { BookOpen, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { recipeCost, type Recipe } from "@/domain";
import { SwitchInput } from "@/components/fields";
import { DataTable, EmptyBlock, PageHeader, StatusChip, Tag, type Column } from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

export default function RecipesPage() {
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const rows = useMemo(() => db.recipes.filter((r) => showArchived || !r.archived), [db.recipes, showArchived]);
  const uses = useMemo(() => {
    const m = new Map<string, number>();
    for (const w of db.workOrders) if (w.recipeId) m.set(w.recipeId, (m.get(w.recipeId) ?? 0) + 1);
    return m;
  }, [db.workOrders]);

  const columns: Column<Recipe>[] = [
    {
      key: "name",
      header: "Resep",
      isRowHeader: true,
      cell: (r) => (
        <div className="sm:min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">{r.code}</p>
        </div>
      ),
    },
    { key: "type", header: "Jenis", cell: (r) => <Tag>{WO_TYPE[r.type].short}</Tag> },
    {
      key: "flow",
      header: "Masuk → hasil",
      cell: (r) => (
        <p className="text-[13px] break-words sm:min-w-56">
          <span className="text-muted">{r.inputs.map((l) => item(l.itemId)?.name).join(" + ")}</span>
          <span className="mx-1.5 text-muted">→</span>
          {r.outputs.map((o) => `${o.qty} ${item(o.itemId)?.name}`).join(" + ")}
        </p>
      ),
    },
    {
      key: "cost",
      header: "HPP standar / unit",
      align: "end",
      cell: (r) => {
        const main = recipeCost(db, r).outputs[0];
        return main ? formatIDR(main.unitCost) : "—";
      },
    },
    { key: "uses", header: "Dipakai", align: "end", cell: (r) => (uses.get(r.id) ? `${uses.get(r.id)}×` : <span className="text-muted">—</span>) },
    { key: "status", header: "", cell: (r) => (r.archived ? <StatusChip tone="default">Diarsipkan</StatusChip> : null) },
  ];

  return (
    <>
      <PageHeader
        title="Resep proses"
        description="Cara membuat sesuatu, sekali ditulis dan dipakai berulang: bahan, hasil (boleh lebih dari satu), jam kerja, tahapan, dan sisa yang biasanya jatuh."
        actions={
          <Button onPress={() => navigate("/resep/baru")}>
            <Plus className="size-4" /> Resep baru
          </Button>
        }
      />
      <div className="mb-3 flex justify-end">
        <SwitchInput isSelected={showArchived} onChange={setShowArchived} label="Tampilkan yang diarsipkan" />
      </div>
      <DataTable
        label="Resep proses"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/resep/${r.id}`)}
        dependencies={[uses]}
        empty={
          <EmptyBlock
            icon={<BookOpen className="size-5" />}
            title="Belum ada resep"
            description="Mulai dari proses yang paling sering diulang: satu jenis kursi, laminasi panel dari potongan sisa, atau set meja makan."
            action={<Button onPress={() => navigate("/resep/baru")}>Tulis resep pertama</Button>}
          />
        }
      />
    </>
  );
}
