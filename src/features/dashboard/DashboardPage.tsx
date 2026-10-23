import { Button, Link } from "@heroui/react";
import { ArrowRight } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  currentStage,
  diffDays,
  insights,
  inventoryValuation,
  isOpenWo,
  outstandingCheckouts,
  receivables,
  remnantRows,
  salesSummary,
  stageBoard,
  stageProgress,
  sum,
  today,
  type InsightSeverity,
} from "@/domain";
import { Code, EmptyBlock, MetricStrip, PageHeader, Section, StatusChip } from "@/components/ui";
import { formatDate, formatIDRCompact, formatPct } from "@/lib/format";
import { WO_STATUS } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";
import { FirstSteps } from "./FirstSteps";

const days = (n: number) => `${n} day${n === 1 ? "" : "s"}`;

/** The list stays a short queue; the rest is one click away. */
const NEEDS_CAP = 6;

const SEVERITY_BAR: Record<InsightSeverity, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
  success: "bg-success",
};

export default function DashboardPage() {
  const [showAll, setShowAll] = useState(false);
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const t = today();

  const data = useMemo(() => {
    const valuation = inventoryValuation(db);
    const activeRentals = db.rentals.filter((r) => r.status === "berjalan");
    const monthStart = `${t.slice(0, 7)}-01`;
    const ar = receivables(db, t);
    return {
      valuation,
      remnants: remnantRows(db, t),
      openWos: db.workOrders.filter(isOpenWo).sort((a, b) => (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999")),
      unitsOut: sum(activeRentals.flatMap((r) => outstandingCheckouts(r).map((c) => c.outstanding))),
      lateRentals: activeRentals.filter((r) => r.endDate < t && outstandingCheckouts(r).length > 0).length,
      sales: salesSummary(db, monthStart, t),
      ar: sum(ar.map((x) => x.balanceIdr)),
      arOverdue: sum(ar.filter((x) => x.overdueDays > 0).map((x) => x.balanceIdr)),
      insights: insights(db, t),
      board: stageBoard(db, t),
      schedule: db.rentals
        .filter((r) => r.status === "dipesan" || r.status === "berjalan")
        .map((r) => ({ r, ref: r.status === "berjalan" ? r.endDate : r.startDate }))
        .sort((a, b) => a.ref.localeCompare(b.ref))
        .slice(0, 6),
    };
  }, [db, t]);

  const dateTitle = new Date(`${t}T00:00:00`).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={dateTitle} description={db.settings.companyName} />

      <MetricStrip
        items={[
          { label: "Stock value", value: formatIDRCompact(data.valuation.total), hint: `offcuts ${formatIDRCompact(data.valuation.remnants)}`, onPress: () => navigate("/stock/materials") },
          { label: "Active production", value: data.openWos.length, hint: `${data.openWos.filter((w) => w.dueDate && w.dueDate < t).length} past target`, onPress: () => navigate("/board") },
          { label: "Units with clients", value: data.unitsOut, hint: data.lateRentals ? `${data.lateRentals} rental${data.lateRentals === 1 ? "" : "s"} late` : "on time", onPress: () => navigate("/rentals") },
          { label: "Receivables", value: formatIDRCompact(data.ar), hint: data.arOverdue ? `${formatIDRCompact(data.arOverdue)} overdue` : "nothing overdue", tone: data.arOverdue ? "danger" : "default", onPress: () => navigate("/finance") },
          {
            label: "Sales this month",
            value: formatIDRCompact(data.sales.revenueIdr),
            hint: data.sales.revenueIdr ? `margin ${formatPct(data.sales.margin / data.sales.revenueIdr, 0)}` : `${data.sales.count} order${data.sales.count === 1 ? "" : "s"}`,
            onPress: () => navigate("/sales"),
          },
        ]}
      />

      <div className="mt-5 empty:hidden">
        <FirstSteps />
      </div>

      <div className="mt-5 grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="flex min-w-0 flex-col gap-5">
          <Section title="Needs attention" description={`${data.insights.length} item${data.insights.length === 1 ? "" : "s"}, most urgent first`} bodyClassName="p-0">
            {data.insights.length === 0 ? (
              <EmptyBlock title="All clear" description="No late rentals, material shortages or overdue invoices." />
            ) : (
              <>
                <ul className="divide-y divide-[var(--rule)]">
                {data.insights.slice(0, showAll ? undefined : NEEDS_CAP).map((ins) => (
                  <li key={ins.id} className="relative flex flex-col gap-1 py-2.5 pr-4 pl-5 sm:flex-row sm:items-center sm:gap-4">
                    <span aria-hidden className={`absolute top-3 bottom-3 left-2 w-0.5 rounded-full ${SEVERITY_BAR[ins.severity]}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{ins.title}</p>
                      <p className="text-[13px] text-muted">{ins.detail}</p>
                    </div>
                    {ins.to && (
                      <Link href={ins.to} className="shrink-0 text-[13px] font-medium whitespace-nowrap text-accent">
                        {ins.action ?? "Open"} →
                      </Link>
                    )}
                  </li>
                ))}
                </ul>
                {data.insights.length > NEEDS_CAP && (
                  <button type="button" onClick={() => setShowAll(!showAll)} className="w-full border-t border-[var(--rule)] px-4 py-2.5 text-left text-[13px] font-medium hover:bg-default/40">
                    {showAll ? "Show the most urgent only" : `Show all ${data.insights.length}`}
                  </button>
                )}
              </>
            )}
          </Section>

          <Section title="Active production" bodyClassName="p-0">
            {data.openWos.length === 0 ? (
              <EmptyBlock title="None yet" />
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {data.openWos.slice(0, 7).map((wo) => {
                  const late = wo.dueDate && wo.dueDate < t;
                  const p = stageProgress(wo);
                  return (
                    <li key={wo.id}>
                      <button type="button" onClick={() => navigate(`/work-orders/${wo.id}`)} className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-default/40">
                        <Code>{wo.code}</Code>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{wo.title}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-default">
                              <div className={`h-full ${late ? "bg-danger" : "bg-[var(--data)]"}`} style={{ width: `${Math.round(p * 100)}%` }} />
                            </div>
                            <span className="text-xs text-muted">{wo.status === "rencana" ? WO_STATUS.rencana.label : (currentStage(wo)?.name ?? "Ready to close")}</span>
                          </div>
                        </div>
                        <span className={`num text-xs ${late ? "text-danger" : "text-muted"}`}>{wo.dueDate ? formatDate(wo.dueDate) : "—"}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
        <div className="flex min-w-0 flex-col gap-5">
          <Section
            title="Shop floor"
            description="Active work orders by current stage"
            actions={
              <Button size="sm" variant="ghost" onPress={() => navigate("/board")}>
                Board <ArrowRight className="size-3.5" />
              </Button>
            }
            bodyClassName="p-0"
          >
            {data.openWos.length === 0 ? (
              <EmptyBlock title="The shop floor is empty" action={<Button size="sm" onPress={() => navigate("/work-orders/new")}>Create a work order</Button>} />
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {data.board
                  .filter((c) => c.workOrders.length)
                  .map((c) => (
                    <li key={c.name} className="flex items-start justify-between gap-3 px-4 py-2.5">
                      <span className="text-sm">{c.name}</span>
                      <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
                        {c.workOrders.map((w) => (
                          <Link key={w.id} href={`/work-orders/${w.id}`} className={`num text-[13px] ${w.late ? "text-danger" : "text-foreground"}`}>
                            {w.code}
                          </Link>
                        ))}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </Section>

          <Section title="Rental & loan schedule" bodyClassName="p-0">
            {data.schedule.length === 0 ? (
              <EmptyBlock title="Nothing scheduled" />
            ) : (
              <ul className="divide-y divide-[var(--rule)]">
                {data.schedule.map(({ r, ref }) => {
                  const out = r.status === "berjalan";
                  const d = diffDays(t, ref);
                  const late = out && d < 0;
                  const label = out ? (late ? `${days(-d)} late` : d === 0 ? "back today" : `back in ${days(d)}`) : d <= 0 ? "hand over today" : `starts in ${days(d)}`;
                  return (
                    <li key={r.id}>
                      <button type="button" onClick={() => navigate(`/rentals/${r.id}`)} className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-default/40">
                        <span className="num text-[13px]">{formatDate(ref).replace(/ \d{4}$/, "")}</span>
                        <div className="min-w-0">
                          <p className="truncate text-sm">{r.project}</p>
                          <p className="text-xs text-muted">{r.lines.map((l) => `${l.qty}× ${item(l.itemId)?.name ?? "?"}`).join(", ")}</p>
                        </div>
                        <StatusChip tone={late ? "danger" : out ? "accent" : "default"}>{label}</StatusChip>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
        </div>
      </div>
    </>
  );
}
