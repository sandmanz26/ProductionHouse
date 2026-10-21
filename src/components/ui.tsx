import { Button, Card, Chip, Modal, Table, type Key } from "@heroui/react";
import { ArrowLeft } from "lucide-react";
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router";
import type { Tone } from "@/lib/labels";

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
    <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        {back && (
          <Button isIconOnly variant="ghost" size="sm" aria-label="Kembali" onPress={() => navigate(back)} className="mt-0.5">
            <ArrowLeft className="size-4" />
          </Button>
        )}
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
            {badge}
          </div>
          {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </header>
  );
}

export function StatusChip({ tone, children, size = "sm" }: { tone: Tone; children: ReactNode; size?: "sm" | "md" }) {
  return (
    <Chip color={tone} variant="soft" size={size}>
      {children}
    </Chip>
  );
}

const toneText: Record<Tone, string> = {
  default: "text-foreground",
  accent: "text-accent",
  success: "text-success",
  warning: "text-warning",
  danger: "text-danger",
};
const toneBg: Record<Tone, string> = {
  default: "bg-default text-default-foreground",
  accent: "bg-accent-soft text-accent-soft-foreground",
  success: "bg-success-soft text-success-soft-foreground",
  warning: "bg-warning-soft text-warning-soft-foreground",
  danger: "bg-danger-soft text-danger-soft-foreground",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "default",
  onPress,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  tone?: Tone;
  onPress?: () => void;
}) {
  const content = (
    <Card className="h-full">
      <Card.Content className="flex flex-row items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium tracking-wide text-muted uppercase">{label}</p>
          <p className={`mt-1 text-xl font-semibold tabular-nums sm:text-2xl ${toneText[tone]}`}>{value}</p>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        {icon && <div className={`grid size-9 shrink-0 place-items-center rounded-xl ${toneBg[tone]}`}>{icon}</div>}
      </Card.Content>
    </Card>
  );
  if (!onPress) return content;
  return (
    <button
      type="button"
      onClick={onPress}
      className="rounded-3xl text-left transition hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
    >
      {content}
    </button>
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
    <Card className={className}>
      {(title || actions) && (
        <Card.Header className="flex flex-row flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            {title && <Card.Title className="text-base">{title}</Card.Title>}
            {description && <Card.Description>{description}</Card.Description>}
          </div>
          {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
        </Card.Header>
      )}
      <Card.Content className={bodyClassName}>{children}</Card.Content>
    </Card>
  );
}

export function EmptyBlock({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      {icon && <div className="mb-1 grid size-11 place-items-center rounded-2xl bg-default text-muted">{icon}</div>}
      <p className="font-medium">{title}</p>
      {description && <p className="max-w-sm text-sm text-muted">{description}</p>}
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
          <dt className="text-xs text-muted">{k}</dt>
          <dd className="mt-0.5 text-sm font-medium break-words">{v || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Label/value row for cost breakdowns. */
export function Row({ label, value, strong, muted, tone }: { label: ReactNode; value: ReactNode; strong?: boolean; muted?: boolean; tone?: Tone }) {
  return (
    <div className={`flex items-baseline justify-between gap-4 py-1.5 text-sm ${strong ? "font-semibold" : ""} ${muted ? "text-muted" : ""}`}>
      <span className="min-w-0">{label}</span>
      <span className={`shrink-0 tabular-nums ${tone ? toneText[tone] : ""}`}>{value}</span>
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
}

export function DataTable<T extends { id: string }>({
  label,
  columns,
  rows,
  onRowAction,
  empty,
  dependencies = [],
}: {
  label: string;
  columns: Column<T>[];
  rows: T[];
  onRowAction?: (row: T) => void;
  empty?: ReactNode;
  dependencies?: unknown[];
}) {
  const byId = new Map(rows.map((r) => [r.id, r]));
  const hasHeader = columns.some((c) => c.isRowHeader);
  const cols = columns.map((c, i) => ({ ...c, isRowHeader: c.isRowHeader || (!hasHeader && i === 0) }));
  return (
    <Table>
      <Table.ScrollContainer>
        <Table.Content
          aria-label={label}
          onRowAction={onRowAction ? (key: Key) => byId.has(String(key)) && onRowAction(byId.get(String(key))!) : undefined}
        >
          <Table.Header columns={cols}>
            {(c) => (
              <Table.Column id={c.key} isRowHeader={c.isRowHeader} className={`${c.align === "end" ? "text-right" : ""} ${c.className ?? ""}`}>
                {c.header}
              </Table.Column>
            )}
          </Table.Header>
          <Table.Body
            items={rows}
            dependencies={[cols, ...dependencies]}
            renderEmptyState={() => empty ?? <EmptyBlock title="Belum ada data" />}
          >
            {(row) => (
              <Table.Row id={row.id} columns={cols} className={onRowAction ? "cursor-pointer" : undefined}>
                {(c) => (
                  <Table.Cell className={`${c.align === "end" ? "text-right whitespace-nowrap tabular-nums" : ""} ${c.className ?? ""}`}>
                    {c.cell(row)}
                  </Table.Cell>
                )}
              </Table.Row>
            )}
          </Table.Body>
        </Table.Content>
      </Table.ScrollContainer>
    </Table>
  );
}

/** Button that asks for confirmation in a modal before running `onConfirm`. */
export function ConfirmButton({
  children,
  title,
  description,
  confirmLabel = "Ya, lanjutkan",
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
                  Batal
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
