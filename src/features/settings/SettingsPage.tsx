import { Button, toast } from "@heroui/react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { DomainError, parseBackup, serializeBackup, updateSettings, type Currency, type Settings } from "@/domain";
import { NumberInput, TextInput } from "@/components/fields";
import { ConfirmButton, PageHeader, Row, Section } from "@/components/ui";
import { formatIDR } from "@/lib/format";
import { STORAGE_KEY, useDb, useDbStore, useRun } from "@/store/db-store";

export default function SettingsPage() {
  const db = useDb();
  return <SettingsForm key={JSON.stringify(db.settings)} initial={db.settings} />;
}

function SettingsForm({ initial }: { initial: Settings }) {
  const db = useDb();
  const run = useRun();
  const { replace, resetDemo, clearAll, isDemo } = useDbStore();
  const [s, setS] = useState<Settings>(initial);
  const [locations, setLocations] = useState(initial.locations.join(", "));
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Settings>(key: K, v: Settings[K]) => setS({ ...s, [key]: v });

  let storageKb = 0;
  try {
    storageKb = Math.round(((localStorage.getItem(STORAGE_KEY)?.length ?? 0) * 2) / 1024);
  } catch {
    /* storage unavailable */
  }

  const save = () =>
    run(
      (d) =>
        updateSettings(d, {
          ...s,
          locations: locations
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      "Pengaturan disimpan",
    );

  const exportBackup = () => {
    const blob = new Blob([serializeBackup(db)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mebelos-cadangan-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Cadangan diunduh");
  };

  const importBackup = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      replace(data);
      toast.success("Data dipulihkan dari cadangan", { description: `${data.items.length} item, ${data.lots.length} lot.` });
    } catch (e) {
      toast.danger(e instanceof DomainError ? e.message : "Gagal membaca file cadangan");
    }
  };

  const currencies = Object.keys(s.exchangeRates) as Exclude<Currency, "IDR">[];

  return (
    <>
      <PageHeader title="Pengaturan" description="Profil perusahaan, tarif biaya standar, kurs, dan pengelolaan data." actions={<Button onPress={save}>Simpan pengaturan</Button>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Perusahaan" description="Tampil di proforma invoice dan packing list.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" label="Nama perusahaan" value={s.companyName} onChange={(v) => set("companyName", v)} isRequired />
            <TextInput className="sm:col-span-2" label="Alamat" value={s.companyAddress} onChange={(v) => set("companyAddress", v)} />
            <TextInput label="Telepon" value={s.companyPhone} onChange={(v) => set("companyPhone", v)} />
            <TextInput label="Email" value={s.companyEmail} onChange={(v) => set("companyEmail", v)} />
            <TextInput label="NPWP" value={s.npwp} onChange={(v) => set("npwp", v)} />
          </div>
        </Section>
        <Section title="Biaya standar produksi" description="Dipakai sebagai default perintah kerja baru dan HPP standar.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberInput label="Tarif tenaga kerja / jam" value={s.laborRatePerHour} onChange={(v) => set("laborRatePerHour", v)} money />
            <NumberInput label="Overhead / jam kerja" value={s.overheadPerLaborHour} onChange={(v) => set("overheadPerLaborHour", v)} money description="Listrik, penyusutan mesin, sewa workshop dibagi jam kerja." />
          </div>
          <p className="mt-3 text-xs text-muted">Contoh: 6 jam kerja → {formatIDR(6 * (s.laborRatePerHour + s.overheadPerLaborHour))} biaya konversi.</p>
        </Section>
        <Section title="Kurs default" description="Rupiah per 1 unit mata uang asing. Bisa diubah per order.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {currencies.map((c) => (
              <NumberInput key={c} label={c} value={s.exchangeRates[c]} onChange={(v) => set("exchangeRates", { ...s.exchangeRates, [c]: v })} money />
            ))}
          </div>
        </Section>
        <Section title="Gudang & pengingat">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" label="Lokasi gudang (pisahkan dengan koma)" value={locations} onChange={setLocations} description="Lokasi pertama menjadi default." />
            <NumberInput label="Sisa dianggap lama setelah" value={s.remnantAgingDays} onChange={(v) => set("remnantAgingDays", v)} suffix="hari" maximumFractionDigits={0} />
            <NumberInput label="Ingatkan sewa sebelum jatuh tempo" value={s.rentalReminderDays} onChange={(v) => set("rentalReminderDays", v)} suffix="hari" maximumFractionDigits={0} />
          </div>
        </Section>
        <Section title="Data" description="Semua data tersimpan di browser perangkat ini (tanpa server). Cadangkan secara rutin dan simpan file di tempat aman." className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <Row label="Item" value={db.items.length} />
              <Row label="Lot stok" value={db.lots.length} />
              <Row label="Mutasi" value={db.moves.length} />
              <Row label="Transaksi" value={db.purchases.length + db.workOrders.length + db.sales.length + db.rentals.length} />
              <Row label="Ukuran data" value={`±${storageKb.toLocaleString("id-ID")} KB dari ±5.000 KB`} muted />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onPress={exportBackup}>
                <Download className="size-4" /> Unduh cadangan (.json)
              </Button>
              <Button variant="secondary" onPress={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Pulihkan dari cadangan
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void importBackup(f);
                  e.target.value = "";
                }}
              />
              <ConfirmButton
                variant="secondary"
                title="Muat ulang data demo?"
                description="Semua data saat ini diganti dengan data contoh. Unduh cadangan dulu bila perlu."
                confirmLabel="Muat data demo"
                danger
                onConfirm={() => {
                  resetDemo();
                  toast.success("Data demo dimuat");
                }}
              >
                <RotateCcw className="size-4" /> Muat data demo
              </ConfirmButton>
              <ConfirmButton
                variant="danger-soft"
                title={isDemo ? "Mulai dengan data kosong?" : "Hapus semua data?"}
                description="Seluruh item, stok, dan transaksi akan dihapus dari perangkat ini. Tindakan ini tidak bisa dibatalkan."
                confirmLabel="Hapus semua"
                danger
                onConfirm={() => {
                  clearAll();
                  toast.success("Data dikosongkan — mulai dengan menambah material dan produk");
                }}
              >
                Mulai dengan data kosong
              </ConfirmButton>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
