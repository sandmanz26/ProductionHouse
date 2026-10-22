import { useMemo, useState } from "react";
import {
  COSTING_COMPLIANCE,
  COSTING_LABEL,
  compareCostingMethods,
  sum,
  type CostingMethod,
  type ItemKind,
  type MethodComparisonRow,
} from "@/domain";
import { DataTable, Section, type Column } from "@/components/ui";
import { formatIDR, formatQty } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";

type Simulated = "fifo" | "rata_rata" | "lifo";
const SIMULATED: Simulated[] = ["fifo", "rata_rata", "lifo"];

/** "What would my material cost be under another formula?" — replayed from the stock ledger. */
export function CostingComparison() {
  const db = useDb();
  const { item } = useLookups();
  const [kind, setKind] = useState<ItemKind>("material");
  const rows = useMemo(() => compareCostingMethods(db, { kind }).filter((r) => r.outflowQty > 0), [db, kind]);
  const total = (pick: (r: MethodComparisonRow) => number) => sum(rows.map(pick));
  const recordedOut = total((r) => r.recorded.outflow);
  const current = db.settings.costingMethod;

  const summary: { id: string; label: string; method?: CostingMethod; outflow: number; ending: number }[] = [
    { id: "recorded", label: "Tercatat di buku", outflow: recordedOut, ending: total((r) => r.recorded.ending) },
    ...SIMULATED.map((m) => ({
      id: m,
      label: COSTING_LABEL[m],
      method: m,
      outflow: total((r) => r[m].outflow),
      ending: total((r) => r[m].ending),
    })),
  ];

  const summaryCols: Column<(typeof summary)[number]>[] = [
    {
      key: "m",
      header: "Metode",
      isRowHeader: true,
      cell: (r) => (
        <span className="flex flex-wrap items-center gap-2">
          <span className={r.method === current ? "font-semibold" : "font-medium"}>{r.label}</span>
          {r.method === current && <span className="text-xs text-accent">dipakai</span>}
          {r.method && !COSTING_COMPLIANCE[r.method].psak && <span className="text-xs text-danger">bukan PSAK</span>}
        </span>
      ),
    },
    { key: "out", header: kind === "material" ? "Biaya bahan keluar" : "HPP barang keluar", align: "end", cell: (r) => formatIDR(r.outflow) },
    { key: "end", header: "Nilai stok akhir", align: "end", cell: (r) => formatIDR(r.ending) },
    {
      key: "diff",
      header: "Selisih biaya vs buku",
      align: "end",
      cell: (r) => {
        if (r.id === "recorded") return <span className="text-muted">—</span>;
        const d = r.outflow - recordedOut;
        return <span className={Math.abs(d) < 1 ? "text-muted" : d > 0 ? "text-danger" : "text-success"}>{Math.abs(d) < 1 ? "0" : `${d > 0 ? "+" : "−"}${formatIDR(Math.abs(d))}`}</span>;
      },
    },
  ];

  const itemCols: Column<MethodComparisonRow & { id: string }>[] = [
    {
      key: "item",
      header: "Barang",
      isRowHeader: true,
      cell: (r) => (
        <div className="min-w-36">
          <p className="font-medium">{item(r.itemId)?.name}</p>
          <p className="text-xs text-muted">
            keluar {formatQty(r.outflowQty, item(r.itemId)?.uom)} · sisa {formatQty(r.endingQty, item(r.itemId)?.uom)}
          </p>
        </div>
      ),
    },
    ...SIMULATED.map((m) => ({
      key: m,
      header: COSTING_LABEL[m],
      align: "end" as const,
      cell: (r: MethodComparisonRow) => formatIDR(r[m].outflow),
    })),
    {
      key: "spread",
      header: "Rentang",
      align: "end",
      cell: (r) => {
        const xs = SIMULATED.map((m) => r[m].outflow);
        const spread = Math.max(...xs) - Math.min(...xs);
        return spread < 1 ? <span className="text-muted">sama</span> : formatIDR(spread);
      },
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Perbandingan metode biaya"
        description="Kartu stok diputar ulang dengan setiap metode: berapa biaya barang yang keluar dan berapa nilai stok yang tersisa. Totalnya selalu sama — metode hanya menggeser biaya antara HPP dan persediaan."
        actions={
          <div role="radiogroup" aria-label="Jenis barang" className="flex gap-1 text-[13px]">
            {(["material", "product"] as ItemKind[]).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                onClick={() => setKind(k)}
                className={`rounded-sm border px-2.5 py-1 ${kind === k ? "border-accent font-medium" : "border-[var(--rule)] text-muted hover:text-foreground"}`}
              >
                {k === "material" ? "Material" : "Produk"}
              </button>
            ))}
          </div>
        }
        bodyClassName="p-0"
      >
        <DataTable label="Ringkasan per metode" columns={summaryCols} rows={summary} dependencies={[current, kind]} />
      </Section>
      <Section title="Per barang" description="Barang dengan rentang terbesar paling sensitif terhadap pilihan metode — biasanya yang harganya naik-turun tajam." bodyClassName="p-0">
        <DataTable
          label="Perbandingan per barang"
          columns={itemCols}
          rows={rows
            .map((r) => ({ ...r, id: r.itemId }))
            .sort((a, b) => spreadOf(b) - spreadOf(a))}
          dependencies={[kind]}
        />
      </Section>
      <p className="text-xs text-muted">
        Simulasi memakai harga masuk sebagaimana tercatat (pembelian, saldo awal, hasil produksi). Dampak lanjutan ke HPP produk yang dibuat dari bahan
        tersebut tidak dihitung ulang. Sisa material dan barang khusus pekerjaan diperlakukan sebagai lapisan biasa.
      </p>
    </div>
  );
}

const spreadOf = (r: MethodComparisonRow) => {
  const xs = SIMULATED.map((m) => r[m].outflow);
  return Math.max(...xs) - Math.min(...xs);
};
