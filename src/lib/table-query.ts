/**
 * Search, filter and sort for list tables. Pure functions plus one hook, so every table in the
 * app behaves the same way: type to search, pick a filter, click a header to sort.
 */
import { useMemo, useState } from "react";

export type SortValue = string | number | null | undefined;
export type SortDirection = "ascending" | "descending";

export interface QueryColumn<T> {
  key: string;
  /** Text this column contributes to search (and the default sort value). */
  text?: (row: T) => string | undefined;
  /** Value to sort by; when absent the column sorts by `text`. */
  sort?: (row: T) => SortValue;
}

export interface TableFilter<T> {
  id: string;
  label: string;
  /** "all" is added automatically. */
  options: { id: string; label: string }[];
  test: (row: T, optionId: string) => boolean;
}

export interface TableQuery {
  search: string;
  filters: Record<string, string>;
  sort?: { column: string; direction: SortDirection };
}

const ALL = "all";
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Lower-case, accents stripped: "Jati" finds "jati", "Café" finds "cafe". */
export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase();

/** Fallback search text: the row's own strings and numbers (codes, titles, notes). */
function ownText(row: unknown, depth = 0): string {
  if (row == null || depth > 2) return "";
  if (typeof row === "string" || typeof row === "number") return String(row);
  if (Array.isArray(row)) return row.map((x) => ownText(x, depth + 1)).join(" ");
  if (typeof row === "object") {
    return Object.entries(row as Record<string, unknown>)
      .filter(([k]) => k !== "id" && !k.endsWith("Id") && !k.endsWith("At"))
      .map(([, v]) => ownText(v, depth + 1))
      .join(" ");
  }
  return "";
}

export function compareValues(a: SortValue, b: SortValue): number {
  const emptyA = a === null || a === undefined || a === "";
  const emptyB = b === null || b === undefined || b === "";
  if (emptyA || emptyB) return emptyA === emptyB ? 0 : emptyA ? 1 : -1; // blanks last
  if (typeof a === "number" && typeof b === "number") return a - b;
  return collator.compare(String(a), String(b));
}

export function sortValueOf<T>(col: QueryColumn<T>, row: T): SortValue {
  return col.sort ? col.sort(row) : col.text?.(row);
}

export const isSortable = <T,>(col: QueryColumn<T>) => !!(col.sort || col.text);

export function applyQuery<T>(
  rows: T[],
  columns: QueryColumn<T>[],
  query: TableQuery,
  opts: { filters?: TableFilter<T>[]; searchText?: (row: T) => string } = {},
): T[] {
  const terms = normalize(query.search.trim()).split(/\s+/).filter(Boolean);
  let out = rows;
  for (const f of opts.filters ?? []) {
    const value = query.filters[f.id];
    if (value && value !== ALL) out = out.filter((r) => f.test(r, value));
  }
  if (terms.length) {
    out = out.filter((r) => {
      const hay = normalize(
        [opts.searchText?.(r) ?? ownText(r), ...columns.map((c) => c.text?.(r) ?? "")].join(" "),
      );
      // Every word must appear somewhere: "jati kursi" finds teak chairs.
      return terms.every((t) => hay.includes(t));
    });
  }
  const sort = query.sort;
  const col = sort && columns.find((c) => c.key === sort.column);
  if (sort && col && isSortable(col)) {
    const dir = sort.direction === "ascending" ? 1 : -1;
    out = out
      .map((row, i) => ({ row, i, v: sortValueOf(col, row) }))
      .sort((a, b) => {
        const blankA = a.v === null || a.v === undefined || a.v === "";
        const blankB = b.v === null || b.v === undefined || b.v === "";
        if (blankA !== blankB) return blankA ? 1 : -1; // blanks stay last either way
        return dir * compareValues(a.v, b.v) || a.i - b.i;
      })
      .map((x) => x.row);
  }
  return out;
}

export function useTableQuery<T>(
  rows: T[],
  columns: QueryColumn<T>[],
  opts: { filters?: TableFilter<T>[]; searchText?: (row: T) => string; initialSort?: TableQuery["sort"] } = {},
) {
  const [query, setQuery] = useState<TableQuery>({ search: "", filters: {}, sort: opts.initialSort });
  const { filters, searchText } = opts;
  const visible = useMemo(() => applyQuery(rows, columns, query, { filters, searchText }), [rows, columns, query, filters, searchText]);
  const active = !!query.search.trim() || Object.values(query.filters).some((v) => v && v !== ALL);
  return {
    query,
    visible,
    active,
    setSearch: (search: string) => setQuery((q) => ({ ...q, search })),
    setFilter: (id: string, value: string) => setQuery((q) => ({ ...q, filters: { ...q.filters, [id]: value } })),
    setSort: (sort: TableQuery["sort"]) => setQuery((q) => ({ ...q, sort })),
    reset: () => setQuery((q) => ({ search: "", filters: {}, sort: q.sort })),
  };
}

export const ALL_OPTION = ALL;

/** Plain text of a rendered cell (strings, numbers and nested elements' children). */
export function nodeText(node: unknown): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join(" ");
  if (typeof node === "object" && "props" in (node as object)) {
    const props = (node as { props?: { children?: unknown; "aria-label"?: string } }).props;
    return nodeText(props?.children) || props?.["aria-label"] || "";
  }
  return "";
}

const MONTHS = "Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec";

/** Turns displayed text into something that sorts the way people expect: money, quantities, dates. */
export function sortableValue(text: string): SortValue {
  const t = text.trim();
  if (!t || t === "—") return undefined;
  const date = t.match(new RegExp(`^(\\d{1,2}) (${MONTHS})(?: (\\d{4}))?`));
  if (date) return Date.parse(`${date[1]} ${date[2]} ${date[3] ?? new Date().getFullYear()}`);
  const num = t.match(/^([-−+]?)\s*(?:Rp|IDR|\$|€|S\$|A\$|¥)?\s*([\d,]+(?:\.\d+)?)\s*([KMB]\b)?/);
  if (num) {
    const scale = num[3] === "K" ? 1e3 : num[3] === "M" ? 1e6 : num[3] === "B" ? 1e9 : 1;
    const v = parseFloat(num[2]!.replace(/,/g, "")) * scale;
    return num[1] === "-" || num[1] === "−" ? -v : v;
  }
  return t;
}
