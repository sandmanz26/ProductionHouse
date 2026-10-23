import { ArrowDownUp, Search, X } from "lucide-react";
import { useId } from "react";
import { ALL_OPTION, type SortDirection, type TableFilter, type TableQuery } from "@/lib/table-query";

/**
 * One row above every list: search, filters, and (on phones, where there are no column headers)
 * a sort picker. Shows how many rows match so an empty result never looks like missing data.
 */
export function TableToolbar<T>({
  label,
  query,
  filters,
  sortable,
  showSort,
  total,
  shown,
  onSearch,
  onFilter,
  onSort,
  onReset,
}: {
  label: string;
  query: TableQuery;
  filters?: TableFilter<T>[];
  sortable: { key: string; label: string }[];
  /** Phones: column headers are hidden, so sorting needs its own control. */
  showSort: boolean;
  total: number;
  shown: number;
  onSearch: (s: string) => void;
  onFilter: (id: string, value: string) => void;
  onSort: (sort: TableQuery["sort"]) => void;
  onReset: () => void;
}) {
  const id = useId();
  const active = !!query.search || Object.values(query.filters).some((v) => v && v !== ALL_OPTION);
  const sortKey = query.sort ? `${query.sort.column}:${query.sort.direction}` : "";
  return (
    <div role="search" aria-label={`Search ${label}`} className="flex flex-wrap items-center gap-2 border-b border-[var(--rule)] px-4 py-2.5">
      <label className="relative flex min-w-48 flex-1 items-center sm:max-w-xs">
        <span className="sr-only">Search {label}</span>
        <Search aria-hidden className="pointer-events-none absolute left-2.5 size-3.5 text-muted" />
        <input
          type="search"
          value={query.search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search…"
          className="h-8 w-full rounded-sm border border-[var(--field-border)] bg-[var(--field-background,var(--surface))] pr-7 pl-8 text-[13px] outline-none placeholder:text-muted focus-visible:border-[var(--focus)] focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30 [&::-webkit-search-cancel-button]:hidden"
        />
        {query.search && (
          <button type="button" aria-label="Clear search" onClick={() => onSearch("")} className="absolute right-1.5 rounded-sm p-0.5 text-muted hover:text-foreground">
            <X className="size-3.5" />
          </button>
        )}
      </label>

      {filters?.map((f) => (
        <label key={f.id} className="flex items-center gap-1.5 text-[13px]">
          <span className="text-muted">{f.label}</span>
          <select
            value={query.filters[f.id] ?? ALL_OPTION}
            onChange={(e) => onFilter(f.id, e.target.value)}
            className={`h-8 rounded-sm border bg-surface px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus)]/30 ${
              (query.filters[f.id] ?? ALL_OPTION) !== ALL_OPTION ? "border-accent font-medium" : "border-[var(--field-border)]"
            }`}
          >
            <option value={ALL_OPTION}>All</option>
            {f.options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}

      {showSort && sortable.length > 0 && (
        <label className="flex items-center gap-1.5 text-[13px]" htmlFor={`${id}-sort`}>
          <ArrowDownUp aria-hidden className="size-3.5 text-muted" />
          <span className="sr-only">Sort by</span>
          <select
            id={`${id}-sort`}
            value={sortKey}
            onChange={(e) => {
              const [column, direction] = e.target.value.split(":");
              onSort(column ? { column, direction: direction as SortDirection } : undefined);
            }}
            className="h-8 rounded-sm border border-[var(--field-border)] bg-surface px-2 text-[13px] outline-none"
          >
            <option value="">Default order</option>
            {sortable.flatMap((s) => [
              <option key={`${s.key}:a`} value={`${s.key}:ascending`}>
                {s.label} ↑
              </option>,
              <option key={`${s.key}:d`} value={`${s.key}:descending`}>
                {s.label} ↓
              </option>,
            ])}
          </select>
        </label>
      )}

      <p className="ml-auto flex items-center gap-2 text-xs text-muted" aria-live="polite">
        {active ? `${shown} of ${total}` : `${total} ${total === 1 ? "row" : "rows"}`}
        {active && (
          <button type="button" onClick={onReset} className="font-medium text-foreground underline underline-offset-2">
            Clear
          </button>
        )}
      </p>
    </div>
  );
}
