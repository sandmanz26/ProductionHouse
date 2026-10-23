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
      title="Receive partial output"
      description="Finished units go into the warehouse now at standard cost. When the job is closed, their value is adjusted to actual cost; the difference on units already sold is recorded as a cost variance."
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
        label="Item"
        value={itemId}
        onChange={setItemId}
        options={wo.plannedOutputs.map((o) => ({ id: o.itemId, label: item(o.itemId)?.name ?? "?", description: `planned ${formatQty(o.qty)} · received ${formatQty(receivedQty(wo, o.itemId))}` }))}
      />
      <div className="grid grid-cols-2 gap-3">
        <NumberInput label="Qty" value={qty} onChange={setQty} description={`Left to receive ${formatQty(left, it?.uom)}`} />
        <SelectInput label="QC result" value={grade} onChange={(v) => setGrade(v as OutputGrade)} options={(Object.keys(OUTPUT_GRADE) as OutputGrade[]).map((g) => ({ id: g, label: OUTPUT_GRADE[g] }))} />
      </div>
      <p className="text-xs text-muted">
        Provisional cost {formatIDR(unit)} per unit{grade === "reject" ? " · reject units go in as damaged, ready for a repair order" : ""}.
      </p>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          isDisabled={!itemId || qty <= 0}
          onPress={() => {
            const ok = run((d) => receiveOutput(d, wo.id, { itemId, qty, grade }), `${formatQty(qty, it?.uom)} ${it?.name} received into the warehouse`);
            if (ok) onDone();
          }}
        >
          Receive into warehouse
        </Button>
      </div>
    </div>
  );
}
