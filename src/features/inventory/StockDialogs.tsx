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

/** Move part of a lot to another location (e.g. gudang → workshop). */
export function TransferDialog({ lot, onClose }: { lot: Lot | null; onClose: () => void }) {
  return (
    <TaskModal isOpen={!!lot} onOpenChange={(o) => !o && onClose()} size="sm" title={`Pindah ${lot?.code ?? ""}`} description="Harga pokok ikut berpindah; stok total tidak berubah.">
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
        Dari <b>{lot.location}</b> · tersedia {formatQty(lot.qty, it?.uom)}
      </p>
      <NumberInput label="Qty dipindah" value={qty} onChange={setQty} maxValue={lot.qty} suffix={it ? UOM_LABEL[it.uom] : undefined} />
      <SelectInput label="Ke lokasi" value={to} onChange={setTo} options={targets.map((l) => ({ id: l, label: l }))} placeholder={targets.length ? "Pilih…" : "Tambah lokasi di Pengaturan"} />
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button
          isDisabled={!to || qty <= 0}
          onPress={() => {
            const ok = run((d) => transferLot(d, lot.id, qty, to), `${formatQty(qty, it?.uom)} dipindah ke ${to}`);
            if (ok) onDone();
          }}
        >
          Pindahkan
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
      title="Gabung lot"
      description="Satukan beberapa lot barang yang sama — mis. potongan sisa berukuran sama diikat jadi satu. Harga pokok menjadi rata-rata tertimbang; jejak asal tetap tersimpan."
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
        <legend className="sr-only">Lot yang digabung</legend>
        <ul className="max-h-64 divide-y divide-[var(--rule)] overflow-y-auto">
          {lots.map((l) => (
            <li key={l.id}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-[13px] hover:bg-default/40">
                <input type="checkbox" checked={picked.includes(l.id)} onChange={() => toggle(l.id)} className="accent-[var(--accent)]" />
                <span className="flex-1">
                  <b className="font-medium">{l.code}</b>
                  {l.isRemnant && <span className="text-success"> · sisa</span>}
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
        <SelectInput label="Lokasi lot gabungan" value={location} onChange={setLocation} options={db.settings.locations.map((l) => ({ id: l, label: l }))} />
        <div className="grid grid-cols-3 gap-2">
          <NumberInput label="P (mm)" value={dims.length} onChange={(v) => setDims({ ...dims, length: v })} />
          <NumberInput label="L (mm)" value={dims.width} onChange={(v) => setDims({ ...dims, width: v })} />
          <NumberInput label="T (mm)" value={dims.thickness} onChange={(v) => setDims({ ...dims, thickness: v })} />
        </div>
      </div>
      <div className="rounded-md bg-default/60 p-3 text-sm">
        <div className="flex justify-between">
          <span>Hasil gabungan</span>
          <b className="num">
            {formatQty(qty, it?.uom)} · {qty ? formatIDR(value / qty) : "—"}/{it ? UOM_LABEL[it.uom] : ""}
          </b>
        </div>
        {mixed && <p className="mt-1 text-danger">Sisa material tidak bisa digabung dengan stok biasa atau stok yang dicadangkan.</p>}
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button
          isDisabled={chosen.length < 2 || mixed}
          onPress={() => {
            const ok = run(
              (d) => mergeLots(d, picked, { location, dimensions: dims.length && dims.width ? { length: dims.length, width: dims.width, thickness: dims.thickness || undefined } : undefined }),
              (l) => `${chosen.length} lot digabung menjadi ${l.code}`,
            );
            if (ok) onDone();
          }}
        >
          Gabung {chosen.length >= 2 ? `${chosen.length} lot` : ""}
        </Button>
      </div>
    </div>
  );
}
