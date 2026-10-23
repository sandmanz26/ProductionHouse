import { Button, toast } from "@heroui/react";
import { Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { COSTING_LABEL, DomainError, parseBackup, serializeBackup, updateSettings, type Currency, type Settings } from "@/domain";
import { CostingMethodPicker } from "@/components/costing";
import { NumberInput, TextInput } from "@/components/fields";
import { ConfirmButton, PageHeader, Row, Section } from "@/components/ui";
import { formatDate, formatIDR } from "@/lib/format";
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
  const [stages, setStages] = useState(initial.defaultStages.join(", "));
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
          defaultStages: stages
            .split(",")
            .map((x) => x.trim())
            .filter(Boolean),
        }),
      "Settings saved",
    );

  const exportBackup = () => {
    const blob = new Blob([serializeBackup(db)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `serat-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Backup downloaded");
  };

  const importBackup = async (file: File) => {
    try {
      const data = parseBackup(await file.text());
      replace(data);
      toast.success("Data restored from backup", { description: `${data.items.length} items, ${data.lots.length} lots.` });
    } catch (e) {
      toast.danger(e instanceof DomainError ? e.message : "Could not read the backup file");
    }
  };

  const currencies = Object.keys(s.exchangeRates) as Exclude<Currency, "IDR">[];

  return (
    <>
      <PageHeader title="Settings" description="Company profile, standard cost rates, exchange rates and data management." actions={<Button onPress={save}>Save settings</Button>} />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section title="Company" description="Shown on the proforma invoice and packing list.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" label="Company name" value={s.companyName} onChange={(v) => set("companyName", v)} isRequired />
            <TextInput className="sm:col-span-2" label="Address" value={s.companyAddress} onChange={(v) => set("companyAddress", v)} />
            <TextInput label="Phone" value={s.companyPhone} onChange={(v) => set("companyPhone", v)} />
            <TextInput label="Email" value={s.companyEmail} onChange={(v) => set("companyEmail", v)} />
            <TextInput label="Tax ID (NPWP)" value={s.npwp} onChange={(v) => set("npwp", v)} />
          </div>
        </Section>
        <Section title="Standard production costs" description="Used as the default for new work orders and for the standard cost.">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <NumberInput label="Labour rate / hour" value={s.laborRatePerHour} onChange={(v) => set("laborRatePerHour", v)} money />
            <NumberInput label="Overhead / labour hour" value={s.overheadPerLaborHour} onChange={(v) => set("overheadPerLaborHour", v)} money description="Electricity, machine depreciation and workshop rent divided by labour hours." />
          </div>
          <div className="mt-3">
            <TextInput label="Default stage route" value={stages} onChange={setStages} description="Used by new work orders when the product has no route of its own. Separate with commas." />
          </div>
          <p className="mt-3 text-xs text-muted">Example: 6 labour hours → {formatIDR(6 * (s.laborRatePerHour + s.overheadPerLaborHour))} conversion cost.</p>
        </Section>
        <Section title="Default exchange rates" description="Rupiah per 1 unit of foreign currency. Can be changed per order.">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {currencies.map((c) => (
              <NumberInput key={c} label={c} value={s.exchangeRates[c]} onChange={(v) => set("exchangeRates", { ...s.exchangeRates, [c]: v })} money />
            ))}
          </div>
        </Section>
        <Section title="Warehouse & reminders">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextInput className="sm:col-span-2" label="Warehouse locations (separate with commas)" value={locations} onChange={setLocations} description="The first location is the default." />
            <NumberInput label="Offcuts count as old after" value={s.remnantAgingDays} onChange={(v) => set("remnantAgingDays", v)} suffix="days" maximumFractionDigits={0} />
            <NumberInput label="Remind about rentals before the due date" value={s.rentalReminderDays} onChange={(v) => set("rentalReminderDays", v)} suffix="days" maximumFractionDigits={0} />
          </div>
        </Section>
        <Section
          title="Inventory costing method"
          description="Sets the material price charged to work orders and the COGS of goods shipped. Offcuts, items bought for one specific job and damaged units always use their own lot price."
          className="xl:col-span-2"
        >
          <CostingMethodPicker name="costing-method" value={s.costingMethod} onChange={(m) => set("costingMethod", m)} />
          {s.costingMethod === "lifo" && (
            <p className="mt-3 border-l-2 border-danger pl-3 text-[13px] text-danger">
              LIFO is not accepted by PSAK 14 (since 2009) or by Income Tax Law Article 10(6). Use it for internal analysis only; financial
              statements and tax returns (SPT) must be recalculated with FIFO or moving average.
            </p>
          )}
          {s.costingMethod !== initial.costingMethod && (
            <p className="mt-3 border-l-2 border-warning pl-3 text-[13px]">
              Applies to goods that go out after you save; values already recorded do not change
              {s.costingMethod === "rata_rata" ? ", except that existing stock is averaged right away" : ""}. Income tax law requires the method to be
              used consistently — a change for tax purposes needs approval from the tax office (DJP).
            </p>
          )}
          {initial.costingHistory.length > 0 && (
            <div className="mt-4">
              <p className="caption-label">Change history</p>
              <ul className="mt-1 divide-y divide-[var(--rule)] text-[13px]">
                {[...initial.costingHistory].reverse().slice(0, 8).map((h, i) => (
                  <li key={i} className="flex flex-wrap justify-between gap-2 py-1.5">
                    <span>
                      {COSTING_LABEL[h.from]} → <b>{COSTING_LABEL[h.to]}</b>
                      {h.itemId && <span className="text-muted"> · {db.items.find((x) => x.id === h.itemId)?.name ?? "item"}</span>}
                    </span>
                    <span className="num text-xs text-muted">{formatDate(h.at)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Section>
        <Section title="Data" description="All data is saved in this device's browser (no server). Back up regularly and keep the file somewhere safe." className="xl:col-span-2">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <div>
              <Row label="Items" value={db.items.length} />
              <Row label="Stock lots" value={db.lots.length} />
              <Row label="Stock movements" value={db.moves.length} />
              <Row label="Transactions" value={db.purchases.length + db.workOrders.length + db.sales.length + db.rentals.length} />
              <Row label="Data size" value={`±${storageKb.toLocaleString("en-US")} KB of ±5,000 KB`} muted />
            </div>
            <div className="flex flex-col gap-2">
              <Button variant="secondary" onPress={exportBackup}>
                <Download className="size-4" /> Download backup (.json)
              </Button>
              <Button variant="secondary" onPress={() => fileRef.current?.click()}>
                <Upload className="size-4" /> Restore from backup
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
                title="Reload the demo data?"
                description="All current data is replaced with the sample data. Download a backup first if needed."
                confirmLabel="Load demo data"
                danger
                onConfirm={() => {
                  resetDemo();
                  toast.success("Demo data loaded");
                }}
              >
                <RotateCcw className="size-4" /> Load demo data
              </ConfirmButton>
              <ConfirmButton
                variant="danger-soft"
                title={isDemo ? "Start with empty data?" : "Delete all data?"}
                description="All items, stock and transactions will be deleted from this device. This cannot be undone."
                confirmLabel="Delete all"
                danger
                onConfirm={() => {
                  clearAll();
                  toast.success("Data cleared — start by adding materials and products");
                }}
              >
                Start with empty data
              </ConfirmButton>
            </div>
          </div>
        </Section>
      </div>
    </>
  );
}
