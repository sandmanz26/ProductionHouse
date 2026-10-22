import { Button, Link, Tabs, type Key } from "@heroui/react";
import { useMemo, useState } from "react";
import { agingSummary, payables, receivables, refundsDue, today, type OpenItem } from "@/domain";
import { PaymentDialog } from "@/components/PaymentsSection";
import { Code, DataTable, EmptyBlock, MetricStrip, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR, formatIDRCompact, formatMoney } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";

type View = "piutang" | "utang" | "refund";

const docRoute = (i: OpenItem) => (i.doc === "sale" ? `/penjualan/${i.id}` : i.doc === "rental" ? `/sewa/${i.id}` : `/pembelian/${i.id}`);

export default function FinancePage() {
  const db = useDb();
  const { partnerName } = useLookups();
  const [view, setView] = useState<View>("piutang");
  const [paying, setPaying] = useState<OpenItem | null>(null);
  const t = today();

  const data = useMemo(() => {
    const ar = receivables(db, t);
    const ap = payables(db, t);
    const refunds = refundsDue(db);
    return { ar, ap, refunds, arAging: agingSummary(ar), apAging: agingSummary(ap) };
  }, [db, t]);

  const rows = view === "piutang" ? data.ar : view === "utang" ? data.ap : data.refunds;
  const aging = view === "utang" ? data.apAging : data.arAging;

  const columns: Column<OpenItem>[] = [
    { key: "code", header: "Dokumen", isRowHeader: true, cell: (i) => <Link href={docRoute(i)}><Code>{i.code}</Code></Link> },
    { key: "who", header: view === "utang" ? "Pemasok" : "Pelanggan", cell: (i) => partnerName(i.partnerId) },
    { key: "due", header: "Jatuh tempo", className: "whitespace-nowrap", cell: (i) => <span className="num">{formatDate(i.dueDate)}</span> },
    {
      key: "age",
      header: "Status",
      cell: (i) =>
        view === "refund" ? (
          <StatusChip tone="warning">kembalikan deposit</StatusChip>
        ) : i.overdueDays > 0 ? (
          <StatusChip tone="danger">telat {i.overdueDays} hari</StatusChip>
        ) : (
          <StatusChip tone="default">{i.overdueDays === 0 ? "jatuh tempo hari ini" : `${-i.overdueDays} hari lagi`}</StatusChip>
        ),
    },
    { key: "billed", header: "Tagihan", align: "end", cell: (i) => formatMoney(i.billed, i.currency) },
    { key: "bal", header: view === "refund" ? "Dikembalikan" : "Sisa", align: "end", cell: (i) => <b>{formatMoney(Math.abs(i.balance), i.currency)}</b> },
    { key: "idr", header: "Setara IDR", align: "end", cell: (i) => (i.currency === "IDR" ? "—" : formatIDR(i.balanceIdr)) },
    {
      key: "act",
      header: "",
      align: "end",
      cell: (i) => (
        <Button size="sm" variant="secondary" onPress={() => setPaying(i)}>
          {view === "refund" ? "Catat refund" : "Catat bayar"}
        </Button>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Piutang & utang" description="Uang yang belum masuk dan belum keluar, diurutkan dari yang paling lama lewat tempo." />
      <MetricStrip
        className="mb-5"
        items={[
          ...aging.map((a) => ({ label: a.label, value: formatIDRCompact(a.amount), hint: `${a.count} dokumen`, tone: a.key !== "belum" && a.amount > 0 ? ("danger" as const) : ("default" as const) })),
        ]}
      />
      <Tabs selectedKey={view} onSelectionChange={(k: Key) => setView(k as View)} className="mb-4">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Jenis">
            <Tabs.Tab id="piutang">
              Piutang <span className="num ml-1 text-muted">{data.ar.length}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="utang">
              Utang pemasok <span className="num ml-1 text-muted">{data.ap.length}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="refund">
              Refund deposit <span className="num ml-1 text-muted">{data.refunds.length}</span>
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>
      <div className="rounded-md bg-surface shadow-[var(--surface-shadow)]">
        <DataTable label="Daftar tagihan" columns={columns} rows={rows} dependencies={[view]} empty={<EmptyBlock title="Buku bersih" description="Tidak ada tagihan yang masih terbuka di daftar ini." />} />
      </div>
      {paying && <PaymentDialog doc={paying.doc} id={paying.id} isOpen onOpenChange={(o) => !o && setPaying(null)} />}
    </>
  );
}
