import { Button } from "@heroui/react";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import {
  completeWorkOrder,
  computeCost,
  defaultCompletion,
  isProducible,
  roundQty,
  sum,
  type CompletionInput,
  type ID,
  type OutputGrade,
  type ReturnKind,
  type WorkOrder,
} from "@/domain";
import { NumberInput, SelectInput, SwitchInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { Section, TaskModal } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { OUTPUT_GRADE, RETURN_KIND, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { CostBreakdown } from "./CostBreakdown";

interface OutRow {
  key: string;
  itemId: ID | null;
  qty: number;
  sharePct: number;
  grade: OutputGrade;
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
      title={`Complete ${wo.code}`}
      description="Record the output and offcuts. Usable offcuts go back to the warehouse as offcut lots and lower this job's cost."
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
      grade: "baik" as OutputGrade,
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
      .map((o) => ({ itemId: o.itemId!, qty: o.qty, sharePct: manualShare ? o.sharePct : undefined, grade: o.grade })),
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
    const done = run((d) => completeWorkOrder(d, wo.id, input), `${wo.code} done — cost locked`);
    if (done) onDone();
  };

  const updateOut = (key: string, patch: Partial<OutRow>) => setOutputs(outputs.map((o) => (o.key === key ? { ...o, ...patch } : o)));
  const updateRet = (key: string, patch: Partial<RetRow>) => setReturns(returns.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const outputFilter = wo.type === "dekonstruksi" ? undefined : isProducible;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_22rem]">
      <div className="flex flex-col gap-6">
        <Section
          title="Job output"
          description={
            wo.type === "dekonstruksi"
              ? "Materials recovered from dismantling. Their value is capped at the price of new material."
              : wo.receipts.length
                ? `The rest of the output, received now. ${wo.receipts.reduce((a, r) => a + r.qty, 0)} units were already received as partial output and are included in the cost.`
                : "Finished goods going into the warehouse. Add units that failed QC as a Reject row."
          }
        >
          <div className="flex flex-col gap-2">
            {outputs.map((o) => (
              <div key={o.key} className={`grid items-end gap-2 ${manualShare ? "grid-cols-[1fr_6.5rem_8rem_6rem_auto]" : "grid-cols-[1fr_6.5rem_8rem_auto]"}`}>
                <ItemPicker filter={outputFilter} value={o.itemId} onChange={(id) => updateOut(o.key, { itemId: id })} aria-label="Output item" />
                <NumberInput aria-label="Output qty" value={o.qty} onChange={(qty) => updateOut(o.key, { qty })} suffix={o.itemId ? UOM_LABEL[item(o.itemId)?.uom ?? "pcs"] : undefined} />
                <SelectInput
                  aria-label="QC result"
                  value={o.grade}
                  onChange={(v) => updateOut(o.key, { grade: v as OutputGrade })}
                  options={(Object.keys(OUTPUT_GRADE) as OutputGrade[]).map((g) => ({ id: g, label: OUTPUT_GRADE[g] }))}
                />
                {manualShare && <NumberInput aria-label="Cost share" value={o.sharePct} onChange={(sharePct) => updateOut(o.key, { sharePct })} maxValue={100} suffix="%" />}
                <Button isIconOnly variant="ghost" aria-label="Remove" isDisabled={outputs.length === 1} onPress={() => setOutputs(outputs.filter((x) => x.key !== o.key))}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button size="sm" variant="tertiary" onPress={() => setOutputs([...outputs, { key: k(), itemId: outputs[0]?.itemId ?? null, qty: 1, sharePct: 0, grade: "reject" }])}>
                <Plus className="size-4" /> Add row (e.g. QC reject)
              </Button>
              {outputs.length > 1 && (
                <SwitchInput
                  isSelected={manualShare}
                  onChange={setManualShare}
                  label="Set cost shares manually"
                  description="Default: split by relative sales value."
                />
              )}
            </div>
          </div>
        </Section>

        <Section
          title="Offcuts & waste"
          description="Choose: whole (unused), usable offcut (becomes an offcut lot with dimensions), or waste (enter a value if sold)."
        >
          <div className="flex flex-col gap-4">
            {[...issued].map(([itemId, info]) => {
              const it = item(itemId);
              const rows = returns.filter((r) => r.itemId === itemId);
              const used = sum(rows.map((r) => r.qty));
              return (
                <div key={itemId} className="rounded-md border border-[var(--rule)] p-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <p className="font-medium">{it?.name ?? "?"}</p>
                    <p className="text-xs text-muted">
                      Issued {formatQty(info.qty, it?.uom)} · {formatIDR(info.value)}
                      {used > 0 && ` · used ${formatQty(roundQty(info.qty - used), it?.uom)}`}
                    </p>
                  </div>
                  <div className="mt-2 flex flex-col gap-2">
                    {rows.map((r) => {
                      const belowMin = r.kind === "sisa" && r.qty > 0 && (it?.minRemnantQty ?? 0) > r.qty;
                      return (
                        <div key={r.key} className="flex flex-col gap-2 rounded-sm bg-default/40 p-2">
                          <div className="grid grid-cols-[1fr_7rem_auto] items-end gap-2 sm:grid-cols-[12rem_8rem_1fr_auto]">
                            <SelectInput
                              aria-label="Type"
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
                                  <NumberInput aria-label="Length (mm)" value={r.length} onChange={(length) => updateRet(r.key, { length })} suffix="L" maximumFractionDigits={0} />
                                  <NumberInput aria-label="Width (mm)" value={r.width} onChange={(width) => updateRet(r.key, { width })} suffix="W" maximumFractionDigits={0} />
                                  <NumberInput aria-label="Thickness (mm)" value={r.thickness} onChange={(thickness) => updateRet(r.key, { thickness })} suffix="T" maximumFractionDigits={0} />
                                </div>
                              )}
                              {r.kind === "limbah" && (
                                <NumberInput aria-label="Waste sale value" value={r.salvageValue} onChange={(salvageValue) => updateRet(r.key, { salvageValue })} money />
                              )}
                              {r.kind === "utuh" && <p className="py-2 text-xs text-muted">Goes back to the source lot at its original cost.</p>}
                            </div>
                            <Button
                              isIconOnly
                              variant="ghost"
                              aria-label="Remove"
                              className="row-start-1 col-start-3 sm:col-start-auto sm:row-start-auto"
                              onPress={() => setReturns(returns.filter((x) => x.key !== r.key))}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                          {belowMin && (
                            <p className="flex items-center gap-1 text-xs text-warning">
                              <AlertTriangle className="size-3" /> Below the minimum offcut size ({formatQty(it!.minRemnantQty!, it!.uom)}) — consider recording it as waste.
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
                        <Plus className="size-4" /> Offcut / waste {it?.name.split(" ")[0]}
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </Section>

        <Section title="Labour & overhead">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <NumberInput label="Actual labour hours" value={laborHours} onChange={setLaborHours} suffix="h" />
            <NumberInput label="Hourly rate" value={laborRate} onChange={setLaborRate} money />
            <NumberInput
              label="Overhead"
              value={overhead}
              onChange={setOverhead}
              money
              description={
                <button type="button" className="underline" onClick={() => setOverhead(Math.round(laborHours * db.settings.overheadPerLaborHour))}>
                  Calculate from hours × {formatIDR(db.settings.overheadPerLaborHour)}
                </button>
              }
            />
          </div>
        </Section>
      </div>

      <div className="lg:sticky lg:top-0 lg:self-start">
        <Section title="Cost preview" description={WO_TYPE[wo.type].label}>
          {preview ? <CostBreakdown cost={preview} /> : <p className="text-sm text-danger">{error}</p>}
          <div className="mt-4 flex flex-col gap-2">
            <Button onPress={submit} isDisabled={!preview} fullWidth>
              Complete & lock cost
            </Button>
            <Button variant="tertiary" onPress={onDone} fullWidth>
              Cancel
            </Button>
          </div>
        </Section>
      </div>
    </div>
  );
}
