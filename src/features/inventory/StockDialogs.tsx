import { Button } from "@heroui/react";
import { useState } from "react";
import { addOpeningStock, adjustLotQty, updateLotInfo, type ID, type Lot } from "@/domain";
import { NumberInput, SelectInput, SwitchInput, TextInput } from "@/components/fields";
import { TaskModal } from "@/components/ui";
import { formatQty, UOM_LABEL } from "@/lib/format";
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
      title={`Tambah stok ${it?.name ?? ""}`}
      description="Untuk saldo awal atau stok yang ditemukan saat opname. Pembelian baru sebaiknya lewat menu Pembelian."
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Batal
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
                (l) => `Lot ${l.code} ditambahkan`,
              );
              if (ok) onOpenChange(false);
            }}
          >
            Simpan
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-3">
          <NumberInput label="Qty" value={qty} onChange={setQty} suffix={it ? UOM_LABEL[it.uom] : undefined} />
          <NumberInput label="Harga pokok / satuan" value={unitCost} onChange={setUnitCost} money />
        </div>
        <SelectInput label="Lokasi" value={location} onChange={setLocation} options={db.settings.locations.map((l) => ({ id: l, label: l }))} />
        {it?.kind === "material" && <SwitchInput isSelected={isRemnant} onChange={setIsRemnant} label="Ini sisa / potongan" description="Akan diprioritaskan saat pengambilan bahan." />}
        {it?.kind === "material" && (
          <div className="grid grid-cols-3 gap-2">
            <NumberInput label="P (mm)" value={dims.length} onChange={(length) => setDims({ ...dims, length })} maximumFractionDigits={0} />
            <NumberInput label="L (mm)" value={dims.width} onChange={(width) => setDims({ ...dims, width })} maximumFractionDigits={0} />
            <NumberInput label="T (mm)" value={dims.thickness} onChange={(thickness) => setDims({ ...dims, thickness })} maximumFractionDigits={0} />
          </div>
        )}
        <TextInput label="Catatan" value={note} onChange={setNote} />
      </div>
    </TaskModal>
  );
}

/** Stock opname for a single lot, plus location change. */
export function LotAdjustDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  return (
    <TaskModal isOpen={!!lot} onOpenChange={(o) => !o && onClose()} size="sm" title={`Opname ${lot?.code ?? ""}`} description="Masukkan jumlah fisik hasil hitung. Selisih dicatat sebagai penyesuaian.">
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
      <NumberInput label="Qty fisik" value={counted} onChange={setCounted} suffix={it ? UOM_LABEL[it.uom] : undefined} description={`Tercatat ${formatQty(lot.qty, it?.uom)}${diff ? ` · selisih ${diff > 0 ? "+" : ""}${formatQty(diff, it?.uom)}` : ""}`} />
      <SelectInput
        label="Lokasi"
        value={location}
        onChange={setLocation}
        options={[...new Set([...db.settings.locations, lot.location])].map((l) => ({ id: l, label: l }))}
      />
      <TextInput label="Alasan" value={note} onChange={setNote} placeholder="mis. hasil opname bulanan" />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button
          onPress={() => {
            const ok = run((d) => {
              if (location !== lot.location) updateLotInfo(d, lot.id, { location });
              return adjustLotQty(d, lot.id, counted, note || undefined);
            }, "Stok diperbarui");
            if (ok) onDone();
          }}
        >
          Simpan
        </Button>
      </div>
    </div>
  );
}
