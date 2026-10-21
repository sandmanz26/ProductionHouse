import { DomainError } from "./core";
import type { CounterKey, Db, Settings } from "./types";

export const SCHEMA_VERSION = 1;

export const defaultSettings = (): Settings => ({
  companyName: "Production House Furnitur",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  npwp: "",
  laborRatePerHour: 25_000,
  overheadPerLaborHour: 10_000,
  defaultLocation: "Gudang Utama",
  locations: ["Gudang Utama", "Workshop", "Showroom"],
  exchangeRates: { USD: 16_250, EUR: 17_600, SGD: 12_400, AUD: 10_600, JPY: 108 },
  remnantAgingDays: 90,
  rentalReminderDays: 2,
});

const COUNTERS: CounterKey[] = ["lot", "purchase", "workOrder", "sale", "rental", "adjustment", "item", "partner"];

export function emptyDb(): Db {
  return {
    schemaVersion: SCHEMA_VERSION,
    settings: defaultSettings(),
    items: [],
    partners: [],
    lots: [],
    moves: [],
    purchases: [],
    workOrders: [],
    sales: [],
    rentals: [],
    counters: Object.fromEntries(COUNTERS.map((k) => [k, 0])) as Db["counters"],
  };
}

const COLLECTIONS = ["items", "partners", "lots", "moves", "purchases", "workOrders", "sales", "rentals"] as const;

/**
 * Validates and upgrades persisted/imported data to the current schema. Unknown future
 * versions are rejected rather than silently corrupted.
 */
export function migrate(raw: unknown): Db {
  if (!raw || typeof raw !== "object") throw new DomainError("Format data tidak dikenali.");
  const data = raw as Partial<Db> & { schemaVersion?: number };
  const version = data.schemaVersion ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new DomainError("Data berasal dari versi aplikasi yang lebih baru. Perbarui aplikasi terlebih dahulu.");
  }
  for (const key of COLLECTIONS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new DomainError(`Bagian "${key}" tidak valid.`);
  }
  const base = emptyDb();
  const db: Db = {
    ...base,
    ...data,
    schemaVersion: SCHEMA_VERSION,
    settings: {
      ...base.settings,
      ...(data.settings ?? {}),
      exchangeRates: { ...base.settings.exchangeRates, ...(data.settings?.exchangeRates ?? {}) },
    },
    counters: { ...base.counters, ...(data.counters ?? {}) },
  };
  for (const key of COLLECTIONS) (db[key] as unknown[]) = (data[key] as unknown[] | undefined) ?? [];
  return db;
}

export function parseBackup(json: string): Db {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DomainError("File cadangan bukan JSON yang valid.");
  }
  const payload = (parsed as { app?: string; data?: unknown }).app === "mebelos" ? (parsed as { data: unknown }).data : parsed;
  return migrate(payload);
}

export function serializeBackup(db: Db): string {
  return JSON.stringify({ app: "mebelos", exportedAt: new Date().toISOString(), data: db }, null, 2);
}
