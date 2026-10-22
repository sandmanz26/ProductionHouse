import { Button } from "@heroui/react";
import { useState } from "react";
import { getItem, provisionalUnitCost, receivedQty, receiveOutput, roundQty, type OutputGrade, type WorkOrder } from "@/domain";
import { NumberInput, SelectInput } from "@/components/fields";
import { TaskModal } from "@/components/ui";
import { formatIDR, formatQty } from "@/lib/format";
import { OUTPUT_GRADE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

/** Partial output: units finished early go to stock now at standard cost. */
export function ReceiveDialog({ wo, isOpen, onOpenChange }: { wo: WorkOrder; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      title="Terima hasil sebagian"
      description="Unit yang sudah jadi masuk gudang sekarang dengan HPP standar. Saat pekerjaan ditutup, nilainya disesuaikan ke HPP aktual; selisih atas unit yang sudah terjual dicatat sebagai selisih HPP."
    >
      {isOpen && <ReceiveForm wo={wo} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function ReceiveForm({ wo, onDone }: { wo: WorkOrder; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const [itemId, setItemId] = useState(wo.plannedOutputs[0]?.itemId ?? "");
  const planned = wo.plannedOutputs.find((o) => o.itemId === itemId);
  const left = planned ? Math.max(0, roundQty(planned.qty - receivedQty(wo, itemId))) : 0;
  const [qty, setQty] = useState(Math.min(1, left) || 1);
  const [grade, setGrade] = useState<OutputGrade>("baik");
  const it = item(itemId);
  const unit = it ? provisionalUnitCost(db, getItem(db, it.id)) : 0;
  return (
    <div className="flex flex-col gap-3">
      <SelectInput
        label="Barang"
        value={itemId}
        onChange={setItemId}
        options={wo.plannedOutputs.map((o) => ({ id: o.itemId, label: item(o.itemId)?.name ?? "?", description: `rencana ${formatQty(o.qty)} · sudah diterima ${formatQty(receivedQty(wo, o.itemId))}` }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Qty" value={qty} onChange={setQty} description={`Sisa rencana ${formatQty(left, it?.uom)}`} />
        <SelectInput label="Hasil QC" value={grade} onChange={(v) => setGrade(v as OutputGrade)} options={(Object.keys(OUTPUT_GRADE) as OutputGrade[]).map((g) => ({ id: g, label: OUTPUT_GRADE[g] }))} />
      </div>
      <p className="text-xs text-muted">
        HPP sementara {formatIDR(unit)} per unit{grade === "reject" ? " · unit reject masuk sebagai rusak, siap dibuatkan perintah perbaikan" : ""}.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button
          isDisabled={!itemId || qty <= 0}
          onPress={() => {
            const ok = run((d) => receiveOutput(d, wo.id, { itemId, qty, grade }), `${formatQty(qty, it?.uom)} ${it?.name} masuk gudang`);
            if (ok) onDone();
          }}
        >
          Terima ke gudang
        </Button>
      </div>
    </div>
  );
}
