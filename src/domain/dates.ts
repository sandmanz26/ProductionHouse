import type { ISODate } from "./types";

const DAY = 86_400_000;

const pad = (n: number) => String(n).padStart(2, "0");

/** Local calendar date (not UTC) — what the user sees on their wall calendar. */
export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = (): ISODate => toISODate(new Date());

function parse(date: ISODate): number {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
}

/** Whole days from `a` to `b` (b − a). Accepts dates or ISO timestamps (date part is used). */
export function diffDays(a: string, b: string): number {
  return Math.round((parse(b) - parse(a)) / DAY);
}

export function addDays(date: ISODate, days: number): ISODate {
  const t = new Date(parse(date) + days * DAY);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Inclusive overlap of two closed date ranges. */
export function rangesOverlap(aStart: ISODate, aEnd: ISODate, bStart: ISODate, bEnd: ISODate): boolean {
  return parse(aStart) <= parse(bEnd) && parse(bStart) <= parse(aEnd);
}

/** Date part of an ISO timestamp in local time. */
export function localDateOf(iso: string): ISODate {
  return iso.length <= 10 ? iso : toISODate(new Date(iso));
}
