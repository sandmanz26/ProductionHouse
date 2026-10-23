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
      header: "Recipe",
      isRowHeader: true,
      cell: (r) => (
        <div className="sm:min-w-44">
          <p className="font-medium">{r.name}</p>
          <p className="text-xs text-muted">{r.code}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", cell: (r) => <Tag>{WO_TYPE[r.type].short}</Tag> },
    {
      key: "flow",
      header: "In → output",
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
      header: "Standard cost / unit",
      align: "end",
      cell: (r) => {
        const main = recipeCost(db, r).outputs[0];
        return main ? formatIDR(main.unitCost) : "—";
      },
    },
    { key: "uses", header: "In use", align: "end", cell: (r) => (uses.get(r.id) ? `${uses.get(r.id)}×` : <span className="text-muted">—</span>) },
    { key: "status", header: "", cell: (r) => (r.archived ? <StatusChip tone="default">Archived</StatusChip> : null) },
  ];

  return (
    <>
      <PageHeader
        title="Recipes"
        description="How to make something, written once and used again: materials, output (more than one is fine), labour hours, stages and the offcuts it usually leaves."
        actions={
          <Button onPress={() => navigate("/recipes/new")}>
            <Plus className="size-4" /> New recipe
          </Button>
        }
      />
      <div className="mb-3 flex justify-end">
        <SwitchInput isSelected={showArchived} onChange={setShowArchived} label="Show archived" />
      </div>
      <DataTable
        label="Recipes"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/recipes/${r.id}`)}
        dependencies={[uses]}
        empty={
          <EmptyBlock
            icon={<BookOpen className="size-5" />}
            title="No recipes yet"
            description="Start with the process you repeat most: one chair model, panels laminated from offcuts, or a dining set."
            action={<Button onPress={() => navigate("/recipes/new")}>Write the first recipe</Button>}
          />
        }
      />
    </>
  );
}
