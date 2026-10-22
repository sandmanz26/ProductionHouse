import { Link, Tabs, type Key } from "@heroui/react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  addDays,
  COSTING_LABEL,
  inventoryValuation,
  productCostRows,
  rentalUtilization,
  standardProductCost,
  sum,
  today,
  type ProductCostRow,
  type UtilizationRow,
  type WorkOrder,
} from "@/domain";
import { DataTable, PageHeader, Section, MetricStrip, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR, formatIDRCompact, formatPct, formatQty } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";
import { CostingComparison } from "./CostingComparison";

type View = "produk" | "pekerjaan" | "sewa" | "nilai" | "metode";

export default function HppReportPage() {
  const db = useDb();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [view, setView] = useState<View>("produk");

  const products = useMemo(() => productCostRows(db, (p) => standardProductCost(db, p)), [db]);
  const done = useMemo(
    () => db.workOrders.filter((w) => w.status === "selesai" && w.cost).sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? "")),
    [db.workOrders],
  );
  const valuation = useMemo(() => inventoryValuation(db), [db]);
  const util = useMemo(() => rentalUtilization(db, addDays(today(), -89), today()), [db]);

  const totals = useMemo(() => {
    const gross = sum(done.map((w) => w.cost!.materialGross));
    const credit = sum(done.map((w) => w.cost!.returnCredit + w.cost!.scrapRecovery));
    const total = sum(done.map((w) => w.cost!.total));
    const material = sum(done.map((w) => w.cost!.materialNet));
    return {
      gross,
      credit,
      total,
      material,
      labor: sum(done.map((w) => w.cost!.labor + w.cost!.overhead)),
      variance: sum(done.map((w) => w.cost!.variance ?? 0)),
      rejects: sum(done.map((w) => w.cost!.rejectQty ?? 0)),
    };
  }, [done]);

  const productCols: Column<ProductCostRow & { id: string }>[] = [
    { key: "name", header: "Produk", isRowHeader: true, cell: (r) => <span className="font-medium">{r.item.name}</span> },
    { key: "made", header: "Diproduksi", align: "end", cell: (r) => (r.produced ? formatQty(r.produced) : <span className="text-muted">—</span>) },
    { key: "std", header: "HPP standar", align: "end", cell: (r) => formatIDR(r.standard) },
    {
      key: "act",
      header: "HPP aktual rata-rata",
      align: "end",
      cell: (r) => {
        if (!r.avgActual) return <span className="text-muted">—</span>;
        const v = r.standard ? r.avgActual / r.standard - 1 : 0;
        return (
          <div>
            <p className="font-medium">{formatIDR(r.avgActual)}</p>
            {r.standard > 0 && (
              <p className={`text-xs ${v > 0.05 ? "text-danger" : v < -0.05 ? "text-success" : "text-muted"}`}>
                {v > 0 ? "+" : ""}
                {formatPct(v)} vs standar
              </p>
            )}
          </div>
        );
      },
    },
    { key: "price", header: "Harga jual", align: "end", cell: (r) => (r.salePrice ? formatIDR(r.salePrice) : "—") },
    {
      key: "margin",
      header: "Margin",
      align: "end",
      cell: (r) =>
        r.marginPct === undefined ? (
          "—"
        ) : (
          <StatusChip tone={r.marginPct < 0.2 ? "danger" : r.marginPct < 0.35 ? "warning" : "success"}>{formatPct(r.marginPct)}</StatusChip>
        ),
    },
  ];

  const woCols: Column<WorkOrder>[] = [
    { key: "code", header: "Kode", isRowHeader: true, className: "whitespace-nowrap", cell: (w) => <Link href={`/produksi/${w.id}`}>{w.code}</Link> },
    { key: "type", header: "Jenis", cell: (w) => <StatusChip tone={WO_TYPE[w.type].tone}>{WO_TYPE[w.type].short}</StatusChip> },
    {
      key: "out",
      header: "Hasil",
      cell: (w) => (
        <span className="text-sm">{w.cost!.outputs.map((o) => `${formatQty(o.qty, item(o.itemId)?.uom)} ${item(o.itemId)?.name ?? ""}`).join(", ")}</span>
      ),
    },
    { key: "date", header: "Selesai", className: "whitespace-nowrap", cell: (w) => formatDate(w.completedAt) },
    { key: "mat", header: "Bahan neto", align: "end", cell: (w) => formatIDR(w.cost!.materialNet) },
    {
      key: "credit",
      header: "Hemat dari sisa",
      align: "end",
      cell: (w) => {
        const c = w.cost!.returnCredit + w.cost!.scrapRecovery;
        return c ? <span className="text-success">{formatIDR(c)}</span> : <span className="text-muted">—</span>;
      },
    },
    { key: "labor", header: "TK + overhead", align: "end", cell: (w) => formatIDR(w.cost!.labor + w.cost!.overhead + w.cost!.extra) },
    { key: "total", header: "Total HPP", align: "end", cell: (w) => <b>{formatIDR(w.cost!.total)}</b> },
    { key: "yield", header: "Rendemen", align: "end", cell: (w) => formatPct(w.cost!.yieldRatio) },
    { key: "rej", header: "Reject", align: "end", cell: (w) => (w.cost!.rejectQty ? <span className="text-danger">{w.cost!.rejectQty}</span> : "—") },
    { key: "var", header: "Selisih HPP", align: "end", cell: (w) => (w.cost!.variance ? formatIDR(w.cost!.variance) : "—") },
  ];

  const utilCols: Column<UtilizationRow & { id: string }>[] = [
    { key: "item", header: "Produk sewa", isRowHeader: true, cell: (r) => item(r.itemId)?.name ?? "?" },
    { key: "owned", header: "Unit dimiliki", align: "end", cell: (r) => r.owned },
    { key: "days", header: "Unit-hari keluar", align: "end", cell: (r) => r.unitDays },
    {
      key: "util",
      header: "Utilisasi 90 hari",
      align: "end",
      cell: (r) => <span className={r.utilization < 0.15 ? "text-warning" : ""}>{formatPct(r.utilization)}</span>,
    },
    { key: "n", header: "Jumlah sewa", align: "end", cell: (r) => r.rentals },
    { key: "rev", header: "Pendapatan", align: "end", cell: (r) => formatIDR(r.revenue) },
    { key: "dmg", header: "Kembali rusak", align: "end", cell: (r) => (r.damaged ? <span className="text-danger">{r.damaged}</span> : "—") },
  ];

  return (
    <>
      <PageHeader
        title="Laporan HPP"
        description="HPP aktual vs standar BOM, utilisasi sewa, dan nilai persediaan."
      />
      <MetricStrip
        className="mb-5"
        items={[
          { label: "Total HPP produksi", value: formatIDRCompact(totals.total), hint: `${done.length} pekerjaan selesai` },
          { label: "Bahan terpakai", value: formatIDRCompact(totals.material), hint: totals.total ? `${formatPct(totals.material / totals.total, 0)} dari HPP` : undefined },
          { label: "Dihemat lewat sisa", value: formatIDRCompact(totals.credit), hint: totals.gross ? `${formatPct(totals.credit / totals.gross)} dari bahan diambil` : undefined },
          { label: "TK & overhead", value: formatIDRCompact(totals.labor) },
          { label: "Selisih HPP", value: formatIDRCompact(totals.variance), hint: `${totals.rejects} unit reject QC`, tone: totals.variance > 0 ? "warning" : "default" },
        ]}
      />

      <Tabs selectedKey={view} onSelectionChange={(k: Key) => setView(k as View)} className="mb-4">
        <Tabs.ListContainer>
          <Tabs.List aria-label="Tampilan laporan">
            <Tabs.Tab id="produk">
              Per produk
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="pekerjaan">
              Per pekerjaan
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="sewa">
              Utilisasi sewa
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="nilai">
              Nilai persediaan
              <Tabs.Indicator />
            </Tabs.Tab>
            <Tabs.Tab id="metode">
              Metode biaya
              <Tabs.Indicator />
            </Tabs.Tab>
          </Tabs.List>
        </Tabs.ListContainer>
      </Tabs>

      {view === "produk" && (
        <DataTable label="HPP per produk" columns={productCols} rows={products.map((p) => ({ ...p, id: p.item.id }))} onRowAction={(r) => navigate(`/master/item/${r.item.id}`)} />
      )}
      {view === "pekerjaan" && <DataTable label="HPP per pekerjaan" columns={woCols} rows={done} onRowAction={(w) => navigate(`/produksi/${w.id}`)} />}
      {view === "sewa" && (
        <>
          <DataTable label="Utilisasi sewa" columns={utilCols} rows={util.map((u) => ({ ...u, id: u.itemId }))} />
          <p className="mt-2 text-xs text-muted">Utilisasi = unit-hari keluar ÷ (unit dimiliki × 90 hari). Unit dengan utilisasi rendah lebih baik dijual atau dipakai untuk produksi lain.</p>
        </>
      )}
      {view === "metode" && <CostingComparison />}
      {view === "nilai" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Section title="Ringkasan nilai persediaan">
            <ValRow label="Material (termasuk sisa)" value={valuation.materials} total={valuation.total} />
            <ValRow label="— di antaranya sisa material" value={valuation.remnants} total={valuation.total} muted />
            <ValRow label="Produk jadi" value={valuation.products} total={valuation.total} />
            <ValRow label="— di antaranya sedang disewa" value={valuation.rented} total={valuation.total} muted />
            <ValRow label="— di antaranya rusak" value={valuation.damaged} total={valuation.total} muted />
            <div className="mt-2 flex justify-between border-t border-[var(--rule)] pt-2 font-semibold">
              <span>Total persediaan</span>
              <span className="tabular-nums">{formatIDR(valuation.total)}</span>
            </div>
          </Section>
          <Section title="Cara membaca">
            <ul className="list-disc space-y-2 pl-4 text-sm text-muted">
              <li>Setiap lot punya harga pokoknya sendiri: pembelian (harga + ongkir), hasil produksi (HPP aktual), atau sisa (harga rata-rata bahan di pekerjaan asalnya).</li>
              <li>
                Metode biaya saat ini <b className="text-foreground">{COSTING_LABEL[db.settings.costingMethod]}</b> menentukan lot biasa mana yang keluar lebih dulu
                (atau, untuk rata-rata, harga bersama semua lot). Bandingkan dampaknya di tab Metode biaya.
              </li>
              <li>Sisa material mengurangi HPP pekerjaan yang menghasilkannya dan menambah nilai persediaan — tidak hilang sebagai biaya.</li>
              <li>Dekonstruksi tidak menaikkan nilai bahan di atas harga barunya; kelebihannya dicatat sebagai rugi.</li>
              <li>Unit yang disewakan tetap aset perusahaan dan tetap dihitung dalam persediaan.</li>
            </ul>
          </Section>
        </div>
      )}
    </>
  );
}

function ValRow({ label, value, total, muted }: { label: string; value: number; total: number; muted?: boolean }) {
  const pct = total ? value / total : 0;
  return (
    <div className={`py-1.5 ${muted ? "pl-3 text-muted" : ""}`}>
      <div className="flex justify-between text-sm">
        <span>{label}</span>
        <span className="tabular-nums">{formatIDR(value)}</span>
      </div>
      {!muted && (
        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-default">
          <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, pct * 100)}%` }} />
        </div>
      )}
    </div>
  );
}
