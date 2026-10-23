import { Button } from "@heroui/react";
import { useState } from "react";
import { addOpeningStock, adjustLotQty, mergeLots, transferLot, updateLotInfo, type ID, type Lot } from "@/domain";
import { NumberInput, SelectInput, SwitchInput, TextInput } from "@/components/fields";
import { TaskModal } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";

/** Record stock that physically exists but is not in the system (initial balance, found stock). */
export function OpeningStockDialog({ itemId, isOpen, onOpenChange }: { itemId: ID; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const it = item(itemId);
  const [qty, setQty] = useState(1);
  const [unitCost, setUnitCost] = useState(it?.standardCost ?? 0);
  const [isRemnant, setIsRemnant] = useState(false);
  const [location, setLocation] = useState(db.settings.defaultLocation);
  const [dims, setDims] = useState({ length: 0, width: 0, thickness: 0 });
  const [note, setNote] = useState("");
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      title={`Add stock ${it?.name ?? ""}`}
      description="For opening stock or stock found during a count. Record new purchases through Purchasing instead."
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onPress={() => {
              const ok = run(
                (d) =>
                  addOpeningStock(d, {
                    itemId,
                    qty,
                    unitCost,
                    isRemnant,
                    location,
                    note: note || undefined,
                    dimensions: dims.length && dims.width ? { length: dims.length, width: dims.width, thickness: dims.thickness || undefined } : undefined,
                  }),
                (l) => `Lot ${l.code} added`,
              );
              if (ok) onOpenChange(false);
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Qty" value={qty} onChange={setQty} suffix={it ? UOM_LABEL[it.uom] : undefined} />
          <NumberInput label="Unit cost" value={unitCost} onChange={setUnitCost} money />
        </div>
        <SelectInput label="Location" value={location} onChange={setLocation} options={db.settings.locations.map((l) => ({ id: l, label: l }))} />
        {it?.kind === "material" && <SwitchInput isSelected={isRemnant} onChange={setIsRemnant} label="This is an offcut" description="Offcuts are used first when materials are issued." />}
        {it?.kind === "material" && (
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="L (mm)" value={dims.length} onChange={(length) => setDims({ ...dims, length })} maximumFractionDigits={0} />
            <NumberInput label="W (mm)" value={dims.width} onChange={(width) => setDims({ ...dims, width })} maximumFractionDigits={0} />
            <NumberInput label="T (mm)" value={dims.thickness} onChange={(thickness) => setDims({ ...dims, thickness })} maximumFractionDigits={0} />
          </div>
        )}
        <TextInput label="Note" value={note} onChange={setNote} />
      </div>
    </TaskModal>
  );
}

/** Stock count for a single lot, plus location change. */
export function LotAdjustDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  return (
    <TaskModal isOpen={!!lot} onOpenChange={(o) => !o && onClose()} size="sm" title={`Count ${lot?.code ?? ""}`} description="Enter the physical quantity you counted. The difference is recorded as an adjustment.">
      {lot && <LotAdjustForm lot={lot} onDone={onClose} />}
    </TaskModal>
  );
}

function LotAdjustForm({ lot, onDone }: { lot: Lot; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const it = item(lot.itemId);
  const [counted, setCounted] = useState(lot.qty);
  const [location, setLocation] = useState(lot.location);
  const [note, setNote] = useState("");
  const diff = counted - lot.qty;
  return (
    <div className="flex flex-col gap-3">
      <NumberInput label="Counted quantity" value={counted} onChange={setCounted} suffix={it ? UOM_LABEL[it.uom] : undefined} description={`On record ${formatQty(lot.qty, it?.uom)}${diff ? ` · difference ${diff > 0 ? "+" : ""}${formatQty(diff, it?.uom)}` : ""}`} />
      <SelectInput
        label="Location"
        value={location}
        onChange={setLocation}
        options={[...new Set([...db.settings.locations, lot.location])].map((l) => ({ id: l, label: l }))}
      />
      <TextInput label="Reason" value={note} onChange={setNote} placeholder="e.g. monthly stock count" />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          onPress={() => {
            const ok = run((d) => {
              if (location !== lot.location) updateLotInfo(d, lot.id, { location });
              return adjustLotQty(d, lot.id, counted, note || undefined);
            }, "Stock updated");
            if (ok) onDone();
          }}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

/** Move part of a lot to another location (e.g. warehouse → workshop). */
export function TransferDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  return (
    <TaskModal isOpen={!!lot} onOpenChange={(o) => !o && onClose()} size="sm" title={`Transfer ${lot?.code ?? ""}`} description="The unit cost moves with it; total stock does not change.">
      {lot && <TransferForm lot={lot} onDone={onClose} />}
    </TaskModal>
  );
}

function TransferForm({ lot, onDone }: { lot: Lot; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const it = item(lot.itemId);
  const targets = db.settings.locations.filter((l) => l !== lot.location);
  const [qty, setQty] = useState(lot.qty);
  const [to, setTo] = useState(targets[0] ?? "");
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">
        From <b>{lot.location}</b> · available {formatQty(lot.qty, it?.uom)}
      </p>
      <NumberInput label="Quantity to transfer" value={qty} onChange={setQty} maxValue={lot.qty} suffix={it ? UOM_LABEL[it.uom] : undefined} />
      <SelectInput label="To location" value={to} onChange={setTo} options={targets.map((l) => ({ id: l, label: l }))} placeholder={targets.length ? "Choose…" : "Add a location in Settings"} />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          isDisabled={!to || qty <= 0}
          onPress={() => {
            const ok = run((d) => transferLot(d, lot.id, qty, to), `${formatQty(qty, it?.uom)} transferred to ${to}`);
            if (ok) onDone();
          }}
        >
          Transfer
        </Button>
      </div>
    </div>
  );
}

/** Merge several lots of one item (e.g. offcuts of one size) into a single lot at weighted cost. */
export function MergeLotsDialog({ itemId, isOpen, onOpenChange }: { itemId: ID; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="md"
      title="Merge lots"
      description="Combine several lots of the same item — e.g. offcuts of the same size bundled together. The unit cost becomes the weighted average; the origin trail is kept."
    >
      {isOpen && <MergeForm itemId={itemId} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function MergeForm({ itemId, onDone }: { itemId: ID; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const it = item(itemId);
  const lots = db.lots.filter((l) => l.itemId === itemId && l.status === "tersedia" && l.qty > 1e-6);
  const [picked, setPicked] = useState<ID[]>([]);
  const [location, setLocation] = useState(db.settings.defaultLocation);
  const [dims, setDims] = useState({ length: 0, width: 0, thickness: 0 });
  const chosen = lots.filter((l) => picked.includes(l.id));
  const qty = chosen.reduce((a, l) => a + l.qty, 0);
  const value = chosen.reduce((a, l) => a + l.qty * l.unitCost, 0);
  const mixed = new Set(chosen.map((l) => `${l.isRemnant}|${l.reservedForWo ?? ""}`)).size > 1;
  const toggle = (id: ID) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  return (
    <div className="flex flex-col gap-4">
      <fieldset className="rounded-md border border-[var(--rule)]">
        <legend className="sr-only">Lots to merge</legend>
        <ul className="max-h-64 divide-y divide-[var(--rule)] overflow-y-auto">
          {lots.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-default/40">
                <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} className="accent-[var(--accent)]" />
                <span className="flex-1">
                  <b className="font-medium">{l.code}</b>
                  {l.isRemnant && <span className="text-success"> · offcut</span>}
                  <span className="text-muted">
                    {" "}
                    · {l.location}
                    {l.dimensions ? ` · ${l.dimensions.length}×${l.dimensions.width}${l.dimensions.thickness ? `×${l.dimensions.thickness}` : ""} mm` : ""}
                  </span>
                </span>
                <span className="num">{formatQty(l.qty, it?.uom)}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <SelectInput label="Merged lot location" value={location} onChange={setLocation} options={db.settings.locations.map((l) => ({ id: l, label: l }))} />
        <div className="grid grid-cols-3 gap-2">
          <NumberInput label="L (mm)" value={dims.length} onChange={(v) => setDims({ ...dims, length: v })} />
          <NumberInput label="W (mm)" value={dims.width} onChange={(v) => setDims({ ...dims, width: v })} />
          <NumberInput label="T (mm)" value={dims.thickness} onChange={(v) => setDims({ ...dims, thickness: v })} />
        </div>
      </div>
      <div className="rounded-md bg-default/60 p-3 text-sm">
        <div className="flex justify-between">
          <span>Merged result</span>
          <b className="num">
            {formatQty(qty, it?.uom)} · {qty ? formatIDR(value / qty) : "—"}/{it ? UOM_LABEL[it.uom] : ""}
          </b>
        </div>
        {mixed && <p className="mt-1 text-danger">Offcuts cannot be merged with regular or reserved stock.</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Cancel
        </Button>
        <Button
          isDisabled={chosen.length < 2 || mixed}
          onPress={() => {
            const ok = run(
              (d) => mergeLots(d, picked, { location, dimensions: dims.length && dims.width ? { length: dims.length, width: dims.width, thickness: dims.thickness || undefined } : undefined }),
              (l) => `${chosen.length} lots merged into ${l.code}`,
            );
            if (ok) onDone();
          }}
        >
          Merge {chosen.length >= 2 ? `${chosen.length} lots` : ""}
        </Button>
      </div>
    </div>
  );
}
