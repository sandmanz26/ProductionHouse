import { Button } from "@heroui/react";
import { Recycle } from "lucide-react";
import { useMemo, useState } from "react";
import { COSTING_LABEL, costingMethodOf, EPS, issueMaterials, nextLayer, roundQty, suggestIssue, sum, type ID, type WorkOrder } from "@/domain";
import { NumberInput, SwitchInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { StatusChip, TaskModal } from "@/components/ui";
import { formatDims, formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { LOT_ORIGIN } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export interface IssueRequest {
  itemId: ID | null;
  qty: number;
}

export function IssueDialog({
  wo,
  request,
  onClose,
}: {
  wo: WorkOrder;
  request: IssueRequest | null;
  onClose: () => void;
}) {
  return (
    <TaskModal
      isOpen={!!request}
      onOpenChange={(open) => !open && onClose()}
      title="Issue materials from the warehouse"
      description="Lots are picked automatically: reserved for this job → offcuts (smallest first) → regular stock by costing method. Change the qty per lot if needed."
    >
      {request && <IssueForm wo={wo} initial={request} onDone={onClose} />}
    </TaskModal>
  );
}

function IssueForm({ wo, initial, onDone }: { wo: WorkOrder; initial: IssueRequest; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const [itemId, setItemId] = useState<ID | null>(initial.itemId);
  const [qty, setQty] = useState(initial.qty);
  const [useRemnants, setUseRemnants] = useState(true);
  const [overrides, setOverrides] = useState<{ key: string; values: Record<ID, number> }>({ key: "", values: {} });
  const it = item(itemId ?? undefined);
  const method = costingMethodOf(db, it);
  const next = itemId && (method === "fifo" || method === "lifo") ? nextLayer(db, itemId) : undefined;

  const suggestionKey = `${itemId}|${qty}|${useRemnants}`;
  const { lots, suggested } = useMemo(() => {
    if (!itemId) return { lots: [], suggested: new Map<ID, number>() };
    const s = suggestIssue(db, wo, itemId, qty, useRemnants);
    const suggested = new Map(s.picks.map((p) => [p.lotId, p.qty]));
    const plannedLotIds = new Set(wo.plannedInputs.map((i) => i.lotId).filter(Boolean));
    const candidates = db.lots.filter(
      (l) =>
        l.itemId === itemId &&
        l.qty > EPS &&
        (l.status === "tersedia" || plannedLotIds.has(l.id)) &&
        (!l.reservedForWo || l.reservedForWo === wo.id),
    );
    const order = new Map(s.picks.map((p, i) => [p.lotId, i]));
    candidates.sort((a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.createdAt.localeCompare(b.createdAt));
    return { lots: candidates, suggested };
  }, [db, wo, itemId, qty, useRemnants]);

  const values = overrides.key === suggestionKey ? overrides.values : {};
  const qtyFor = (lotId: ID) => values[lotId] ?? suggested.get(lotId) ?? 0;
  const setLotQty = (lotId: ID, v: number) =>
    setOverrides({ key: suggestionKey, values: { ...(overrides.key === suggestionKey ? overrides.values : {}), [lotId]: v } });

  const picked = roundQty(sum(lots.map((l) => qtyFor(l.id))));
  const value = sum(lots.map((l) => qtyFor(l.id) * l.unitCost));
  const remnantQty = roundQty(sum(lots.filter((l) => l.isRemnant).map((l) => qtyFor(l.id))));
  const over = lots.find((l) => qtyFor(l.id) > l.qty + EPS);
  const shortage = roundQty(Math.max(0, qty - picked));

  const submit = () => {
    const picks = lots.map((l) => ({ lotId: l.id, qty: qtyFor(l.id) })).filter((p) => p.qty > EPS);
    const ok = run((d) => issueMaterials(d, wo.id, picks), `${formatQty(picked, it?.uom)} ${it?.name ?? ""} issued`);
    if (ok) onDone();
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_9rem]">
        <ItemPicker value={itemId} onChange={setItemId} label="Material / item" />
        <NumberInput label="Qty needed" value={qty} onChange={setQty} suffix={it ? UOM_LABEL[it.uom] : undefined} />
      </div>
      <SwitchInput
        isSelected={useRemnants}
        onChange={setUseRemnants}
        label="Use offcuts first"
        description="Turn this off when you need whole pieces (e.g. long export-grade boards)."
      />

      {itemId && (
        <p className="-mt-1 text-xs text-muted">
          Costing method <b className="text-foreground">{COSTING_LABEL[method]}</b>
          {method === "fifo" && " — regular stock must come out of the oldest lot first."}
          {method === "lifo" && " — regular stock must come out of the newest lot first."}
          {method === "rata_rata" && " — whichever lot you issue, it costs the current stock average."}
          {method === "identifikasi" && " — cost follows the chosen lot."} Offcuts and items bought for this job can always be used first.
        </p>
      )}

      {itemId && (
        <div className="rounded-md border border-[var(--rule)]">
          {lots.length === 0 ? (
            <p className="p-4 text-sm text-muted">No stock available for this item.</p>
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {lots.map((l) => (
                <li key={l.id} className="grid grid-cols-1 items-center gap-2 p-3 sm:grid-cols-[1fr_9rem]">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{l.code}</span>
                      {l.isRemnant && (
                        <StatusChip tone="success">
                          <Recycle className="mr-1 inline size-3" />
                          Offcut
                        </StatusChip>
                      )}
                      {l.reservedForWo === wo.id && <StatusChip tone="accent">Bought for this job</StatusChip>}
                      {next?.id === l.id && <StatusChip tone="default">Next out ({COSTING_LABEL[method]})</StatusChip>}
                      {l.status === "rusak" && <StatusChip tone="danger">Damaged</StatusChip>}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                      On hand {formatQty(l.qty, it?.uom)} · {formatIDR(l.unitCost)}/{it ? UOM_LABEL[it.uom] : ""} · {LOT_ORIGIN[l.origin]}
                      {l.originRef ? ` ${l.originRef.code}` : ""} · {l.location}
                      {l.dimensions ? ` · ${formatDims(l.dimensions)}` : ""}
                    </p>
                  </div>
                  <NumberInput aria-label={`Qty from ${l.code}`} value={qtyFor(l.id)} onChange={(v) => setLotQty(l.id, v)} maxValue={l.qty} />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex flex-col gap-1 rounded-md bg-default/60 p-3 text-sm">
        <div className="flex justify-between">
          <span>Issued</span>
          <b className="tabular-nums">
            {formatQty(picked, it?.uom)} · {formatIDR(value)}
          </b>
        </div>
        {remnantQty > 0 && (
          <div className="flex justify-between text-success">
            <span>From offcuts</span>
            <span className="tabular-nums">{formatQty(remnantQty, it?.uom)}</span>
          </div>
        )}
        {shortage > 0 && <p className="text-warning">Still short {formatQty(shortage, it?.uom)} — issue the rest once the goods arrive.</p>}
        {over && <p className="text-danger">Qty from {over.code} is more than the lot holds.</p>}
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button onPress={submit} isDisabled={!itemId || picked <= EPS || !!over}>
          Issue {picked > 0 ? formatQty(picked, it?.uom) : ""}
        </Button>
      </div>
    </div>
  );
}
