import { Button, Link } from "@heroui/react";
import { Archive, Hammer, Pencil, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { recipeCost, recipeFlow, recipePerformance, removeRecipe, restoreRecipe, type RecipeRun } from "@/domain";
import { NumberInput } from "@/components/fields";
import { FlowDiagram } from "@/components/FlowDiagram";
import { RecordNotFound } from "@/components/NotFound";
import { ConfirmButton, DataTable, EmptyBlock, KeyValue, MetricStrip, PageHeader, Row, Section, StatusChip, Tag, type Column } from "@/components/ui";
import { formatIDR, formatPct, formatQty, UOM_LABEL } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export default function RecipeDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [batches, setBatches] = useState(1);
  const r = db.recipes.find((x) => x.id === id);
  const flow = useMemo(() => (r ? recipeFlow(db, r, batches || 1) : null), [db, r, batches]);
  const cost = useMemo(() => (r ? recipeCost(db, r, batches || 1) : null), [db, r, batches]);
  const perf = useMemo(() => (r ? recipePerformance(db, r.id) : null), [db, r]);
  if (!r || !flow || !cost || !perf) return <RecordNotFound what="Recipe" back="/recipes" />;
  const main = item(r.outputs[0]?.itemId);

  const runCols: Column<RecipeRun & { id: string }>[] = [
    { key: "wo", header: "Job", isRowHeader: true, cell: (x) => <Link href={`/work-orders/${x.woId}`}>{x.code}</Link> },
    { key: "b", header: "Batch", align: "end", cell: (x) => formatQty(x.batches) },
    { key: "yield", header: "Output vs plan", align: "end", cell: (x) => <span className={x.yield < 0.98 ? "text-danger" : undefined}>{formatPct(x.yield, 0)}</span> },
    { key: "mat", header: "Material usage", align: "end", cell: (x) => <span className={x.materialUse > 1.05 ? "text-danger" : x.materialUse < 0.97 ? "text-success" : undefined}>{formatPct(x.materialUse, 0)}</span> },
    { key: "sisa", header: "Offcuts returned", align: "end", cell: (x) => `${formatQty(x.remnantPct)}%` },
    { key: "hpp", header: `Unit cost / ${main ? UOM_LABEL[main.uom] : "unit"}`, align: "end", cell: (x) => formatIDR(x.unitCost) },
    { key: "std", header: "Standard", align: "end", cell: (x) => <span className="text-muted">{formatIDR(x.standardUnitCost)}</span> },
  ];

  return (
    <>
      <PageHeader
        back="/recipes"
        title={r.name}
        badge={
          <>
            <Tag>{WO_TYPE[r.type].label}</Tag>
            {r.archived && <StatusChip tone="default">Archived</StatusChip>}
          </>
        }
        description={`${r.code} · quantities per batch · ${r.laborHours} labour hours`}
        actions={
          <>
            {r.archived ? (
              <Button variant="secondary" onPress={() => run((d) => restoreRecipe(d, r.id), "Recipe restored")}>
                <RotateCcw className="size-4" /> Restore
              </Button>
            ) : (
              <ConfirmButton
                variant="ghost"
                title={`Delete ${r.name}?`}
                description="A recipe already used by a work order is archived, not deleted, so its history stays readable."
                confirmLabel="Delete / archive"
                onConfirm={() => {
                  const res = run((d) => removeRecipe(d, r.id), (x) => (x === "deleted" ? "Recipe deleted" : "Recipe archived"));
                  if (res === "deleted") navigate("/recipes", { replace: true });
                }}
              >
                <Archive className="size-4" /> Delete
              </ConfirmButton>
            )}
            <Button variant="secondary" onPress={() => navigate(`/recipes/${r.id}/edit`)}>
              <Pencil className="size-4" /> Edit
            </Button>
            {!r.archived && (
              <Button onPress={() => navigate(`/work-orders/new?recipe=${r.id}`)}>
                <Hammer className="size-4" /> Create work order
              </Button>
            )}
          </>
        }
      />

      <MetricStrip
        className="mb-6"
        items={[
          { label: "Standard cost", value: formatIDR(cost.outputs[0]?.unitCost ?? 0), hint: main ? `per ${UOM_LABEL[main.uom]} ${main.name}` : undefined },
          { label: "Used", value: `${perf.runs.length}×`, hint: "jobs completed" },
          { label: "Output vs plan", value: perf.runs.length ? formatPct(perf.avgYield, 0) : "—", tone: perf.runs.length && perf.avgYield < 0.98 ? "danger" : "default" },
          { label: "Material usage", value: perf.runs.length ? formatPct(perf.avgMaterialUse, 0) : "—", hint: "100% = as per recipe", tone: perf.avgMaterialUse > 1.05 ? "danger" : "default" },
        ]}
      />

      <Section
        title="Recipe map"
        description="At standard cost. Change the number of batches to see the job at scale."
        actions={
          <div className="w-28">
            <NumberInput aria-label="Number of batches" value={batches} onChange={setBatches} suffix="batch" maximumFractionDigits={2} />
          </div>
        }
        className="mb-6"
        bodyClassName="p-0"
      >
        <FlowDiagram graph={flow} label={`Recipe map ${r.name}`} />
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="Usage history" description="Each completed job compared with the recipe — a sign of when the recipe needs updating." className="xl:col-span-2" bodyClassName="p-0">
          <DataTable
            label="Recipe usage history"
            columns={runCols}
            rows={perf.runs.map((x) => ({ ...x, id: x.woId }))}
            empty={<EmptyBlock title="Not used on a completed job yet" description="Create a work order from this recipe; its results are compared here." />}
          />
        </Section>
        <Section title={`Standard cost · ${formatQty(batches)} batch`}>
          <Row label="Materials" value={formatIDR(cost.material)} />
          {cost.remnantCredit > 0 && <Row label={`− expected offcuts (${r.expectedRemnantPct}%)`} value={formatIDR(cost.remnantCredit)} muted />}
          <Row label="Labour" value={formatIDR(cost.labor)} />
          <Row label="Overhead" value={formatIDR(cost.overhead)} />
          <div className="my-2 border-t border-[var(--rule)]" />
          <Row label="Total" value={formatIDR(cost.total)} strong />
          <div className="mt-4">
            <KeyValue
              columns={1}
              items={[
                ["Stages", r.stages.length ? r.stages.join(" → ") : "Default route"],
                ["Expected waste", `${r.expectedWastePct}% of material qty`],
                ["Note", r.note],
              ]}
            />
          </div>
        </Section>
      </div>
    </>
  );
}
