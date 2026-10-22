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
  if (!r || !flow || !cost || !perf) return <RecordNotFound what="Resep" back="/resep" />;
  const main = item(r.outputs[0]?.itemId);

  const runCols: Column<RecipeRun & { id: string }>[] = [
    { key: "wo", header: "Pekerjaan", isRowHeader: true, cell: (x) => <Link href={`/produksi/${x.woId}`}>{x.code}</Link> },
    { key: "b", header: "Batch", align: "end", cell: (x) => formatQty(x.batches) },
    { key: "yield", header: "Hasil vs rencana", align: "end", cell: (x) => <span className={x.yield < 0.98 ? "text-danger" : undefined}>{formatPct(x.yield, 0)}</span> },
    { key: "mat", header: "Pemakaian bahan", align: "end", cell: (x) => <span className={x.materialUse > 1.05 ? "text-danger" : x.materialUse < 0.97 ? "text-success" : undefined}>{formatPct(x.materialUse, 0)}</span> },
    { key: "sisa", header: "Sisa kembali", align: "end", cell: (x) => `${formatQty(x.remnantPct)}%` },
    { key: "hpp", header: `HPP / ${main ? UOM_LABEL[main.uom] : "unit"}`, align: "end", cell: (x) => formatIDR(x.unitCost) },
    { key: "std", header: "Standar", align: "end", cell: (x) => <span className="text-muted">{formatIDR(x.standardUnitCost)}</span> },
  ];

  return (
    <>
      <PageHeader
        back="/resep"
        title={r.name}
        badge={
          <>
            <Tag>{WO_TYPE[r.type].label}</Tag>
            {r.archived && <StatusChip tone="default">Diarsipkan</StatusChip>}
          </>
        }
        description={`${r.code} · jumlah per batch · ${r.laborHours} jam kerja`}
        actions={
          <>
            {r.archived ? (
              <Button variant="secondary" onPress={() => run((d) => restoreRecipe(d, r.id), "Resep dipulihkan")}>
                <RotateCcw className="size-4" /> Pulihkan
              </Button>
            ) : (
              <ConfirmButton
                variant="ghost"
                title={`Hapus ${r.name}?`}
                description="Resep yang sudah dipakai perintah kerja diarsipkan, bukan dihapus, agar riwayatnya tetap terbaca."
                confirmLabel="Hapus / arsipkan"
                onConfirm={() => {
                  const res = run((d) => removeRecipe(d, r.id), (x) => (x === "deleted" ? "Resep dihapus" : "Resep diarsipkan"));
                  if (res === "deleted") navigate("/resep", { replace: true });
                }}
              >
                <Archive className="size-4" /> Hapus
              </ConfirmButton>
            )}
            <Button variant="secondary" onPress={() => navigate(`/resep/${r.id}/ubah`)}>
              <Pencil className="size-4" /> Ubah
            </Button>
            {!r.archived && (
              <Button onPress={() => navigate(`/produksi/baru?resep=${r.id}`)}>
                <Hammer className="size-4" /> Buat perintah kerja
              </Button>
            )}
          </>
        }
      />

      <MetricStrip
        className="mb-6"
        items={[
          { label: "HPP standar", value: formatIDR(cost.outputs[0]?.unitCost ?? 0), hint: main ? `per ${UOM_LABEL[main.uom]} ${main.name}` : undefined },
          { label: "Dipakai", value: `${perf.runs.length}×`, hint: "pekerjaan selesai" },
          { label: "Hasil vs rencana", value: perf.runs.length ? formatPct(perf.avgYield, 0) : "—", tone: perf.runs.length && perf.avgYield < 0.98 ? "danger" : "default" },
          { label: "Pemakaian bahan", value: perf.runs.length ? formatPct(perf.avgMaterialUse, 0) : "—", hint: "100% = sesuai resep", tone: perf.avgMaterialUse > 1.05 ? "danger" : "default" },
        ]}
      />

      <Section
        title="Peta resep"
        description="Pada harga standar. Ubah jumlah batch untuk melihat skala pekerjaan."
        actions={
          <div className="w-28">
            <NumberInput aria-label="Jumlah batch" value={batches} onChange={setBatches} suffix="batch" maximumFractionDigits={2} />
          </div>
        }
        className="mb-6"
        bodyClassName="p-0"
      >
        <FlowDiagram graph={flow} label={`Peta resep ${r.name}`} />
      </Section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section title="Riwayat pemakaian" description="Setiap pekerjaan selesai dibandingkan dengan resep — tanda resep perlu diperbarui." className="xl:col-span-2" bodyClassName="p-0">
          <DataTable
            label="Riwayat pemakaian resep"
            columns={runCols}
            rows={perf.runs.map((x) => ({ ...x, id: x.woId }))}
            empty={<EmptyBlock title="Belum pernah dipakai sampai selesai" description="Buat perintah kerja dari resep ini; hasilnya akan dibandingkan di sini." />}
          />
        </Section>
        <Section title={`Biaya standar · ${formatQty(batches)} batch`}>
          <Row label="Bahan" value={formatIDR(cost.material)} />
          {cost.remnantCredit > 0 && <Row label={`− perkiraan sisa (${r.expectedRemnantPct}%)`} value={formatIDR(cost.remnantCredit)} muted />}
          <Row label="Tenaga kerja" value={formatIDR(cost.labor)} />
          <Row label="Overhead" value={formatIDR(cost.overhead)} />
          <div className="my-2 border-t border-[var(--rule)]" />
          <Row label="Total" value={formatIDR(cost.total)} strong />
          <div className="mt-4">
            <KeyValue
              columns={1}
              items={[
                ["Tahapan", r.stages.length ? r.stages.join(" → ") : "Rute default"],
                ["Perkiraan limbah", `${r.expectedWastePct}% dari qty bahan`],
                ["Catatan", r.note],
              ]}
            />
          </div>
        </Section>
      </div>
    </>
  );
}
