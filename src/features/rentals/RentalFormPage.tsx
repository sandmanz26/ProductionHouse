import { Button, Card, ToggleButton, ToggleButtonGroup, type Key } from "@heroui/react";
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  addDays,
  availableForRange,
  createRental,
  rentalDays,
  sum,
  today,
  updateRental,
  type ID,
  type RentalInput,
  type RentalKind,
} from "@/domain";
import { DateInput, NumberInput, TextAreaInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker, PartnerPicker } from "@/components/pickers";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { useDb, useLookups, useRun } from "@/store/db-store";

interface Line {
  key: string;
  itemId: ID | null;
  qty: number;
  ratePerDay: number;
}
let seq = 0;
const k = () => `w${++seq}`;

export default function RentalFormPage() {
  const { id } = useParams();
  const db = useDb();
  const r = id ? db.rentals.find((x) => x.id === id) : undefined;
  if (id && !r) return <RecordNotFound what="Sewa" back="/sewa" />;
  if (r && r.status !== "dipesan") return <RecordNotFound what="Booking yang bisa diubah" back={`/sewa/${r.id}`} />;
  return <RentalForm key={id ?? "new"} existingId={r?.id} />;
}

function RentalForm({ existingId }: { existingId?: ID }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const existing = existingId ? db.rentals.find((x) => x.id === existingId) : undefined;

  const [kind, setKind] = useState<RentalKind>(existing?.kind ?? "sewa");
  const [customerId, setCustomerId] = useState<ID | null>(existing?.customerId ?? null);
  const [project, setProject] = useState(existing?.project ?? "");
  const [startDate, setStartDate] = useState(existing?.startDate ?? today());
  const [endDate, setEndDate] = useState(existing?.endDate ?? addDays(today(), 2));
  const [lines, setLines] = useState<Line[]>(
    existing?.lines.map((l) => ({ key: k(), itemId: l.itemId, qty: l.qty, ratePerDay: l.ratePerDay })) ?? [{ key: k(), itemId: null, qty: 1, ratePerDay: 0 }],
  );
  const [deposit, setDeposit] = useState(existing?.deposit ?? 0);
  const [discount, setDiscount] = useState(existing?.discount ?? 0);
  const [note, setNote] = useState(existing?.note ?? "");

  const validDates = !!startDate && !!endDate && endDate >= startDate;
  const days = validDates ? rentalDays(startDate, endDate) : 0;
  const input: RentalInput = {
    kind,
    customerId: customerId ?? undefined,
    project,
    startDate,
    endDate,
    lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId!, qty: l.qty, ratePerDay: kind === "pinjam" ? 0 : l.ratePerDay })),
    deposit,
    discount,
    note: note || undefined,
  };
  const base = sum(input.lines.map((l) => l.qty * l.ratePerDay * days));
  const availability = new Map(
    input.lines.map((l) => [l.itemId, validDates ? availableForRange(db, l.itemId, startDate, endDate, { excludeRentalId: existing?.id }) : undefined]),
  );
  const overbooked = input.lines.filter((l) => {
    const a = availability.get(l.itemId);
    const requested = sum(input.lines.filter((x) => x.itemId === l.itemId).map((x) => x.qty));
    return a && requested > a.available;
  });

  const save = () => {
    const r = run((d) => (existing ? updateRental(d, existing.id, input) : createRental(d, input)), (x) => `Booking ${x.code} disimpan`);
    if (r) navigate(`/sewa/${r.id}`, { replace: true });
  };
  const update = (key: string, patch: Partial<Line>) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  return (
    <>
      <PageHeader title={existing ? `Ubah ${existing.code}` : "Booking sewa / pinjam"} back={existing ? `/sewa/${existing.id}` : "/sewa"} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Detail">
            <div className="flex flex-col gap-4">
              <ToggleButtonGroup
                selectionMode="single"
                disallowEmptySelection
                selectedKeys={[kind]}
                onSelectionChange={(keys: Set<Key>) => {
                  const v = [...keys][0];
                  if (v) setKind(v as RentalKind);
                }}
                aria-label="Jenis"
              >
                <ToggleButton id="sewa">Sewa (berbayar)</ToggleButton>
                <ToggleButton id="pinjam">Pinjam (tanpa biaya)</ToggleButton>
              </ToggleButtonGroup>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput label="Nama acara / proyek" value={project} onChange={setProject} placeholder="mis. Syuting iklan, wedding, pameran" isRequired />
                <PartnerPicker role="customer" value={customerId} onChange={setCustomerId} label="Klien" />
                <DateInput label="Mulai" value={startDate} onChange={setStartDate} isRequired />
                <DateInput
                  label="Kembali"
                  value={endDate}
                  onChange={setEndDate}
                  isRequired
                  errorMessage={startDate && endDate && endDate < startDate ? "Tanggal kembali sebelum tanggal mulai" : undefined}
                  description={validDates ? `${days} hari (termasuk hari mulai)` : undefined}
                />
              </div>
            </div>
          </Section>
          <Section title="Unit">
            <div className="flex flex-col gap-3">
              {lines.map((l) => {
                const a = l.itemId ? availability.get(l.itemId) : undefined;
                const requested = sum(lines.filter((x) => x.itemId === l.itemId).map((x) => x.qty));
                const ok = a ? requested <= a.available : true;
                return (
                  <div key={l.key}>
                    <div className={`grid grid-cols-1 items-end gap-2 ${kind === "sewa" ? "sm:grid-cols-[1fr_6rem_10rem_auto]" : "sm:grid-cols-[1fr_6rem_auto]"}`}>
                      <ItemPicker
                        kind="product"
                        value={l.itemId}
                        onChange={(itemId) => update(l.key, { itemId, ratePerDay: l.ratePerDay || item(itemId ?? undefined)?.rentalRatePerDay || 0 })}
                        aria-label="Produk"
                      />
                      <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix="unit" maximumFractionDigits={0} minValue={1} />
                      {kind === "sewa" && <NumberInput aria-label="Tarif per hari" value={l.ratePerDay} onChange={(ratePerDay) => update(l.key, { ratePerDay })} money />}
                      <Button isIconOnly variant="ghost" aria-label="Hapus" isDisabled={lines.length === 1} onPress={() => setLines(lines.filter((x) => x.key !== l.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                    {a && (
                      <p className={`mt-1 flex items-center gap-1 text-xs ${ok ? "text-success" : "text-danger"}`}>
                        {ok ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
                        {a.available} dari {a.owned} unit tersedia di tanggal ini
                        {a.held > 0 && ` (${a.held} dibooking acara lain)`}
                      </p>
                    )}
                  </div>
                );
              })}
              <div>
                <Button size="sm" variant="tertiary" onPress={() => setLines([...lines, { key: k(), itemId: null, qty: 1, ratePerDay: 0 }])}>
                  <Plus className="size-4" /> Tambah unit
                </Button>
              </div>
            </div>
          </Section>
          <Section title="Lainnya">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <NumberInput label="Deposit / jaminan" value={deposit} onChange={setDeposit} money />
              {kind === "sewa" && <NumberInput label="Diskon" value={discount} onChange={setDiscount} money />}
              <TextAreaInput className="sm:col-span-2" label="Catatan" value={note} onChange={setNote} rows={2} placeholder="Alamat lokasi, PIC lapangan, syarat khusus…" />
            </div>
          </Section>
        </div>
        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Ringkasan</Card.Title>
            </Card.Header>
            <Card.Content>
              <Row label="Durasi" value={`${days} hari`} />
              <Row label="Unit" value={sum(input.lines.map((l) => l.qty))} />
              {kind === "sewa" && (
                <>
                  <Row label="Biaya sewa" value={formatIDR(base)} />
                  {discount > 0 && <Row label="Diskon" value={`− ${formatIDR(discount)}`} />}
                  <div className="my-2 border-t border-separator" />
                  <Row label="Total" value={formatIDR(Math.max(0, base - discount))} strong />
                </>
              )}
              <Row label="Deposit" value={formatIDR(deposit)} muted />
              {overbooked.length > 0 && (
                <p className="mt-3 rounded-xl bg-danger-soft p-3 text-xs text-danger-soft-foreground">
                  Unit tidak cukup di tanggal ini. Booking tetap bisa disimpan (mis. unit sedang diproduksi), tetapi serah unit akan ditolak bila stok belum ada.
                </p>
              )}
            </Card.Content>
            <Card.Footer>
              <Button onPress={save} isDisabled={!validDates || !project.trim() || input.lines.length === 0} fullWidth>
                Simpan booking
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}
