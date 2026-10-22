import { Button, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { Check, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { addLaborLog, isOpenWo, laborCostOf, laborLogCost, removeLaborLog, setStageStatus, type ID, type WorkOrder } from "@/domain";
import { NumberInput, SelectInput, TextInput } from "@/components/fields";
import { Section, StatusChip, TaskModal } from "@/components/ui";
import { formatDateTime, formatIDR, formatNumber } from "@/lib/format";
import { STAGE_STATUS } from "@/lib/labels";
import { useRun } from "@/store/db-store";

/** Route of the order: each stage can be started / finished from the floor. */
export function StagesPanel({ wo }: { wo: WorkOrder }) {
  const run = useRun();
  const open = isOpenWo(wo);
  if (!wo.stages.length) return null;
  return (
    <Section title="Tahapan" description="Tandai tahap yang sedang dan sudah dikerjakan." bodyClassName="p-0">
      <ol className="divide-y divide-[var(--rule)]">
        {wo.stages.map((s, i) => {
          const hours = wo.laborLogs.filter((l) => l.stageId === s.id).reduce((a, l) => a + l.hours, 0);
          const pieces = wo.laborLogs.filter((l) => l.stageId === s.id).reduce((a, l) => a + l.pieces, 0);
          return (
            <li key={s.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
              <span className="num w-5 text-xs text-muted">{i + 1}</span>
              <span className="min-w-28 flex-1 text-sm font-medium">{s.name}</span>
              <span className="num text-xs text-muted">
                {hours > 0 && `${formatNumber(hours, 1)} jam`}
                {hours > 0 && pieces > 0 && " · "}
                {pieces > 0 && `${formatNumber(pieces)} unit borongan`}
              </span>
              <StatusChip tone={STAGE_STATUS[s.status].tone}>{STAGE_STATUS[s.status].label}</StatusChip>
              {open && (
                <span className="flex gap-1">
                  {s.status === "menunggu" && (
                    <Button size="sm" variant="ghost" onPress={() => run((d) => setStageStatus(d, wo.id, s.id, "proses"), `${s.name} mulai dikerjakan`)}>
                      Mulai
                    </Button>
                  )}
                  {s.status !== "selesai" && (
                    <Button size="sm" variant="secondary" onPress={() => run((d) => setStageStatus(d, wo.id, s.id, "selesai"), `${s.name} selesai`)}>
                      <Check className="size-3.5" /> Selesai
                    </Button>
                  )}
                  {s.status !== "menunggu" && (
                    <Button size="sm" isIconOnly variant="ghost" aria-label={`Ulang ${s.name}`} onPress={() => run((d) => setStageStatus(d, wo.id, s.id, "menunggu"))}>
                      <RotateCcw className="size-3.5" />
                    </Button>
                  )}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

/** Labour booked against the order: harian (hours) or borongan (pieces). */
export function LaborPanel({ wo }: { wo: WorkOrder }) {
  const run = useRun();
  const [adding, setAdding] = useState(false);
  const open = isOpenWo(wo);
  const total = laborCostOf(wo);
  const stageName = (id?: ID) => wo.stages.find((s) => s.id === id)?.name ?? "—";
  return (
    <Section
      title="Catatan kerja"
      description={
        wo.laborLogs.length
          ? `Biaya tenaga kerja dihitung dari catatan ini: ${formatIDR(total.amount)}`
          : `Belum ada catatan — HPP memakai rencana ${formatNumber(wo.laborHours, 1)} jam × ${formatIDR(wo.laborRate)}`
      }
      actions={
        open && (
          <Button size="sm" variant="secondary" onPress={() => setAdding(true)}>
            <Plus className="size-3.5" /> Catat kerja
          </Button>
        )
      }
      bodyClassName="p-0"
    >
      {wo.laborLogs.length > 0 && (
        <ul className="divide-y divide-[var(--rule)]">
          {[...wo.laborLogs].reverse().map((l) => (
            <li key={l.id} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-3 px-4 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm">
                  {l.worker} <span className="text-muted">· {stageName(l.stageId)}</span>
                </p>
                <p className="num text-xs text-muted">
                  {formatDateTime(l.at)}
                  {l.hours > 0 && ` · ${formatNumber(l.hours, 1)} j × ${formatIDR(l.rate)}`}
                  {l.pieces > 0 && ` · ${formatNumber(l.pieces)} unit × ${formatIDR(l.pieceRate)}`}
                </p>
              </div>
              <span className="num text-sm">{formatIDR(laborLogCost(l))}</span>
              {open ? (
                <Button size="sm" isIconOnly variant="ghost" aria-label="Hapus catatan" onPress={() => run((d) => removeLaborLog(d, wo.id, l.id), "Catatan dihapus")}>
                  <Trash2 className="size-3.5" />
                </Button>
              ) : (
                <span />
              )}
            </li>
          ))}
        </ul>
      )}
      <LaborDialog wo={wo} isOpen={adding} onOpenChange={setAdding} />
    </Section>
  );
}

function LaborDialog({ wo, isOpen, onOpenChange }: { wo: WorkOrder; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} size="md" title="Catat kerja" description="Harian: jam × tarif. Borongan: jumlah unit × tarif per unit.">
      {isOpen && <LaborForm wo={wo} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function LaborForm({ wo, onDone }: { wo: WorkOrder; onDone: () => void }) {
  const run = useRun();
  const firstOpen = wo.stages.find((s) => s.status !== "selesai") ?? wo.stages[0];
  const [mode, setMode] = useState<"harian" | "borongan">("harian");
  const [stageId, setStageId] = useState<string>(firstOpen?.id ?? "");
  const [worker, setWorker] = useState("");
  const [hours, setHours] = useState(8);
  const [rate, setRate] = useState(wo.laborRate);
  const [pieces, setPieces] = useState(1);
  const [pieceRate, setPieceRate] = useState(0);
  const [note, setNote] = useState("");
  const amount = mode === "harian" ? hours * rate : pieces * pieceRate;
  const recentWorkers = [...new Set(wo.laborLogs.map((l) => l.worker))].slice(-4);
  return (
    <div className="flex flex-col gap-3">
      <ToggleButtonGroup
        selectionMode="single"
        disallowEmptySelection
        selectedKeys={[mode]}
        onSelectionChange={(keys: Set<Key>) => {
          const v = [...keys][0];
          if (v) setMode(v as "harian" | "borongan");
        }}
        aria-label="Cara bayar"
      >
        <ToggleButton id="harian">Harian (jam)</ToggleButton>
        <ToggleButton id="borongan">Borongan (per unit)</ToggleButton>
      </ToggleButtonGroup>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label="Pekerja / tim" value={worker} onChange={setWorker} placeholder="mis. Tim Pak Darto" isRequired />
        {wo.stages.length > 0 && (
          <SelectInput label="Tahap" value={stageId} onChange={setStageId} options={wo.stages.map((s) => ({ id: s.id, label: s.name }))} />
        )}
      </div>
      {recentWorkers.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recentWorkers.map((w) => (
            <button key={w} type="button" onClick={() => setWorker(w)} className="rounded-sm border border-[var(--rule)] px-2 py-0.5 text-xs hover:bg-default">
              {w}
            </button>
          ))}
        </div>
      )}
      {mode === "harian" ? (
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Jam" value={hours} onChange={setHours} suffix="jam" />
          <NumberInput label="Tarif per jam" value={rate} onChange={setRate} money />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Unit selesai" value={pieces} onChange={setPieces} maximumFractionDigits={0} />
          <NumberInput label="Tarif per unit" value={pieceRate} onChange={setPieceRate} money />
        </div>
      )}
      <TextInput label="Catatan" value={note} onChange={setNote} />
      <div className="flex items-center justify-between gap-3 border-t border-[var(--rule)] pt-3">
        <span className="num text-sm">{formatIDR(amount)}</span>
        <div className="flex gap-2">
          <Button variant="tertiary" onPress={onDone}>
            Batal
          </Button>
          <Button
            onPress={() => {
              const ok = run(
                (d) =>
                  addLaborLog(d, wo.id, {
                    stageId: stageId || undefined,
                    worker,
                    note: note || undefined,
                    ...(mode === "harian" ? { hours, rate } : { pieces, pieceRate }),
                  }),
                "Kerja tercatat",
              );
              if (ok) onDone();
            }}
          >
            Simpan
          </Button>
        </div>
      </div>
    </div>
  );
}
