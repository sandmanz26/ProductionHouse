import { Button } from "@heroui/react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  completeWorkOrder,
  computeCost,
  defaultCompletion,
  roundQty,
  sum,
  type CompletionInput,
  type ID,
  type ReturnKind,
  type WorkOrder,
} from "@/domain";
import { NumberInput, SelectInput, SwitchInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { Section, TaskModal } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { RETURN_KIND, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { CostBreakdown } from "./CostBreakdown";

interface OutRow {
  key: string;
  itemId: ID | null;
  qty: number;
  sharePct: number;
}

interface RetRow {
  key: string;
  itemId: ID;
  kind: ReturnKind;
  qty: number;
  length: number;
  width: number;
  thickness: number;
  salvageValue: number;
}

let seq = 0;
const k = () => `r${++seq}`;

export function CompleteDialog({ wo, isOpen, onOpenChange }: { wo: WorkOrder; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="full"
      title={`Selesaikan ${wo.code}`}
      description="Catat hasil dan sisa material. Sisa layak pakai kembali ke gudang sebagai lot sisa dan mengurangi HPP pekerjaan ini."
    >
      {isOpen && <CompleteForm wo={wo} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function CompleteForm({ wo, onDone }: { wo: WorkOrder; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const defaults = useMemo(() => defaultCompletion(db, wo), [db, wo]);

  const [outputs, setOutputs] = useState<OutRow[]>(() =>
    (defaults.outputs.length ? defaults.outputs : [{ itemId: "", qty: 1 }]).map((o, _i, arr) => ({
      key: k(),
      itemId: o.itemId || null,
      qty: o.qty,
      sharePct: roundQty(100 / arr.length),
    })),
  );
  const [manualShare, setManualShare] = useState(false);
  const [returns, setReturns] = useState<RetRow[]>(() =>
    defaults.returns.map((r) => ({ key: k(), itemId: r.itemId, kind: r.kind, qty: 0, length: 0, width: 0, thickness: 0, salvageValue: 0 })),
  );
  const [laborHours, setLaborHours] = useState(wo.laborHours);
  const [laborRate, setLaborRate] = useState(wo.laborRate);
  const [overhead, setOverhead] = useState(wo.overhead);

  const issued = useMemo(() => {
    const m = new Map<ID, { qty: number; value: number }>();
    for (const i of wo.issues) {
      const cur = m.get(i.itemId) ?? { qty: 0, value: 0 };
      m.set(i.itemId, { qty: cur.qty + i.qty, value: cur.value + i.qty * i.unitCost });
    }
    return m;
  }, [wo.issues]);

  const input: CompletionInput = {
    outputs: outputs
      .filter((o) => o.itemId)
      .map((o) => ({ itemId: o.itemId!, qty: o.qty, sharePct: manualShare ? o.sharePct : undefined })),
    returns: returns.map((r) => ({
      itemId: r.itemId,
      kind: r.kind,
      qty: r.qty,
      salvageValue: r.kind === "limbah" ? r.salvageValue : undefined,
      dimensions: r.kind === "sisa" && r.length && r.width ? { length: r.length, width: r.width, thickness: r.thickness || undefined } : undefined,
    })),
    laborHours,
    laborRate,
    overhead,
  };

  let preview: ReturnType<typeof computeCost> | null = null;
  let error: string | null = null;
  try {
    preview = computeCost(db, wo, input);
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const submit = () => {
    const done = run((d) => completeWorkOrder(d, wo.id, input), `${wo.code} selesai — HPP terkunci`);
    if (done) onDone();
  };

  const updateOut = (key: string, patch: Partial<OutRow>) => setOutputs(outputs.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const updateRet = (key: string, patch: Partial<RetRow>) => setReturns(returns.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const outputKind = wo.type === "dekonstruksi" ? undefined : "product";

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <Section
          title="Hasil pekerjaan"
          description={
            wo.type === "dekonstruksi"
              ? "Bahan yang berhasil dibongkar. Nilainya dibatasi maksimal harga bahan baru."
              : "Produk jadi yang masuk gudang."
          }
        >
          <div className="flex flex-col gap-2">
            {outputs.map((o) => (
              <div key={o.key} className={`grid items-end gap-2 ${manualShare ? "grid-cols-[1fr_6.5rem_6rem_auto]" : "grid-cols-[1fr_7rem_auto]"}`}>
                <ItemPicker kind={outputKind} value={o.itemId} onChange={(id) => updateOut(o.key, { itemId: id })} aria-label="Item hasil" />
                <NumberInput aria-label="Qty hasil" value={o.qty} onChange={(qty) => updateOut(o.key, { qty })} suffix={o.itemId ? UOM_LABEL[item(o.itemId)?.uom ?? "pcs"] : undefined} />
                {manualShare && <NumberInput aria-label="Porsi biaya" value={o.sharePct} onChange={(sharePct) => updateOut(o.key, { sharePct })} maxValue={100} suffix="%" />}
                <Button isIconOnly variant="ghost" aria-label="Hapus" isDisabled={outputs.length === 1} onPress={() => setOutputs(outputs.filter((x) => x.key !== o.key))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button size="sm" variant="tertiary" onPress={() => setOutputs([...outputs, { key: k(), itemId: null, qty: 1, sharePct: 0 }])}>
                <Plus className="size-4" /> Tambah hasil
              </Button>
              {outputs.length > 1 && (
                <SwitchInput
                  isSelected={manualShare}
                  onChange={setManualShare}
                  label="Atur porsi biaya manual"
                  description="Default: dibagi menurut nilai jual relatif."
                />
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Sisa & limbah"
          description="Pilih: utuh (tidak terpakai), sisa layak pakai (jadi lot sisa dengan ukuran), atau limbah (isi nilai jika dijual)."
        >
          <div className="flex flex-col gap-4">
            {[...issued].map(([itemId, info]) => {
              const it = item(itemId);
              const rows = returns.filter((r) => r.itemId === itemId);
              const used = sum(rows.map((r) => r.qty));
              return (
                <div key={itemId} className="rounded-2xl border border-separator p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{it?.name ?? "?"}</p>
                    <p className="text-xs text-muted">
                      Diambil {formatQty(info.qty, it?.uom)} · {formatIDR(info.value)}
                      {used > 0 && ` · terpakai ${formatQty(roundQty(info.qty - used), it?.uom)}`}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {rows.map((r) => {
                      const belowMin = r.kind === "sisa" && r.qty > 0 && (it?.minRemnantQty ?? 0) > r.qty;
                      return (
                        <div key={r.key} className="flex flex-col gap-2 rounded-xl bg-default/40 p-2">
                          <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2 sm:grid-cols-[12rem_8rem_1fr_auto]">
                            <SelectInput
                              aria-label="Jenis"
                              value={r.kind}
                              onChange={(v) => updateRet(r.key, { kind: v as ReturnKind })}
                              options={(Object.keys(RETURN_KIND) as ReturnKind[]).map((kk) => ({
                                id: kk,
                                label: RETURN_KIND[kk].label,
                                description: RETURN_KIND[kk].description,
                              }))}
                            />
                            <NumberInput aria-label="Qty" value={r.qty} onChange={(qty) => updateRet(r.key, { qty })} suffix={it ? UOM_LABEL[it.uom] : undefined} />
                            <div className="col-span-3 sm:col-span-1">
                              {r.kind === "sisa" && (
                                <div className="grid grid-cols-3 gap-1.5">
                                  <NumberInput aria-label="Panjang (mm)" value={r.length} onChange={(length) => updateRet(r.key, { length })} suffix="P" maximumFractionDigits={0} />
                                  <NumberInput aria-label="Lebar (mm)" value={r.width} onChange={(width) => updateRet(r.key, { width })} suffix="L" maximumFractionDigits={0} />
                                  <NumberInput aria-label="Tebal (mm)" value={r.thickness} onChange={(thickness) => updateRet(r.key, { thickness })} suffix="T" maximumFractionDigits={0} />
                                </div>
                              )}
                              {r.kind === "limbah" && (
                                <NumberInput aria-label="Nilai jual limbah" value={r.salvageValue} onChange={(salvageValue) => updateRet(r.key, { salvageValue })} money />
                              )}
                              {r.kind === "utuh" && <p className="py-2 text-xs text-muted">Kembali ke lot asal dengan harga asal.</p>}
                            </div>
                            <Button
                              isIconOnly
                              variant="ghost"
                              aria-label="Hapus"
                              className="row-start-1 col-start-3 sm:col-start-auto sm:row-start-auto"
                              onPress={() => setReturns(returns.filter((x) => x.key !== r.key))}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          {belowMin && (
                            <p className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="size-3" /> Di bawah ukuran minimum sisa ({formatQty(it!.minRemnantQty!, it!.uom)}) — pertimbangkan sebagai limbah.
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <div>
                      <Button
                        size="sm"
                        variant="tertiary"
                        onPress={() =>
                          setReturns([
                            ...returns,
                            { key: k(), itemId, kind: it?.trackRemnant ? "sisa" : "utuh", qty: 0, length: 0, width: 0, thickness: 0, salvageValue: 0 },
                          ])
                        }
                      >
                        <Plus className="size-4" /> Sisa / limbah {it?.name.split(" ")[0]}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Biaya tenaga kerja & overhead">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberInput label="Jam kerja aktual" value={laborHours} onChange={setLaborHours} suffix="jam" />
            <NumberInput label="Tarif per jam" value={laborRate} onChange={setLaborRate} money />
            <NumberInput
              label="Overhead"
              value={overhead}
              onChange={setOverhead}
              money
              description={
                <button type="button" className="underline" onClick={() => setOverhead(Math.round(laborHours * db.settings.overheadPerLaborHour))}>
                  Hitung dari jam × {formatIDR(db.settings.overheadPerLaborHour)}
                </button>
              }
            />
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <Section title="Pratinjau HPP" description={WO_TYPE[wo.type].label}>
          {preview ? <CostBreakdown cost={preview} /> : <p className="text-sm text-danger">{error}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <Button onPress={submit} isDisabled={!preview} fullWidth>
              Selesaikan & kunci HPP
            </Button>
            <Button variant="tertiary" onPress={onDone} fullWidth>
              Batal
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
