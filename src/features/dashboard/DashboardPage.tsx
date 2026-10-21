import { Button, Card, ProgressBar } from "@heroui/react";
import {
  AlertTriangle,
  Armchair,
  CalendarClock,
  CheckCircle2,
  Hammer,
  Lightbulb,
  PackagePlus,
  Recycle,
  Ship,
  ShoppingCart,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import {
  addDays,
  diffDays,
  insights,
  inventoryValuation,
  isOpenWo,
  outstandingCheckouts,
  remnantRows,
  requirements,
  salesSummary,
  sum,
  today,
  type InsightSeverity,
} from "@/domain";
import { EmptyBlock, PageHeader, Section, StatCard, StatusChip } from "@/components/ui";
import { formatDate, formatIDRCompact, formatPct } from "@/lib/format";
import { WO_STATUS, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

const SEVERITY: Record<InsightSeverity, { icon: LucideIcon; className: string; label: string }> = {
  danger: { icon: AlertTriangle, className: "bg-danger-soft text-danger-soft-foreground", label: "Mendesak" },
  warning: { icon: AlertTriangle, className: "bg-warning-soft text-warning-soft-foreground", label: "Perhatian" },
  accent: { icon: Lightbulb, className: "bg-accent-soft text-accent-soft-foreground", label: "Saran" },
  success: { icon: CheckCircle2, className: "bg-success-soft text-success-soft-foreground", label: "Info" },
};

function greeting() {
  const h = new Date().getHours();
  if (h < 11) return "Selamat pagi";
  if (h < 15) return "Selamat siang";
  if (h < 18) return "Selamat sore";
  return "Selamat malam";
}

const TASKS = [
  { to: "/produksi/baru", label: "Mulai produksi", hint: "Buat perintah kerja", icon: Hammer },
  { to: "/pembelian/baru", label: "Catat pembelian", hint: "Bahan masuk gudang", icon: ShoppingCart },
  { to: "/penjualan/baru", label: "Order penjualan", hint: "Supply / ekspor", icon: Ship },
  { to: "/sewa/baru", label: "Sewa / pinjam", hint: "Booking unit", icon: CalendarClock },
];

export default function DashboardPage() {
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const t = today();

  const data = useMemo(() => {
    const valuation = inventoryValuation(db);
    const remnants = remnantRows(db, t);
    const openWos = db.workOrders.filter(isOpenWo);
    const activeRentals = db.rentals.filter((r) => r.status === "berjalan");
    const unitsOut = sum(activeRentals.flatMap((r) => outstandingCheckouts(r).map((c) => c.outstanding)));
    const lateRentals = activeRentals.filter((r) => r.endDate < t && outstandingCheckouts(r).length > 0);
    const monthStart = `${t.slice(0, 7)}-01`;
    const sales = salesSummary(db, monthStart, t);
    return {
      valuation,
      remnants,
      openWos,
      activeRentals,
      unitsOut,
      lateRentals,
      sales,
      insights: insights(db, t),
      upcomingRentals: db.rentals
        .filter((r) => r.status === "dipesan" || r.status === "berjalan")
        .sort((a, b) => (a.status === "berjalan" ? a.endDate : a.startDate).localeCompare(b.status === "berjalan" ? b.endDate : b.startDate))
        .slice(0, 5),
    };
  }, [db, t]);

  return (
    <>
      <PageHeader
        title={`${greeting()} 👋`}
        description={`${formatDate(t)} · Ringkasan operasional ${db.settings.companyName}.`}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Nilai stok"
          value={formatIDRCompact(data.valuation.total)}
          hint={`Material ${formatIDRCompact(data.valuation.materials)} · Produk ${formatIDRCompact(data.valuation.products)}`}
          icon={<Wallet className="size-4" />}
          onPress={() => navigate("/stok/material")}
        />
        <StatCard
          label="Sisa material"
          value={formatIDRCompact(data.valuation.remnants)}
          hint={`${data.remnants.length} potongan siap dipakai ulang`}
          icon={<Recycle className="size-4" />}
          tone="success"
          onPress={() => navigate("/stok/sisa")}
        />
        <StatCard
          label="Produksi aktif"
          value={data.openWos.length}
          hint={`${data.openWos.filter((w) => w.status === "berjalan").length} berjalan · ${data.openWos.filter((w) => w.status === "rencana").length} rencana`}
          icon={<Hammer className="size-4" />}
          tone="accent"
          onPress={() => navigate("/produksi")}
        />
        <StatCard
          label="Unit di klien"
          value={data.unitsOut}
          hint={data.lateRentals.length ? `${data.lateRentals.length} sewa terlambat` : "Semua tepat waktu"}
          icon={<Armchair className="size-4" />}
          tone={data.lateRentals.length ? "danger" : "default"}
          onPress={() => navigate("/sewa")}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Section
          className="xl:col-span-2"
          title="Perlu perhatian"
          description="Disusun otomatis dari stok, produksi, sewa, dan dokumen ekspor."
          bodyClassName="p-0"
        >
          {data.insights.length === 0 ? (
            <EmptyBlock icon={<CheckCircle2 className="size-5" />} title="Semua beres" description="Tidak ada yang perlu ditindaklanjuti saat ini." />
          ) : (
            <ul className="divide-y divide-separator">
              {data.insights.slice(0, 8).map((ins) => {
                const sev = SEVERITY[ins.severity];
                return (
                  <li key={ins.id} className="flex items-start gap-3 px-4 py-3">
                    <div className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${sev.className}`}>
                      <sev.icon className="size-4" />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{ins.title}</p>
                        <p className="mt-0.5 text-sm text-muted">{ins.detail}</p>
                      </div>
                      {ins.to && (
                        <Button size="sm" variant="tertiary" className="shrink-0 self-start" onPress={() => navigate(ins.to!)}>
                          {ins.action ?? "Lihat"}
                        </Button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <div className="flex flex-col gap-6">
          <Section title="Pekerjaan cepat">
            <div className="grid grid-cols-2 gap-2">
              {TASKS.map((task) => (
                <button
                  key={task.to}
                  type="button"
                  onClick={() => navigate(task.to)}
                  className="flex flex-col items-start gap-2 rounded-2xl border border-separator p-3 text-left transition hover:border-accent hover:bg-accent-soft/40 focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none"
                >
                  <task.icon className="size-5 text-accent" />
                  <span className="text-sm leading-tight font-medium">{task.label}</span>
                  <span className="text-xs text-muted">{task.hint}</span>
                </button>
              ))}
            </div>
          </Section>
          <Section title="Penjualan bulan ini">
            <p className="text-2xl font-semibold tabular-nums">{formatIDRCompact(data.sales.revenueIdr)}</p>
            <p className="mt-1 text-sm text-muted">
              {data.sales.count} order · ekspor {formatIDRCompact(data.sales.exportIdr)}
            </p>
            <p className="mt-3 text-sm">
              Estimasi margin kotor{" "}
              <b className="tabular-nums">{data.sales.revenueIdr ? formatPct(data.sales.margin / data.sales.revenueIdr) : "—"}</b>
            </p>
          </Section>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Section
          title="Produksi aktif"
          actions={
            <Button size="sm" variant="tertiary" onPress={() => navigate("/produksi")}>
              Semua
            </Button>
          }
          bodyClassName="p-0"
        >
          {data.openWos.length === 0 ? (
            <EmptyBlock
              icon={<PackagePlus className="size-5" />}
              title="Belum ada produksi aktif"
              action={<Button onPress={() => navigate("/produksi/baru")}>Buat perintah kerja</Button>}
            />
          ) : (
            <ul className="divide-y divide-separator">
              {data.openWos.slice(0, 6).map((wo) => {
                const reqs = requirements(db, wo);
                const planned = reqs.filter((r) => r.required > 0);
                const progress = planned.length
                  ? sum(planned.map((r) => Math.min(1, r.issued / r.required))) / planned.length
                  : wo.issues.length
                    ? 1
                    : 0;
                const late = wo.dueDate && wo.dueDate < t;
                return (
                  <li key={wo.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/produksi/${wo.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-default/50"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium text-muted">{wo.code}</span>
                          <StatusChip tone={WO_TYPE[wo.type].tone}>{WO_TYPE[wo.type].short}</StatusChip>
                          <StatusChip tone={WO_STATUS[wo.status].tone}>{WO_STATUS[wo.status].label}</StatusChip>
                        </div>
                        <p className="mt-1 truncate text-sm font-medium">{wo.title}</p>
                        <ProgressBar aria-label="Bahan diambil" value={progress * 100} size="sm" className="mt-2" color={late ? "danger" : "accent"}>
                          <ProgressBar.Track>
                            <ProgressBar.Fill />
                          </ProgressBar.Track>
                        </ProgressBar>
                      </div>
                      <div className="shrink-0 text-right text-xs text-muted">
                        <p>Bahan {formatPct(progress, 0)}</p>
                        {wo.dueDate && <p className={late ? "font-medium text-danger" : ""}>Target {formatDate(wo.dueDate)}</p>}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>

        <Section
          title="Jadwal sewa & pinjam"
          actions={
            <Button size="sm" variant="tertiary" onPress={() => navigate("/sewa")}>
              Semua
            </Button>
          }
          bodyClassName="p-0"
        >
          {data.upcomingRentals.length === 0 ? (
            <EmptyBlock icon={<CalendarClock className="size-5" />} title="Tidak ada jadwal sewa" />
          ) : (
            <ul className="divide-y divide-separator">
              {data.upcomingRentals.map((r) => {
                const out = r.status === "berjalan";
                const ref = out ? r.endDate : r.startDate;
                const d = diffDays(t, ref);
                const late = out && d < 0;
                return (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/sewa/${r.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-default/50"
                    >
                      <div className={`grid size-10 shrink-0 place-items-center rounded-xl text-center text-[10px] leading-tight font-semibold ${late ? "bg-danger-soft text-danger-soft-foreground" : "bg-default"}`}>
                        {formatDate(ref).split(" ").slice(0, 2).join("\n")}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.project}</p>
                        <p className="truncate text-xs text-muted">
                          {r.code} · {r.lines.map((l) => `${l.qty}× ${item(l.itemId)?.name ?? "?"}`).join(", ")}
                        </p>
                      </div>
                      <span className={`shrink-0 text-xs ${late ? "font-semibold text-danger" : "text-muted"}`}>
                        {out ? (late ? `Telat ${-d} hr` : d === 0 ? "Kembali hari ini" : `Kembali ${d} hr`) : d <= 0 ? "Serahkan hari ini" : `Mulai ${d} hr`}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <Card className="mt-6" variant="secondary">
        <Card.Content className="flex flex-col gap-1 text-xs text-muted sm:flex-row sm:items-center sm:justify-between">
          <span>Data diperbarui otomatis setiap ada transaksi. Cadangkan data secara berkala di Pengaturan.</span>
          <span>Pengingat sewa {db.settings.rentalReminderDays} hari sebelum jatuh tempo · sisa dianggap lama setelah {db.settings.remnantAgingDays} hari (sebelum {formatDate(addDays(t, -db.settings.remnantAgingDays))}).</span>
        </Card.Content>
      </Card>
    </>
  );
}
