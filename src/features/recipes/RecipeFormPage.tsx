import { Button, Card } from "@heroui/react";
import { Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { createRecipe, recipeCost, recipeFlow, transact, updateRecipe, type ID, type Recipe, type RecipeInput, type RecipeType } from "@/domain";
import { NumberInput, TextAreaInput, TextInput } from "@/components/fields";
import { FlowDiagram } from "@/components/FlowDiagram";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, UOM_LABEL } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

const TYPES: RecipeType[] = ["produksi", "konversi", "gabung", "dekonstruksi"];

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  sharePct?: number;
}
let seq = 0;
const line = (itemId: ID | null = null, qty = 1, sharePct?: number): Line => ({ key: `r${++seq}`, itemId, qty, sharePct });

export default function RecipeFormPage() {
  const { id } = useParams();
  const db = useDb();
  const r = id ? db.recipes.find((x) => x.id === id) : undefined;
  if (id && !r) return <RecordNotFound what="Resep" back="/resep" />;
  return <RecipeForm key={id ?? "new"} existing={r} />;
}

function RecipeForm({ existing }: { existing?: Recipe }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [name, setName] = useState(existing?.name ?? "");
  const [type, setType] = useState<RecipeType>(existing?.type ?? "produksi");
  const [inputs, setInputs] = useState<Line[]>(existing?.inputs.map((l) => line(l.itemId, l.qty)) ?? [line()]);
  const [outputs, setOutputs] = useState<Line[]>(existing?.outputs.map((o) => line(o.itemId, o.qty, o.sharePct)) ?? [line()]);
  const [fixedShares, setFixedShares] = useState(existing?.outputs.some((o) => o.sharePct !== undefined) ?? false);
  const [remnantPct, setRemnantPct] = useState(existing?.expectedRemnantPct ?? 0);
  const [wastePct, setWastePct] = useState(existing?.expectedWastePct ?? 0);
  const [laborHours, setLaborHours] = useState(existing?.laborHours ?? 0);
  const [stages, setStages] = useState(existing?.stages.join(", ") ?? "");
  const [note, setNote] = useState(existing?.note ?? "");

  const input: RecipeInput = {
    name,
    type,
    inputs: inputs.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty })),
    outputs: outputs.filter((o) => o.itemId).map((o) => ({ itemId: o.itemId!, qty: o.qty, sharePct: fixedShares ? (o.sharePct ?? 0) : undefined })),
    expectedRemnantPct: remnantPct,
    expectedWastePct: wastePct,
    laborHours,
    stages: stages.split(",").map((s) => s.trim()).filter(Boolean),
    note,
  };

  // Validate by running the real operation on a copy: the preview shows exactly what saving would.
  const inputKey = JSON.stringify(input);
  const preview = useMemo(() => {
    const draft = { ...(JSON.parse(inputKey) as RecipeInput) };
    if (!draft.inputs.length || !draft.outputs.length) return null;
    draft.name = draft.name.trim() || "Pratinjau";
    try {
      return transact(db, (d) => {
        const r = existing ? updateRecipe(d, existing.id, draft) : createRecipe(d, draft);
        return { flow: recipeFlow(d, r), cost: recipeCost(d, r) };
      }).result;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [db, inputKey, existing]);

  const save = () => {
    const saved = run((d) => (existing ? updateRecipe(d, existing.id, input) : createRecipe(d, input)), (r) => `Resep ${r.code} disimpan`);
    if (saved) navigate(`/resep/${saved.id}`, { replace: true });
  };

  return (
    <>
      <PageHeader back={existing ? `/resep/${existing.id}` : "/resep"} title={existing ? `Ubah ${existing.name}` : "Resep baru"} description="Jumlah ditulis per satu batch. Saat dipakai, perintah kerja mengalikannya." />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Identitas">
            <div className="flex flex-col gap-4">
              <TextInput label="Nama resep" value={name} onChange={setName} placeholder="mis. Kursi Sekar — potong efisien" isRequired />
              <div role="radiogroup" aria-label="Jenis proses" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={type === t}
                    onClick={() => {
                      setType(t);
                      if (t === "gabung") setOutputs(outputs.slice(0, 1));
                    }}
                    className={`rounded-sm border px-3 py-2 text-left text-[13px] transition-colors ${type === t ? "border-accent bg-surface font-medium" : "border-[var(--rule)] text-muted hover:text-foreground"}`}
                  >
                    {WO_TYPE[t].label}
                  </button>
                ))}
              </div>
              <p className="-mt-2 text-xs text-muted">{WO_TYPE[type].description}</p>
            </div>
          </Section>

          <Section title="Bahan masuk" description={type === "gabung" ? "Barang yang disatukan — produk, komponen, sisa, atau bahan." : "Per satu batch."}>
            <Lines lines={inputs} onChange={setInputs} addLabel="Tambah bahan" />
          </Section>

          <Section
            title="Hasil"
            description={type === "gabung" ? "Satu jenis barang hasil gabungan." : "Boleh lebih dari satu, mis. papan → daun meja + kaki + potongan untuk laci."}
          >
            <Lines lines={outputs} onChange={setOutputs} addLabel="Tambah hasil" single={type === "gabung"} shares={fixedShares} />
            {type !== "gabung" && outputs.length > 1 && (
              <label className="mt-3 flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={fixedShares} onChange={(e) => setFixedShares(e.target.checked)} className="accent-[var(--accent)]" />
                Bagi biaya dengan porsi tetap (%) — bila tidak, dibagi menurut harga jual / harga standar
              </label>
            )}
          </Section>

          <Section title="Proses">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <NumberInput label="Jam kerja per batch" value={laborHours} onChange={setLaborHours} suffix="jam" />
              <NumberInput label="Perkiraan sisa layak" value={remnantPct} onChange={setRemnantPct} suffix="%" maxValue={99} description="Dari nilai bahan; kembali ke gudang." />
              <NumberInput label="Perkiraan limbah" value={wastePct} onChange={setWastePct} suffix="%" maxValue={99} description="Dari qty bahan; untuk perencanaan." />
            </div>
            <div className="mt-3 flex flex-col gap-3">
              <TextInput label="Tahapan" value={stages} onChange={setStages} placeholder={db.settings.defaultStages.join(", ")} description="Pisahkan dengan koma. Kosong = rute default." />
              <TextAreaInput label="Catatan untuk tukang" value={note} onChange={setNote} rows={2} placeholder="Arah serat, toleransi ukuran, jenis lem…" />
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-6 xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Biaya standar per batch</Card.Title>
              <Card.Description>Dari harga standar bahan dan tarif di Pengaturan.</Card.Description>
            </Card.Header>
            <Card.Content>
              {preview && "cost" in preview ? (
                <>
                  <Row label="Bahan" value={formatIDR(preview.cost.material)} />
                  {preview.cost.remnantCredit > 0 && <Row label="− perkiraan sisa" value={formatIDR(preview.cost.remnantCredit)} muted />}
                  <Row label="Tenaga kerja" value={formatIDR(preview.cost.labor)} />
                  <Row label="Overhead" value={formatIDR(preview.cost.overhead)} />
                  <div className="my-2 border-t border-[var(--rule)]" />
                  <Row label="Total" value={formatIDR(preview.cost.total)} strong />
                  {preview.cost.outputs.map((o) => (
                    <Row key={o.itemId} label={`${item(o.itemId)?.name} / ${UOM_LABEL[item(o.itemId)?.uom ?? "pcs"]}`} value={formatIDR(o.unitCost)} muted />
                  ))}
                </>
              ) : (
                <p className="text-sm text-muted">{preview && "error" in preview ? preview.error : "Isi bahan dan hasil."}</p>
              )}
            </Card.Content>
            <Card.Footer>
              <Button fullWidth onPress={save} isDisabled={!preview || "error" in preview || !name.trim()}>
                Simpan resep
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>

      {preview && "flow" in preview && (
        <Section title="Peta resep" description="Pratinjau satu batch pada harga standar." className="mt-6" bodyClassName="p-0">
          <FlowDiagram graph={preview.flow} label="Pratinjau peta resep" />
        </Section>
      )}
    </>
  );
}

function Lines({ lines, onChange, addLabel, single, shares }: { lines: Line[]; onChange: (l: Line[]) => void; addLabel: string; single?: boolean; shares?: boolean }) {
  const { item } = useLookups();
  const update = (key: string, patch: Partial<Line>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div className="flex flex-col gap-2">
      {lines.map((l) => (
        <div key={l.key} className={`grid items-end gap-2 ${shares ? "grid-cols-[1fr_7rem_6rem_auto]" : "grid-cols-[1fr_7.5rem_auto]"}`}>
          <ItemPicker value={l.itemId} onChange={(itemId) => update(l.key, { itemId })} aria-label="Barang" />
          <NumberInput aria-label="Qty per batch" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix={l.itemId ? UOM_LABEL[item(l.itemId)?.uom ?? "pcs"] : undefined} />
          {shares && <NumberInput aria-label="Porsi biaya" value={l.sharePct ?? 0} onChange={(sharePct) => update(l.key, { sharePct })} suffix="%" maxValue={100} />}
          <Button isIconOnly variant="ghost" aria-label="Hapus baris" isDisabled={lines.length === 1} onPress={() => onChange(lines.filter((x) => x.key !== l.key))}>
            <Trash2 className="size-4" />
          </Button>
        </div>
      ))}
      {!single && (
        <div>
          <Button size="sm" variant="tertiary" onPress={() => onChange([...lines, line()])}>
            <Plus className="size-4" /> {addLabel}
          </Button>
        </div>
      )}
    </div>
  );
}
