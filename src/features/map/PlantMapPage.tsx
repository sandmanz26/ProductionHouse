import { useMemo, useState } from "react";
import { addDays, plantFlow, sum, today } from "@/domain";
import { FlowDiagram } from "@/components/FlowDiagram";
import { MetricStrip, PageHeader, Section } from "@/components/ui";
import { formatIDRCompact, formatPct } from "@/lib/format";
import { useDb } from "@/store/db-store";

type Period = "30" | "90" | "year" | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: "30", label: "30 hari" },
  { id: "90", label: "90 hari" },
  { id: "year", label: "Tahun ini" },
  { id: "all", label: "Semua" },
];

/** The whole workshop on one page: purchases → warehouse → production → products → customers. */
export default function PlantMapPage() {
  const db = useDb();
  const [period, setPeriod] = useState<Period>("90");
  const t = today();
  const from = period === "30" ? addDays(t, -29) : period === "90" ? addDays(t, -89) : period === "year" ? `${t.slice(0, 4)}-01-01` : undefined;
  const graph = useMemo(() => plantFlow(db, { from, to: t }), [db, from, t]);

  const link = (s: string, tg: string) => graph.links.find((l) => l.source === s && l.target === tg)?.value ?? 0;
  const intoProd = sum(graph.links.filter((l) => l.target === "prod").map((l) => l.value));
  const recycled = link("src:recycled", "store:bahan");
  const intoStore = sum(graph.links.filter((l) => l.target === "store:bahan").map((l) => l.value));
  const sold = link("out:produk", "fate:sold");
  const made = link("prod", "out:produk");

  return (
    <>
      <PageHeader
        title="Peta alur"
        description="Seluruh bengkel dalam satu gambar: dari mana bahan datang, apa yang dibuat produksi, dan ke mana hasilnya pergi — dalam rupiah."
        actions={
          <div role="radiogroup" aria-label="Periode" className="flex gap-1 text-[13px]">
            {PERIODS.map((p) => (
              <button
                key={p.id}
                type="button"
                role="radio"
                aria-checked={period === p.id}
                onClick={() => setPeriod(p.id)}
                className={`rounded-sm border px-2.5 py-1 ${period === p.id ? "border-accent bg-surface font-medium" : "border-[var(--rule)] text-muted hover:text-foreground"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        }
      />
      <MetricStrip
        className="mb-6"
        items={[
          { label: "Masuk produksi", value: formatIDRCompact(intoProd), hint: "bahan, produk diolah, tenaga kerja" },
          { label: "Jadi produk", value: formatIDRCompact(made), hint: intoProd ? `${formatPct(made / intoProd, 0)} dari yang masuk` : undefined },
          { label: "Sisa & olahan kembali", value: formatIDRCompact(recycled), hint: intoStore ? `${formatPct(recycled / intoStore, 0)} pasokan gudang bahan` : undefined, tone: recycled > 0 ? "success" : "default" },
          { label: "Produk terjual", value: formatIDRCompact(sold), hint: made ? `${formatPct(sold / made, 0)} dari yang dibuat` : undefined },
        ]}
      />
      <Section
        title="Aliran nilai"
        description="Klik simpul untuk membuka datanya. Hasil produksi ditelusuri lot demi lot sampai hari ini, jadi 'Terjual' dan 'Di gudang' adalah nasib barang yang dibuat pada periode ini."
        bodyClassName="p-0"
      >
        <FlowDiagram graph={graph} label="Peta alur bengkel" empty="Belum ada pergerakan pada periode ini." />
      </Section>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs text-muted sm:grid-cols-2">
        <p>
          <b className="font-medium text-foreground">Dalam proses</b> adalah nilai yang sudah masuk pekerjaan tetapi belum keluar sebagai barang — biasanya pekerjaan yang masih berjalan.
        </p>
        <p>
          <b className="font-medium text-foreground">Sisa & olahan</b> muncul dua kali: keluar dari produksi, lalu masuk lagi sebagai pasokan gudang bahan. Itulah lingkaran yang membuat setiap potongan punya harga.
        </p>
      </div>
    </>
  );
}
