import type { Currency, Uom } from "@/domain";

/** Dates read the British way ("22 Oct 2026"); numbers use comma thousands ("1,234,567"). */
const LOCALE = "en-GB";
const NUMBER_LOCALE = "en-US";

const idrDigits = new Intl.NumberFormat(NUMBER_LOCALE, { maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat(NUMBER_LOCALE, { notation: "compact", maximumFractionDigits: 1 });

/** Rupiah with comma thousands and no decimals: Rp 1,234,567 / -Rp 1,234,567 */
export function formatIDR(n: number) {
  const v = Math.round(n || 0);
  return `${v < 0 ? "-" : ""}Rp ${idrDigits.format(Math.abs(v))}`;
}

/** Short money for KPI tiles: Rp 12.4M */
export function formatIDRCompact(n: number) {
  const abs = Math.abs(n);
  if (abs >= 1e9) return `Rp ${(n / 1e9).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 1 })}B`;
  if (abs >= 1e6) return `Rp ${(n / 1e6).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 1 })}M`;
  if (abs >= 1e3) return `Rp ${(n / 1e3).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: 0 })}K`;
  return formatIDR(n);
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();
export function formatMoney(n: number, currency: Currency) {
  if (currency === "IDR") return formatIDR(n);
  let f = moneyFormatters.get(currency);
  if (!f) {
    f = new Intl.NumberFormat(NUMBER_LOCALE, { style: "currency", currency, maximumFractionDigits: currency === "JPY" ? 0 : 2 });
    moneyFormatters.set(currency, f);
  }
  return f.format(n || 0);
}

export const formatNumber = (n: number, maxFraction = 3) =>
  (n || 0).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: maxFraction });

export const formatCompact = (n: number) => compact.format(n || 0);

export const UOM_LABEL: Record<Uom, string> = {
  pcs: "pcs",
  lembar: "sheet",
  batang: "length",
  m: "m",
  m2: "m²",
  m3: "m³",
  kg: "kg",
  liter: "L",
  set: "set",
  roll: "roll",
};

export const formatQty = (n: number, uom?: Uom) => `${formatNumber(n, uom === "m3" ? 4 : 3)}${uom ? ` ${UOM_LABEL[uom]}` : ""}`;

export const formatPct = (ratio: number, digits = 1) =>
  `${(ratio * 100).toLocaleString(NUMBER_LOCALE, { maximumFractionDigits: digits })}%`;

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
