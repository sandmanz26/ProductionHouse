import { Button, Card } from "@heroui/react";
import { Check, Hammer, Plus, Recycle, Trash2, Wrench, Shuffle, Scissors, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  createWorkOrder,
  EPS,
  getLot,
  isProducible,
  requirements,
  sum,
  transact,
  type ID,
  type Item,
  type WorkOrderInput,
  type WorkOrderType,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextAreaInput, TextInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { lotLabel } from "./lot-label";
import { RequirementsTable } from "./shared";

const TYPE_ICON: Record<WorkOrderType, LucideIcon> = {
  produksi: Hammer,
  konversi: Shuffle,
  dekonstruksi: Scissors,
  perbaikan: Wrench,
};

interface LineState {
  key: string;
  itemId: ID | null;
  qty: number;
}

let keySeq = 0;
const newLine = (itemId: ID | null = null, qty = 1): LineState => ({ key: `l${++keySeq}`, itemId, qty });

export default function WorkOrderNewPage() {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialLot = params.get("lot");
  const initialType = (params.get("jenis") as WorkOrderType | null) ?? "produksi";
  const salesOrderId = params.get("so") ?? undefined;

  const [type, setType] = useState<WorkOrderType>(WO_TYPE[initialType] ? initialType : "produksi");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [outputs, setOutputs] = useState<LineState[]>([newLine()]);
  const [extras, setExtras] = useState<LineState[]>([]);
  const [sourceLotId, setSourceLotId] = useState<ID | null>(initialLot);
  const [sourceQty, setSourceQty] = useState(1);

  const needsSource = type !== "produksi";
  const sourceLot = sourceLotId ? db.lots.find((l) => l.id === sourceLotId) : undefined;
  const sourceItem = item(sourceLot?.itemId);

  const sourceOptions = useMemo(
    () =>
      db.lots
        .filter((l) => l.qty > EPS && !l.reservedForWo && item(l.itemId)?.kind === "product")
        .filter((l) => (type === "perbaikan" ? l.status === "rusak" : l.status === "tersedia" || l.status === "rusak"))
        .map((l) => ({ id: l.id, label: item(l.itemId)?.name ?? "?", description: lotLabel(l, item(l.itemId)) })),
    [db.lots, item, type],
  );

  const input: WorkOrderInput | null = useMemo(() => {
    const outs = outputs.filter((o) => o.itemId && o.qty > 0).map((o) => ({ itemId: o.itemId!, qty: o.qty }));
    const ext = extras.filter((o) => o.itemId && o.qty > 0).map((o) => ({ itemId: o.itemId!, qty: o.qty }));
    const source = sourceLot ? [{ itemId: sourceLot.itemId, qty: sourceQty, lotId: sourceLot.id }] : [];
    const autoTitle = (() => {
      const first = outs[0] ? item(outs[0].itemId)?.name : undefined;
      switch (type) {
        case "produksi":
          return first ? `Produksi ${first}${outs.length > 1 ? ` +${outs.length - 1}` : ""}` : "";
        case "konversi":
          return sourceItem && first ? `Konversi ${sourceItem.name} → ${first}` : "";
        case "dekonstruksi":
          return sourceItem ? `Bongkar ${sourceItem.name}` : "";
        case "perbaikan":
          return sourceItem ? `Perbaikan ${sourceItem.name} (${sourceLot?.code})` : "";
      }
    })();
    const base = { type, title: title.trim() || autoTitle, dueDate: dueDate || undefined, note: note || undefined, salesOrderId };
    if (type === "produksi") return { ...base, plannedOutputs: outs, plannedInputs: ext };
    if (type === "perbaikan")
      return { ...base, plannedOutputs: sourceLot ? [{ itemId: sourceLot.itemId, qty: sourceQty }] : [], plannedInputs: [...source, ...ext] };
    if (type === "konversi") return { ...base, plannedOutputs: outs, plannedInputs: [...source, ...ext] };
    return { ...base, plannedOutputs: outs, plannedInputs: source };
  }, [type, title, dueDate, note, outputs, extras, sourceLot, sourceQty, sourceItem, item, salesOrderId]);

  const ready = needsSource ? !!sourceLot : !!input?.plannedOutputs.length;
  const preview = useMemo(() => {
    if (!input || !ready) return null;
    try {
      return transact(db, (d) => {
        const wo = createWorkOrder(d, input);
        const reqs = requirements(d, wo);
        const material = sum(
          reqs.map((r) => {
            const lotCost = r.lotId ? getLot(d, r.lotId).unitCost : undefined;
            return r.required * (lotCost ?? item(r.itemId)?.standardCost ?? 0);
          }),
        );
        return { reqs, laborHours: wo.laborHours, labor: wo.laborHours * wo.laborRate, overhead: wo.overhead, material };
      }).result;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [db, input, item, ready]);

  const outputUnits = sum(input?.plannedOutputs.map((o) => o.qty) ?? []);
  const canSave = !!preview && !("error" in preview);

  const save = () => {
    if (!input) return;
    const wo = run((d) => createWorkOrder(d, input), (w) => `Perintah kerja ${w.code} dibuat`);
    if (wo) navigate(`/produksi/${wo.id}`, { replace: true });
  };


  return (
    <>
      <PageHeader title="Perintah kerja baru" description="Tiga langkah: pilih jenis pekerjaan, tentukan barang, cek kebutuhan bahan." back="/produksi" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="1 · Jenis pekerjaan">
            <div role="radiogroup" aria-label="Jenis pekerjaan" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(Object.keys(WO_TYPE) as WorkOrderType[]).map((t) => {
                const Icon = TYPE_ICON[t];
                const active = t === type;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setType(t);
                      if (t !== type) setSourceLotId(null);
                      setOutputs([newLine()]);
                    }}
                    className={`flex items-start gap-3 rounded-md border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none ${
                      active ? "border-accent bg-accent-soft/50" : "border-[var(--rule)] hover:border-accent/60"
                    }`}
                  >
                    <div className={`grid size-9 shrink-0 place-items-center rounded-sm ${active ? "bg-accent text-accent-foreground" : "bg-default"}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{WO_TYPE[t].label}</p>
                      <p className="mt-0.5 text-sm text-muted">{WO_TYPE[t].description}</p>
                    </div>
                    {active && <Check className="size-4 text-accent" />}
                  </button>
                );
              })}
            </div>
          </Section>

          <Section title="2 · Barang">
            <div className="flex flex-col gap-5">
              {needsSource && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
                  <SelectInput
                    label={type === "perbaikan" ? "Unit rusak yang diperbaiki" : "Produk asal (diambil dari stok)"}
                    value={sourceLotId}
                    onChange={(id) => {
                      setSourceLotId(id);
                      setSourceQty(Math.min(1, db.lots.find((l) => l.id === id)?.qty ?? 1));
                    }}
                    options={sourceOptions}
                    placeholder={sourceOptions.length ? "Pilih unit…" : type === "perbaikan" ? "Tidak ada unit rusak" : "Tidak ada stok produk"}
                    isRequired
                  />
                  <NumberInput
                    label="Qty"
                    value={sourceQty}
                    onChange={setSourceQty}
                    minValue={0}
                    maxValue={sourceLot?.qty}
                    suffix={sourceItem ? UOM_LABEL[sourceItem.uom] : undefined}
                  />
                </div>
              )}

              {type !== "perbaikan" && (
                <LineEditor
                  title={type === "dekonstruksi" ? "Perkiraan bahan yang didapat (bisa diubah saat selesai)" : "Yang dihasilkan — produk, komponen, atau bahan olahan"}
                  kind={type === "dekonstruksi" ? "material" : undefined}
                  filter={type === "dekonstruksi" ? undefined : isProducible}
                  lines={outputs}
                  onChange={setOutputs}
                  addLabel={type === "dekonstruksi" ? "Tambah bahan" : "Tambah produk"}
                />
              )}

              {type !== "dekonstruksi" && (
                <LineEditor
                  title={type === "produksi" ? "Bahan tambahan di luar BOM (opsional)" : "Bahan tambahan yang dibutuhkan"}
                  kind="material"
                  lines={extras}
                  onChange={setExtras}
                  addLabel="Tambah bahan"
                  allowEmpty
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput label="Judul" value={title} onChange={setTitle} placeholder={input?.title || "Otomatis dari produk"} />
                <DateInput label="Target selesai" value={dueDate} onChange={setDueDate} />
              </div>
              <TextAreaInput label="Catatan" value={note} onChange={setNote} placeholder="Instruksi untuk tukang, spesifikasi finishing, dll." rows={2} />
            </div>
          </Section>

          <Section
            title="3 · Cek kebutuhan bahan"
            description="Sistem memakai sisa material lebih dulu, lalu stok terlama. Kekurangan bisa langsung dibuatkan pembelian setelah disimpan."
            bodyClassName="p-0"
          >
            {preview && "reqs" in preview && preview.reqs.length > 0 ? (
              <RequirementsTable reqs={preview.reqs} showIssued={false} />
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">
                {preview && "error" in preview ? preview.error : "Lengkapi barang di langkah 2 untuk melihat kebutuhan."}
              </p>
            )}
          </Section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Estimasi biaya standar</Card.Title>
              <Card.Description>Perkiraan dari BOM & tarif. HPP sebenarnya dihitung saat selesai.</Card.Description>
            </Card.Header>
            <Card.Content>
              {preview && "material" in preview ? (
                <>
                  <Row label="Bahan (standar)" value={formatIDR(preview.material)} />
                  <Row label={`Tenaga kerja · ${formatQty(preview.laborHours)} jam`} value={formatIDR(preview.labor)} />
                  <Row label="Overhead" value={formatIDR(preview.overhead)} />
                  <div className="my-2 border-t border-[var(--rule)]" />
                  <Row label="Total estimasi" value={formatIDR(preview.material + preview.labor + preview.overhead)} strong />
                  {outputUnits > 0 && (
                    <Row label="Per unit hasil" value={formatIDR((preview.material + preview.labor + preview.overhead) / outputUnits)} muted />
                  )}
                  {preview.reqs.some((r) => r.freeRemnant > 0 && r.required > 0) && (
                    <p className="mt-3 flex items-start gap-2 rounded-sm bg-success-soft p-3 text-xs text-success-soft-foreground">
                      <Recycle className="mt-0.5 size-4 shrink-0" />
                      Ada sisa material yang cocok — akan disarankan saat pengambilan bahan sehingga HPP lebih rendah.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">Belum ada data.</p>
              )}
            </Card.Content>
            <Card.Footer className="flex-col items-stretch gap-2">
              <Button onPress={save} isDisabled={!canSave} fullWidth>
                Simpan perintah kerja
              </Button>
              {preview && "error" in preview && input?.title && <p className="text-xs text-danger">{preview.error}</p>}
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}

function LineEditor({
  title,
  kind,
  filter,
  lines,
  onChange,
  addLabel,
  allowEmpty,
}: {
  title: string;
  kind?: "material" | "product";
  filter?: (item: Item) => boolean;
  lines: LineState[];
  onChange: (lines: LineState[]) => void;
  addLabel: string;
  allowEmpty?: boolean;
}) {
  const { item } = useLookups();
  const update = (key: string, patch: Partial<LineState>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-col gap-2">
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_7.5rem_auto] items-end gap-2">
            <ItemPicker kind={kind} filter={filter} value={l.itemId} onChange={(id) => update(l.key, { itemId: id })} aria-label={kind === "material" ? "Material" : "Barang"} />
            <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix={l.itemId ? UOM_LABEL[item(l.itemId)?.uom ?? "pcs"] : undefined} />
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Hapus baris"
              isDisabled={!allowEmpty && lines.length === 1}
              onPress={() => onChange(lines.filter((x) => x.key !== l.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        <div>
          <Button size="sm" variant="tertiary" onPress={() => onChange([...lines, newLine()])}>
            <Plus className="size-4" /> {addLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
