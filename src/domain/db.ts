import { DomainError } from "./core";
import { isCostingMethod } from "./costing-rules";
import type { CounterKey, Db, Settings } from "./types";

export const SCHEMA_VERSION = 4;

export const defaultSettings = (): Settings => ({
  companyName: "Furniture Production House",
  companyAddress: "",
  companyPhone: "",
  companyEmail: "",
  npwp: "",
  laborRatePerHour: 25_000,
  overheadPerLaborHour: 10_000,
  defaultLocation: "Main warehouse",
  locations: ["Main warehouse", "Workshop", "Showroom"],
  exchangeRates: { USD: 16_250, EUR: 17_600, SGD: 12_400, AUD: 10_600, JPY: 108 },
  remnantAgingDays: 90,
  rentalReminderDays: 2,
  defaultStages: ["Cutting", "Assembly", "Sanding", "Finishing", "QC", "Packing"],
  // FIFO: allowed by PSAK 14 and UU PPh, and matches how timber should rotate in the yard.
  costingMethod: "fifo",
  costingHistory: [],
});

const COUNTERS: CounterKey[] = ["lot", "purchase", "workOrder", "sale", "rental", "adjustment", "item", "partner", "recipe"];

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
    recipes: [],
    counters: Object.fromEntries(COUNTERS.map((k) => [k, 0])) as Db["counters"],
  };
}

const COLLECTIONS = ["items", "partners", "lots", "moves", "purchases", "workOrders", "sales", "rentals", "recipes"] as const;

/**
 * Validates and upgrades persisted/imported data to the current schema. Unknown future
 * versions are rejected rather than silently corrupted.
 */
export function migrate(raw: unknown): Db {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new DomainError("Data format not recognised — choose a Serat backup file.");
  const data = raw as Partial<Db> & { schemaVersion?: number };
  const version = data.schemaVersion ?? 0;
  if (version > SCHEMA_VERSION) {
    throw new DomainError("This data comes from a newer version of the app. Update the app first.");
  }
  for (const key of COLLECTIONS) {
    if (data[key] !== undefined && !Array.isArray(data[key])) throw new DomainError(`Section "${key}" is invalid.`);
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
  normalizeRecords(db);
  checkIntegrity(db);
  return db;
}

const isStr = (v: unknown): v is string => typeof v === "string" && v.length > 0;
const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

/**
 * Rejects data whose records are malformed or point at things that do not exist. Importing such a
 * file would make stock, job cost and ledgers silently wrong, so it is refused with a clear message.
 */
function checkIntegrity(db: Db) {
  const problems: string[] = [];
  const fail = (msg: string) => problems.length < 5 && problems.push(msg);
  for (const key of COLLECTIONS) {
    const ids = new Set<string>();
    (db[key] as { id?: unknown }[]).forEach((rec, i) => {
      if (!rec || typeof rec !== "object" || !isStr(rec.id)) return fail(`${key}[${i}] has no id`);
      if (ids.has(rec.id)) fail(`${key}: duplicate id ${rec.id}`);
      ids.add(rec.id);
    });
  }
  const itemIds = new Set(db.items.map((i) => i.id));
  const lotIds = new Set(db.lots.map((l) => l.id));
  db.items.forEach((it, i) => {
    if (!isStr(it.name) || !isStr(it.sku)) fail(`items[${i}] has no name/code`);
    if (it.kind !== "material" && it.kind !== "product") fail(`items[${i}] has an unknown type`);
    if (!isNum(it.standardCost)) fail(`items[${i}] standard cost is not a number`);
    for (const b of it.bom ?? []) if (!itemIds.has(b.materialId) || !isNum(b.qty)) fail(`items[${i}] has a broken BOM`);
    if (it.costingMethod !== undefined && !isCostingMethod(it.costingMethod)) fail(`items[${i}] has an unknown costing method`);
  });
  db.partners.forEach((p, i) => {
    if (!isStr(p.name) || (p.role !== "customer" && p.role !== "supplier")) fail(`partners[${i}] is invalid`);
  });
  db.lots.forEach((l, i) => {
    if (!itemIds.has(l.itemId)) fail(`lots[${i}] points to an item that does not exist`);
    if (!isNum(l.qty) || l.qty < 0 || !isNum(l.unitCost)) fail(`lots[${i}] qty/cost is not a number`);
  });
  db.moves.forEach((m, i) => {
    if (!lotIds.has(m.lotId) || !itemIds.has(m.itemId)) fail(`moves[${i}] points to a lot/item that does not exist`);
    if (!isNum(m.qty)) fail(`moves[${i}] qty is not a number`);
  });
  const docLines: [string, { lines?: { itemId?: unknown; qty?: unknown }[] }[]][] = [
    ["purchases", db.purchases],
    ["sales", db.sales],
    ["rentals", db.rentals],
  ];
  for (const [key, docs] of docLines) {
    docs.forEach((d, i) => {
      if (!Array.isArray(d.lines)) return fail(`${key}[${i}] has no lines`);
      for (const l of d.lines) if (!itemIds.has(l.itemId as string) || !isNum(l.qty)) fail(`${key}[${i}] has a broken line`);
    });
  }
  db.recipes.forEach((r, i) => {
    if (!isStr(r.name) || !Array.isArray(r.inputs) || !Array.isArray(r.outputs)) return fail(`recipes[${i}] is incomplete`);
    for (const l of [...r.inputs, ...r.outputs]) if (!itemIds.has(l.itemId) || !isNum(l.qty)) fail(`recipes[${i}] has a broken line`);
  });
  db.workOrders.forEach((w, i) => {
    if (!Array.isArray(w.plannedOutputs) || !Array.isArray(w.issues)) return fail(`workOrders[${i}] is incomplete`);
    for (const o of w.plannedOutputs) if (!itemIds.has(o.itemId)) fail(`workOrders[${i}] output points to an item that does not exist`);
  });
  if (!Array.isArray(db.settings.locations) || !db.settings.locations.length) fail("settings have no locations");
  if (problems.length) {
    throw new DomainError(`Backup data is damaged and was not loaded: ${problems.join("; ")}.`);
  }
}

/** Fills fields added in later schema versions so older data keeps working (v1 → … → v4). */
function normalizeRecords(db: Db) {
  db.workOrders = db.workOrders.map((w) => ({ ...w, stages: w.stages ?? [], laborLogs: w.laborLogs ?? [], receipts: w.receipts ?? [] }));
  db.sales = db.sales.map((s) => ({ ...s, payments: s.payments ?? [], returns: s.returns ?? [] }));
  db.purchases = db.purchases.map((p) => ({ ...p, payments: p.payments ?? [] }));
  db.rentals = db.rentals.map((r) => ({ ...r, payments: r.payments ?? [], extraCharges: r.extraCharges ?? [] }));
  if (!db.settings.defaultStages?.length) db.settings.defaultStages = defaultSettings().defaultStages;
  // v3: cost formula. Earlier versions suggested oldest lots first, which is FIFO.
  if (!isCostingMethod(db.settings.costingMethod)) db.settings.costingMethod = "fifo";
  if (!Array.isArray(db.settings.costingHistory)) db.settings.costingHistory = [];
}

export function parseBackup(json: string): Db {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new DomainError("Backup file is not valid JSON — choose a file exported from Serat.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new DomainError("Backup file holds no app data — choose a file exported from Serat.");
  }
  // "mebelos" is the product's former name; files exported before the rename still import.
  const app = (parsed as { app?: string }).app;
  const payload = app === "serat" || app === "mebelos" ? (parsed as { data: unknown }).data : parsed;
  return migrate(payload);
}

export function serializeBackup(db: Db): string {
  return JSON.stringify({ app: "serat", exportedAt: new Date().toISOString(), data: db }, null, 2);
}
