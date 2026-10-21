import type { Currency, Uom } from "@/domain";

const LOCALE = "id-ID";

const idr = new Intl.NumberFormat(LOCALE, { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

export const formatIDR = (n: number) => idr.format(Math.round(n || 0));

/** Short money for KPI tiles: Rp 12,4 jt */
export function formatIDRCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${(n / 1e9).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} M`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toLocaleString(LOCALE, { maximumFractionDigits: 1 })} jt`;
  if (abs >= 1e3) return `Rp ${(n / 1e3).toLocaleString(LOCALE, { maximumFractionDigits: 0 })} rb`;
  return formatIDR(n);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(n: number, currency: Currency) {
  if (currency === "IDR") return formatIDR(n);
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 });
    moneyFormatters.set(currency, f);
  }
  return f.format(n || 0);
}

export const formatNumber = (n: number, maxFraction = 3) =>
  (n || 0).toLocaleString(LOCALE, { maximumFractionDigits: maxFraction });

export const formatCompact = (n: number) => compact.format(n || 0);

export const UOM_LABEL: Record<Uom, string> = {
  pcs: "pcs",
  lembar: "lembar",
  batang: "batang",
  m: "m",
  m2: "m²",
  m3: "m³",
  kg: "kg",
  liter: "liter",
  set: "set",
  roll: "roll",
};

export const formatQty = (n: number, uom?: Uom) => `${formatNumber(n, uom === "m3" ? 4 : 3)}${uom ? ` ${UOM_LABEL[uom]}` : ""}`;

export const formatPct = (ratio: number, digits = 1) =>
  `${(ratio * 100).toLocaleString(LOCALE, { maximumFractionDigits: digits })}%`;

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

function toDate(value: string) {
  // Plain dates are local calendar dates, not UTC midnight.
  return value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
}

export const formatDate = (value?: string) => (value ? dateFmt.format(toDate(value)) : "—");
export const formatDateTime = (value?: string) => (value ? dateTimeFmt.format(toDate(value)) : "—");

export function formatDims(d?: { length: number; width: number; thickness?: number }) {
  if (!d) return "";
  const parts = [d.length, d.width, d.thickness].filter((x): x is number => !!x);
  return `${parts.map((x) => formatNumber(x, 1)).join(" × ")} mm`;
}
