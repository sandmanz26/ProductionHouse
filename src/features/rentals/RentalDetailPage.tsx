import { Alert, Button, Link } from "@heroui/react";
import { CalendarPlus, Pencil, Undo2, Wrench, Truck } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  cancelRental,
  checkoutRental,
  createRepairsFromRental,
  EPS,
  extendRental,
  outstandingCheckouts,
  rentalCharges,
  returnRental,
  today,
  type ID,
  type Rental,
  type ReturnCondition,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ConfirmButton, DataTable, KeyValue, PageHeader, Row, Section, StatusChip, TaskModal } from "@/components/ui";
import { formatDate, formatDateTime, formatIDR } from "@/lib/format";
import { RENTAL_STATUS, RETURN_CONDITION, WO_STATUS } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export default function RentalDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [returning, setReturning] = useState(false);
  const [extending, setExtending] = useState(false);
  const r = db.rentals.find((x) => x.id === id);
  if (!r) return <RecordNotFound what="Sewa" back="/sewa" />;

  const t = today();
  const ch = rentalCharges(r, t);
  const out = outstandingCheckouts(r);
  const lotCode = (lotId: ID) => db.lots.find((l) => l.id === lotId)?.code ?? "?";
  const damagedOpen = r.returns.some((x) => x.condition === "rusak");
  const repairWos = (r.repairWoIds ?? []).map((wid) => db.workOrders.find((w) => w.id === wid)).filter((w) => !!w);
  const hasUnrepaired =
    damagedOpen &&
    db.moves.some(
      (m) =>
        m.ref.id === r.id &&
        m.type === "rusak_sewa" &&
        m.qty === 0 &&
        db.lots.some((l) => l.id === m.lotId && l.status === "rusak" && l.qty > EPS) &&
        !db.workOrders.some((w) => w.status !== "batal" && w.plannedInputs.some((i) => i.lotId === m.lotId)),
    );

  return (
    <>
      <PageHeader
        back="/sewa"
        title={r.project}
        badge={
          <>
            <StatusChip tone={r.kind === "sewa" ? "accent" : "default"}>{r.kind === "sewa" ? "Sewa" : "Pinjam"}</StatusChip>
            <StatusChip tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</StatusChip>
          </>
        }
        description={`${r.code} · ${partnerName(r.customerId)} · ${formatDate(r.startDate)} – ${formatDate(r.endDate)} (${ch.days} hari)`}
        actions={
          <>
            {r.status === "dipesan" && (
              <>
                <ConfirmButton
                  variant="danger-soft"
                  danger
                  title={`Batalkan ${r.code}?`}
                  confirmLabel="Batalkan booking"
                  onConfirm={() => run((d) => cancelRental(d, r.id), `${r.code} dibatalkan`)}
                >
                  Batalkan
                </ConfirmButton>
                <Button variant="secondary" onPress={() => navigate(`/sewa/${r.id}/ubah`)}>
                  <Pencil className="size-4" /> Ubah
                </Button>
                <ConfirmButton
                  variant="primary"
                  title="Serahkan unit ke klien?"
                  description="Unit diambil otomatis dari stok tersedia (terlama dulu) dan berstatus disewa sampai kembali."
                  confirmLabel="Serahkan"
                  onConfirm={() => run((d) => checkoutRental(d, r.id), "Unit diserahkan ke klien")}
                >
                  <Truck className="size-4" /> Serahkan unit
                </ConfirmButton>
              </>
            )}
            {(r.status === "dipesan" || r.status === "berjalan") && (
              <Button variant="secondary" onPress={() => setExtending(true)}>
                <CalendarPlus className="size-4" /> Perpanjang
              </Button>
            )}
            {r.status === "berjalan" && (
              <Button onPress={() => setReturning(true)}>
                <Undo2 className="size-4" /> Terima kembali
              </Button>
            )}
            {hasUnrepaired && (
              <Button
                variant="secondary"
                onPress={() => {
                  const wos = run((d) => createRepairsFromRental(d, r.id), (w) => `${w.length} perintah perbaikan dibuat`);
                  if (wos?.[0]) navigate(`/produksi/${wos[0].id}`);
                }}
              >
                <Wrench className="size-4" /> Buat perintah perbaikan
              </Button>
            )}
          </>
        }
      />

      {ch.isOverdue && (
        <Alert status="danger" className="mb-6">
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Title>Terlambat {ch.lateDays} hari</Alert.Title>
            <Alert.Description>Denda keterlambatan berjalan {formatIDR(ch.lateFee)} (tarif harian × unit × hari terlambat).</Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Unit dibooking" bodyClassName="p-0">
            <DataTable
              label="Unit"
              rows={r.lines}
              columns={[
                { key: "item", header: "Produk", isRowHeader: true, cell: (l) => <span className="font-medium">{item(l.itemId)?.name ?? "?"}</span> },
                { key: "qty", header: "Qty", align: "end", cell: (l) => l.qty },
                { key: "rate", header: "Tarif/hari", align: "end", cell: (l) => formatIDR(l.ratePerDay) },
                { key: "sub", header: "Subtotal", align: "end", cell: (l) => formatIDR(l.qty * l.ratePerDay * ch.days) },
              ]}
            />
          </Section>
          {r.checkouts.length > 0 && (
            <Section title="Serah terima" bodyClassName="p-0">
              <DataTable
                label="Unit diserahkan"
                rows={r.checkouts}
                dependencies={[r.returns]}
                columns={[
                  { key: "lot", header: "Lot", isRowHeader: true, className: "whitespace-nowrap", cell: (c) => <span className="font-medium">{lotCode(c.lotId)}</span> },
                  { key: "item", header: "Produk", cell: (c) => item(c.itemId)?.name ?? "?" },
                  { key: "qty", header: "Diserahkan", align: "end", cell: (c) => c.qty },
                  { key: "out", header: "Masih di klien", align: "end", cell: (c) => out.find((o) => o.id === c.id)?.outstanding ?? 0 },
                  { key: "at", header: "Waktu", cell: (c) => <span className="text-muted">{formatDateTime(c.at)}</span> },
                ]}
              />
            </Section>
          )}
          {r.returns.length > 0 && (
            <Section title="Pengembalian" bodyClassName="p-0">
              <DataTable
                label="Pengembalian"
                rows={r.returns}
                columns={[
                  { key: "at", header: "Waktu", isRowHeader: true, className: "whitespace-nowrap", cell: (x) => formatDateTime(x.at) },
                  { key: "item", header: "Produk", cell: (x) => item(x.itemId)?.name ?? "?" },
                  { key: "qty", header: "Qty", align: "end", cell: (x) => x.qty },
                  { key: "cond", header: "Kondisi", cell: (x) => <StatusChip tone={RETURN_CONDITION[x.condition].tone}>{RETURN_CONDITION[x.condition].label}</StatusChip> },
                  { key: "fee", header: "Biaya", align: "end", cell: (x) => (x.fee ? formatIDR(x.fee) : "—") },
                  { key: "note", header: "Catatan", cell: (x) => <span className="text-muted">{x.note || "—"}</span> },
                ]}
              />
            </Section>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Section title="Tagihan">
            {r.kind === "sewa" && (
              <>
                <Row label={`Sewa ${ch.days} hari`} value={formatIDR(ch.base)} />
                {ch.lateFee > 0 && <Row label={`Denda telat (${ch.lateDays} hari)`} value={formatIDR(ch.lateFee)} tone="danger" />}
              </>
            )}
            {ch.damageFee > 0 && <Row label="Biaya rusak / hilang" value={formatIDR(ch.damageFee)} tone="danger" />}
            {ch.discount > 0 && <Row label="Diskon" value={`− ${formatIDR(ch.discount)}`} />}
            <Row label="Total" value={formatIDR(ch.total)} strong />
            <Row label="Deposit diterima" value={`− ${formatIDR(ch.deposit)}`} muted />
            <div className="my-2 border-t border-separator" />
            <Row
              label={ch.balance >= 0 ? "Kekurangan bayar" : "Deposit dikembalikan"}
              value={formatIDR(Math.abs(ch.balance))}
              strong
              tone={ch.balance > 0 ? "warning" : "success"}
            />
          </Section>
          {repairWos.length > 0 && (
            <Section title="Perbaikan">
              {repairWos.map((w) => (
                <Row key={w.id} label={<Link href={`/produksi/${w.id}`}>{w.code}</Link>} value={<StatusChip tone={WO_STATUS[w.status].tone}>{WO_STATUS[w.status].label}</StatusChip>} />
              ))}
            </Section>
          )}
          <Section title="Info">
            <KeyValue columns={1} items={[["Klien", partnerName(r.customerId)], ["Catatan", r.note]]} />
          </Section>
        </div>
      </div>

      <ReturnDialog rental={r} isOpen={returning} onOpenChange={setReturning} />
      <ExtendDialog key={r.endDate} rental={r} isOpen={extending} onOpenChange={setExtending} />
    </>
  );
}

interface ReturnRow {
  checkoutId: ID;
  condition: ReturnCondition;
  qty: number;
  fee: number;
  note: string;
}

function ReturnDialog({ rental, isOpen, onOpenChange }: { rental: Rental; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <TaskModal isOpen={isOpen} onOpenChange={onOpenChange} title="Terima unit kembali" description="Periksa setiap unit. Unit rusak masuk status rusak dan bisa langsung dibuatkan perintah perbaikan.">
      {isOpen && <ReturnForm rental={rental} onDone={() => onOpenChange(false)} />}
    </TaskModal>
  );
}

function ReturnForm({ rental, onDone }: { rental: Rental; onDone: () => void }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const out = outstandingCheckouts(rental);
  const [rows, setRows] = useState<(ReturnRow & { key: string })[]>(() =>
    out.map((c) => ({ key: c.id, checkoutId: c.id, condition: "baik", qty: c.outstanding, fee: 0, note: "" })),
  );
  const update = (key: string, patch: Partial<ReturnRow>) => setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  const submit = () => {
    const ok = run((d) => returnRental(d, rental.id, rows), "Pengembalian tercatat");
    if (ok) onDone();
  };
  return (
    <div className="flex flex-col gap-3">
      {out.map((c) => {
        const it = item(c.itemId);
        const mine = rows.filter((r) => r.checkoutId === c.id);
        const used = mine.reduce((a, r) => a + r.qty, 0);
        return (
          <div key={c.id} className="rounded-2xl border border-separator p-3">
            <p className="font-medium">
              {it?.name} <span className="text-sm font-normal text-muted">· {db.lots.find((l) => l.id === c.lotId)?.code} · masih di klien {c.outstanding}</span>
            </p>
            {mine.map((r) => (
              <div key={r.key} className="mt-2 grid grid-cols-2 items-end gap-2 sm:grid-cols-[9rem_6rem_9rem_1fr]">
                <SelectInput
                  aria-label="Kondisi"
                  value={r.condition}
                  onChange={(v) => update(r.key, { condition: v as ReturnCondition, ...(v === "baik" ? { fee: 0 } : {}) })}
                  options={(Object.keys(RETURN_CONDITION) as ReturnCondition[]).map((x) => ({ id: x, label: RETURN_CONDITION[x].label }))}
                />
                <NumberInput aria-label="Qty" value={r.qty} onChange={(qty) => update(r.key, { qty })} maximumFractionDigits={0} maxValue={c.outstanding} />
                <NumberInput aria-label="Biaya ganti" value={r.fee} onChange={(fee) => update(r.key, { fee })} money isDisabled={r.condition === "baik"} />
                <TextInput aria-label="Catatan" value={r.note} onChange={(note) => update(r.key, { note })} placeholder={r.condition === "baik" ? "Catatan (opsional)" : "Jelaskan kerusakan"} />
              </div>
            ))}
            {mine.some((r) => r.qty > 1) && (
              <Button
                size="sm"
                variant="tertiary"
                className="mt-2"
                onPress={() => {
                  const donor = [...mine].reverse().find((r) => r.qty > 1)!;
                  setRows([
                    ...rows.map((r) => (r.key === donor.key ? { ...r, qty: r.qty - 1 } : r)),
                    { key: `${c.id}-${Date.now()}`, checkoutId: c.id, condition: "rusak", qty: 1, fee: 0, note: "" },
                  ]);
                }}
              >
                Pisahkan 1 unit dengan kondisi lain
              </Button>
            )}
            {used < c.outstanding && <p className="mt-1 text-xs text-muted">{c.outstanding - used} unit belum kembali — tetap tercatat di klien.</p>}
            {used > c.outstanding && <p className="mt-1 text-xs text-danger">Total qty melebihi unit yang masih di klien.</p>}
          </div>
        );
      })}
      <div className="flex justify-end gap-2">
        <Button variant="tertiary" onPress={onDone}>
          Batal
        </Button>
        <Button onPress={submit}>Simpan pengembalian</Button>
      </div>
    </div>
  );
}

function ExtendDialog({ rental, isOpen, onOpenChange }: { rental: Rental; isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  const run = useRun();
  const [endDate, setEndDate] = useState(rental.endDate);
  return (
    <TaskModal
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      size="sm"
      title="Perpanjang sewa"
      footer={
        <>
          <Button variant="tertiary" onPress={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button onPress={() => run((d) => extendRental(d, rental.id, endDate), "Tanggal kembali diperbarui") && onOpenChange(false)}>Simpan</Button>
        </>
      }
    >
      <DateInput label="Tanggal kembali baru" value={endDate} onChange={setEndDate} />
    </TaskModal>
  );
}
