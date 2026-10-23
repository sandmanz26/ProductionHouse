import { useMemo, useState } from "react";
import { addDays, plantFlow, sum, today } from "@/domain";
import { FlowDiagram } from "@/components/FlowDiagram";
import { MetricStrip, PageHeader, Section } from "@/components/ui";
import { formatIDRCompact, formatPct } from "@/lib/format";
import { useDb } from "@/store/db-store";

type Period = "30" | "90" | "year" | "all";
const PERIODS: { id: Period; label: string }[] = [
  { id: "30", label: "30 days" },
  { id: "90", label: "90 days" },
  { id: "year", label: "This year" },
  { id: "all", label: "All" },
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
        title="Flow map"
        description="The whole workshop in one picture: where materials come from, what production makes, and where the output goes — in rupiah."
        actions={
          <div role="radiogroup" aria-label="Period" className="flex gap-1 text-[13px]">
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
          { label: "Into production", value: formatIDRCompact(intoProd), hint: "materials, reworked products, labour" },
          { label: "Became product", value: formatIDRCompact(made), hint: intoProd ? `${formatPct(made / intoProd, 0)} of input` : undefined },
          { label: "Offcuts & processed back", value: formatIDRCompact(recycled), hint: intoStore ? `${formatPct(recycled / intoStore, 0)} of material store supply` : undefined, tone: recycled > 0 ? "success" : "default" },
          { label: "Products sold", value: formatIDRCompact(sold), hint: made ? `${formatPct(sold / made, 0)} of what was made` : undefined },
        ]}
      />
      <Section
        title="Value flow"
        description="Click a node to open its records. Production output is traced lot by lot up to today, so 'Sold' and 'In stock' show what happened to the goods made in this period."
        bodyClassName="p-0"
      >
        <FlowDiagram graph={graph} label="Workshop flow map" empty="No movements in this period yet." />
      </Section>
      <div className="mt-4 grid grid-cols-1 gap-x-8 gap-y-2 text-xs text-muted sm:grid-cols-2">
        <p>
          <b className="font-medium text-foreground">Work in progress</b> is value that has gone into work orders but has not come out as goods yet — usually work orders still in progress.
        </p>
        <p>
          <b className="font-medium text-foreground">Offcuts & processed</b> appear twice: out of production, then back in as material store supply. That loop is what gives every offcut a price.
        </p>
      </div>
    </>
  );
}
