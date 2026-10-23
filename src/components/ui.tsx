import { Button, Modal, Table, type Key } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Tone } from "@/lib/labels";
import { useIsCompact } from "@/lib/use-media";
import { nodeText, sortableValue, useTableQuery, type QueryColumn, type SortDirection, type SortValue, type TableFilter } from "@/lib/table-query";
import { TableToolbar } from "./TableToolbar";

export function PageHeader({
  title,
  description,
  actions,
  back,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  /** Route to go back to; shows a back button. */
  back?: string;
  badge?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <header className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Button isIconOnly variant="ghost" size="sm" aria-label="Back" onPress={() => navigate(back)} className="mt-0.5">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="title-display text-xl sm:text-[22px] leading-tight">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-0.5 max-w-3xl text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}

/** Status as a coloured dot + label. Colour is reserved for states, not decoration. */
export function StatusChip({ tone, children }: { tone: Tone; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap ${toneLabel[tone]}`}>
      <span aria-hidden className={`size-1.5 shrink-0 rounded-full ${toneDot[tone]}`} />
      {children}
    </span>
  );
}

/** Neutral bordered tag for categories / document types. */
export function Tag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-sm border border-[var(--rule)] px-1.5 text-[11px] leading-5 font-medium whitespace-nowrap text-[var(--ink-soft)]">
      {children}
    </span>
  );
}

/** Monospace document / lot code. */
export function Code({ children }: { children: ReactNode }) {
  return <span className="num text-[13px] font-medium whitespace-nowrap">{children}</span>;
}

const toneText: Record<Tone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const toneLabel: Record<Tone, string> = {
  default: "text-[var(--ink-soft)]",
  accent: "text-foreground",
  success: "text-foreground",
  warning: "text-warning",
  danger: "text-danger",
};
const toneDot: Record<Tone, string> = {
  default: "bg-[var(--ink-soft)] opacity-50",
  accent: "bg-accent",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

export interface Metric {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  onPress?: () => void;
}

/** One bordered strip of key numbers, separated by rules — no icon tiles. */
export function MetricStrip({ items, className }: { items: Metric[]; className?: string }) {
  const cols = { 1: "sm:grid-cols-1", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3", 4: "sm:grid-cols-4", 5: "sm:grid-cols-5" }[
    Math.min(5, items.length) as 1 | 2 | 3 | 4 | 5
  ];
  return (
    <div
      className={`grid grid-cols-2 overflow-hidden rounded-md bg-surface border border-[var(--rule)] ${cols} ${className ?? ""}`}
    >
      {items.map((m, i) => {
        const body = (
          <>
            <p className="caption-label">{m.label}</p>
            <p className={`num mt-1 text-lg font-medium sm:text-xl ${toneText[m.tone ?? "default"]}`}>{m.value}</p>
            {m.hint && <p className="mt-0.5 text-xs text-muted">{m.hint}</p>}
          </>
        );
        const cls = `min-w-0 border-[var(--rule)] px-4 py-3 text-left ${i > 0 ? "border-l" : ""} ${
          i >= 2 ? "max-sm:border-t" : ""
        } ${i % 2 === 0 ? "max-sm:border-l-0" : ""}`;
        return m.onPress ? (
          <button key={m.label} type="button" onClick={m.onPress} className={`${cls} transition-colors hover:bg-default/50 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none`}>
            {body}
          </button>
        ) : (
          <div key={m.label} className={cls}>
            {body}
          </div>
        );
      })}
    </div>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-md bg-surface border border-[var(--rule)] ${className ?? ""}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-2 border-b border-[var(--rule)] px-4 py-3">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? "p-4"}>{children}</div>
    </section>
  );
}

export function EmptyBlock({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-4 py-10 text-center">
      {icon && <div className="mb-1 text-muted">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function KeyValue({ items, columns = 2 }: { items: [ReactNode, ReactNode][]; columns?: 1 | 2 | 3 }) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-3" }[columns];
  return (
    <dl className={`grid grid-cols-1 gap-x-6 gap-y-3 ${cols}`}>
      {items.map(([k, v], i) => (
        <div key={i} className="min-w-0">
          <dt className="caption-label">{k}</dt>
          <dd className="mt-0.5 text-sm break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value row for cost breakdowns. */
export function Row({ label, value, strong, muted, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; tone?: Tone }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1 text-sm ${strong ? "font-semibold" : ""} ${muted ? "text-muted" : ""}`}>
      <span className="min-w-0">{label}</span>
      <span className={`num shrink-0 ${tone ? toneText[tone] : ""}`}>{value}</span>
    </div>
  );
}

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
  isRowHeader?: boolean;
  className?: string;
  /** Search/sort text; defaults to the cell's visible text. */
  text?: (row: T) => string | undefined;
  /** Sort value; defaults to the visible text read as money, number or date. */
  sort?: (row: T) => SortValue;
  /** Opt out of sorting (e.g. action buttons). */
  noSort?: boolean;
}

export function DataTable<T extends { id: string }>({
  label,
  columns,
  rows,
  onRowAction,
  empty,
  dependencies = [],
  filters,
  searchText,
  toolbar,
  initialSort,
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  onRowAction?: (row: T) => void;
  empty?: ReactNode;
  dependencies?: unknown[];
  filters?: TableFilter<T>[];
  searchText?: (row: T) => string;
  /** Search/filter/sort bar; shown by default once a list has more than five rows or has filters. */
  toolbar?: boolean;
  initialSort?: { column: string; direction: SortDirection };
}) {
  const compact = useIsCompact();
  const hasHeader = columns.some((c) => c.isRowHeader);
  const cols = columns.map((c, i) => ({ ...c, isRowHeader: c.isRowHeader || (!hasHeader && i === 0) }));
  // Every column searches and sorts by what it shows, unless the page says better.
  const queryCols: QueryColumn<T>[] = cols.map((c) => ({
    key: c.key,
    text: c.text ?? ((r: T) => nodeText(c.cell(r))),
    sort: c.noSort || c.header === "" ? undefined : (c.sort ?? ((r: T) => sortableValue(c.text ? (c.text(r) ?? "") : nodeText(c.cell(r))))),
  }));
  const q = useTableQuery(rows, queryCols, { filters, searchText, initialSort });
  const shown = q.visible;
  const byId = new Map(shown.map((r) => [r.id, r]));
  const showBar = toolbar ?? (rows.length > 5 || !!filters?.length);
  const sortable = cols.filter((c) => !c.noSort && c.header !== "" && typeof c.header === "string").map((c) => ({ key: c.key, label: c.header as string }));
  const noMatch = <EmptyBlock title="Nothing matches" description="Try other words, or clear the filters." action={<Button size="sm" variant="secondary" onPress={q.reset}>Clear search</Button>} />;
  const emptyState = rows.length === 0 ? (empty ?? <EmptyBlock title="No data yet" />) : noMatch;

  const bar = showBar && (
    <TableToolbar
      label={label}
      query={q.query}
      filters={filters}
      sortable={sortable}
      showSort={compact}
      total={rows.length}
      shown={shown.length}
      onSearch={q.setSearch}
      onFilter={q.setFilter}
      onSort={q.setSort}
      onReset={q.reset}
    />
  );

  if (compact) {
    // Phones: each row becomes a stacked card — no sideways scrolling on the shop floor.
    if (shown.length === 0) return <div role="table" aria-label={label}>{bar}{emptyState}</div>;
    const head = cols.find((c) => c.isRowHeader)!;
    const actions = cols.filter((c) => !c.isRowHeader && c.header === "");
    const fields = cols.filter((c) => !c.isRowHeader && c.header !== "");
    return (
      <div>
        {bar}
        <ul aria-label={label} className="divide-y divide-[var(--rule)]">
          {shown.map((row) => {
            const inner = (
              <>
                <div className="min-w-0 font-medium">{head.cell(row)}</div>
                <dl className="mt-1.5 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-3 gap-y-1.5">
                  {fields.map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="caption-label">{c.header}</dt>
                      <dd className={`min-w-0 text-sm break-words ${c.align === "end" ? "num" : ""}`}>{c.cell(row)}</dd>
                    </div>
                  ))}
                </dl>
              </>
            );
            return (
              <li key={row.id} className="px-4 py-3">
                {onRowAction ? (
                  <button type="button" className="w-full text-left" onClick={() => onRowAction(row)}>
                    {inner}
                  </button>
                ) : (
                  inner
                )}
                {actions.length > 0 && <div className="mt-2 flex justify-end gap-2">{actions.map((c) => <div key={c.key}>{c.cell(row)}</div>)}</div>}
              </li>
            );
          })}
        </ul>
      </div>
    );
  }

  const sortDescriptor = q.query.sort ? { column: q.query.sort.column, direction: q.query.sort.direction } : undefined;
  return (
    <div>
      {bar}
      <Table variant="secondary">
        <Table.ScrollContainer>
          <Table.Content
            aria-label={label}
            sortDescriptor={sortDescriptor}
            onSortChange={(d: { column: Key; direction: SortDirection }) => q.setSort({ column: String(d.column), direction: d.direction })}
            onRowAction={onRowAction ? (key: Key) => byId.has(String(key)) && onRowAction(byId.get(String(key))!) : undefined}
          >
            <Table.Header columns={cols}>
              {(c) => {
                const canSort = !!queryCols.find((x) => x.key === c.key)?.sort;
                return (
                  <Table.Column id={c.key} isRowHeader={c.isRowHeader} allowsSorting={canSort} className={`${c.align === "end" ? "text-right" : ""} ${c.className ?? ""}`}>
                    {canSort ? (
                      <Table.SortableColumnHeader sortDirection={q.query.sort?.column === c.key ? q.query.sort.direction : undefined}>{c.header}</Table.SortableColumnHeader>
                    ) : (
                      c.header
                    )}
                  </Table.Column>
                );
              }}
            </Table.Header>
            <Table.Body items={shown} dependencies={[cols, q.query, ...dependencies]} renderEmptyState={() => emptyState}>
              {(row) => (
                <Table.Row id={row.id} columns={cols} className={onRowAction ? "cursor-pointer" : undefined}>
                  {(c) => (
                    <Table.Cell className={`${c.align === "end" ? `text-right whitespace-nowrap ${c.header === "" ? "" : "num"}` : ""} ${c.className ?? ""}`}>
                      {c.cell(row)}
                    </Table.Cell>
                  )}
                </Table.Row>
              )}
            </Table.Body>
          </Table.Content>
        </Table.ScrollContainer>
      </Table>
    </div>
  );
}

/** Button that asks for confirmation in a modal before running `onConfirm`. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Yes, continue",
  danger,
  onConfirm,
  variant = "secondary",
  size = "md",
  isDisabled,
}: {
  children: ReactNode;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => unknown;
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "outline" | "danger" | "danger-soft";
  size?: "sm" | "md" | "lg";
  isDisabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onPress={() => setOpen(true)} isDisabled={isDisabled}>
        {children}
      </Button>
      <Modal.Backdrop isOpen={open} onOpenChange={setOpen}>
          <Modal.Container size="sm">
            <Modal.Dialog>
              <Modal.Header>
                <Modal.Heading>{title}</Modal.Heading>
              </Modal.Header>
              {description && <Modal.Body className="text-sm text-muted">{description}</Modal.Body>}
              <Modal.Footer>
                <Button variant="tertiary" onPress={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant={danger ? "danger" : "primary"}
                  onPress={() => {
                    const r = onConfirm();
                    if (r !== false) setOpen(false);
                  }}
                >
                  {confirmLabel}
                </Button>
              </Modal.Footer>
            </Modal.Dialog>
          </Modal.Container>
      </Modal.Backdrop>
    </>
  );
}

/** Controlled modal shell used by task dialogs (issue materials, return rental, …). */
export function TaskModal({
  isOpen,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = "lg",
}: {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg" | "full";
}) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
        <Modal.Container size={size} scroll="inside">
          <Modal.Dialog>
            <Modal.CloseTrigger />
            <Modal.Header className="flex-col items-start gap-1">
              <Modal.Heading>{title}</Modal.Heading>
              {description && <p className="text-sm text-muted">{description}</p>}
            </Modal.Header>
            <Modal.Body>{children}</Modal.Body>
            {footer && <Modal.Footer>{footer}</Modal.Footer>}
          </Modal.Dialog>
        </Modal.Container>
    </Modal.Backdrop>
  );
}
