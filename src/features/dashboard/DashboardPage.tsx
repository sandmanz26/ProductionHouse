import { Button, Link } from "@heroui/react";
import { ArrowRight } from "lucide-react";
import { useMemo } from "react";
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

const SEVERITY_BAR: Record<InsightSeverity, string> = {
  danger: "bg-danger",
  warning: "bg-warning",
  accent: "bg-accent",
  success: "bg-success",
};

export default function DashboardPage() {
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

  const dateTitle = new Date(`${t}T00:00:00`).toLocaleDateString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={dateTitle} description={db.settings.companyName} />

      <MetricStrip
        items={[
          { label: "Nilai stok", value: formatIDRCompact(data.valuation.total), hint: `sisa ${formatIDRCompact(data.valuation.remnants)}`, onPress: () => navigate("/stok/material") },
          { label: "Produksi aktif", value: data.openWos.length, hint: `${data.openWos.filter((w) => w.dueDate && w.dueDate < t).length} lewat target`, onPress: () => navigate("/produksi/papan") },
          { label: "Unit di klien", value: data.unitsOut, hint: data.lateRentals ? `${data.lateRentals} sewa terlambat` : "tepat waktu", tone: data.lateRentals ? "danger" : "default", onPress: () => navigate("/sewa") },
          { label: "Piutang", value: formatIDRCompact(data.ar), hint: data.arOverdue ? `${formatIDRCompact(data.arOverdue)} lewat tempo` : "tidak ada yang lewat tempo", tone: data.arOverdue ? "danger" : "default", onPress: () => navigate("/keuangan") },
          {
            label: "Penjualan bulan ini",
            value: formatIDRCompact(data.sales.revenueIdr),
            hint: data.sales.revenueIdr ? `margin ${formatPct(data.sales.margin / data.sales.revenueIdr, 0)}` : `${data.sales.count} order`,
            onPress: () => navigate("/penjualan"),
          },
        ]}
      />

      <div className="mt-5 empty:hidden">
        <FirstSteps />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Section title="Perlu tindakan" description={`${data.insights.length} hal, diurutkan dari yang paling mendesak`} bodyClassName="p-0">
          {data.insights.length === 0 ? (
            <EmptyBlock title="Semua beres" description="Tidak ada sewa telat, bahan kurang, atau tagihan lewat tempo." />
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {data.insights.slice(0, 10).map((ins) => (
                <li key={ins.id} className="relative flex flex-col gap-1 py-2.5 pr-4 pl-5 sm:flex-row sm:items-center sm:gap-4">
                  <span aria-hidden className={`absolute top-3 bottom-3 left-2 w-0.5 rounded-full ${SEVERITY_BAR[ins.severity]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{ins.title}</p>
                    <p className="text-[13px] text-muted">{ins.detail}</p>
                  </div>
                  {ins.to && (
                    <Link href={ins.to} className="shrink-0 text-[13px] font-medium whitespace-nowrap text-accent">
                      {ins.action ?? "Buka"} →
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section
          className="xl:self-start"
          title="Lantai produksi"
          description="Pekerjaan aktif per tahap saat ini"
          actions={
            <Button size="sm" variant="ghost" onPress={() => navigate("/produksi/papan")}>
              Papan <ArrowRight className="size-3.5" />
            </Button>
          }
          bodyClassName="p-0"
        >
          {data.openWos.length === 0 ? (
            <EmptyBlock title="Lantai produksi kosong" action={<Button size="sm" onPress={() => navigate("/produksi/baru")}>Buat perintah kerja</Button>} />
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {data.board
                .filter((c) => c.workOrders.length)
                .map((c) => (
                  <li key={c.name} className="flex items-start justify-between gap-3 px-4 py-2.5">
                    <span className="text-sm">{c.name}</span>
                    <span className="flex flex-wrap justify-end gap-x-2 gap-y-0.5">
                      {c.workOrders.map((w) => (
                        <Link key={w.id} href={`/produksi/${w.id}`} className={`num text-[13px] ${w.late ? "text-danger" : "text-foreground"}`}>
                          {w.code}
                        </Link>
                      ))}
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <Section title="Produksi aktif" bodyClassName="p-0">
          {data.openWos.length === 0 ? (
            <EmptyBlock title="Belum ada" />
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {data.openWos.slice(0, 7).map((wo) => {
                const late = wo.dueDate && wo.dueDate < t;
                const p = stageProgress(wo);
                return (
                  <li key={wo.id}>
                    <button type="button" onClick={() => navigate(`/produksi/${wo.id}`)} className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-default/40">
                      <Code>{wo.code}</Code>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{wo.title}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-default">
                            <div className={`h-full ${late ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.round(p * 100)}%` }} />
                          </div>
                          <span className="text-xs text-muted">{wo.status === "rencana" ? WO_STATUS.rencana.label : (currentStage(wo)?.name ?? "Siap ditutup")}</span>
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

        <Section title="Jadwal sewa & pinjam" bodyClassName="p-0">
          {data.schedule.length === 0 ? (
            <EmptyBlock title="Tidak ada jadwal" />
          ) : (
            <ul className="divide-y divide-[var(--rule)]">
              {data.schedule.map(({ r, ref }) => {
                const out = r.status === "berjalan";
                const d = diffDays(t, ref);
                const late = out && d < 0;
                const label = out ? (late ? `telat ${-d} hari` : d === 0 ? "kembali hari ini" : `kembali ${d} hari lagi`) : d <= 0 ? "serahkan hari ini" : `mulai ${d} hari lagi`;
                return (
                  <li key={r.id}>
                    <button type="button" onClick={() => navigate(`/sewa/${r.id}`)} className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-left hover:bg-default/40">
                      <span className="num text-[13px]">{formatDate(ref).replace(/ \d{4}$/, "")}</span>
                      <div className="min-w-0">
                        <p className="truncate text-sm">{r.project}</p>
                        <p className="truncate text-xs text-muted">{r.lines.map((l) => `${l.qty}× ${item(l.itemId)?.name ?? "?"}`).join(", ")}</p>
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
    </>
  );
}
