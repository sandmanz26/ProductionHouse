import type { CostSummary } from "@/domain";
import { Row } from "@/components/ui";
import { formatIDR, formatPct, formatQty } from "@/lib/format";
import { useLookups } from "@/store/db-store";

export function CostBreakdown({ cost, compact }: { cost: CostSummary; compact?: boolean }) {
  const { item } = useLookups();
  return (
    <div className="flex flex-col">
      <Row label="Materials issued (gross)" value={formatIDR(cost.materialGross)} />
      {cost.returnCredit > 0 && <Row label="− Credit for offcuts & returned materials" value={`− ${formatIDR(cost.returnCredit)}`} tone="success" />}
      {cost.scrapRecovery > 0 && <Row label="− Salvage value" value={`− ${formatIDR(cost.scrapRecovery)}`} tone="success" />}
      <Row label="Materials used (net)" value={formatIDR(cost.materialNet)} strong />
      <Row label={cost.laborFromLogs ? "Labour (labour log)" : "Labour (planned)"} value={formatIDR(cost.labor)} />
      <Row label="Overhead" value={formatIDR(cost.overhead)} />
      {cost.extra > 0 && <Row label="Other costs" value={formatIDR(cost.extra)} />}
      <div className="my-2 border-t border-[var(--rule)]" />
      <Row label="Total job cost" value={formatIDR(cost.total)} strong />
      {cost.writeOff > 0 && (
        <Row
          label="− Dismantling loss (above material replacement value)"
          value={`− ${formatIDR(cost.writeOff)}`}
          tone="danger"
        />
      )}
      <div className="mt-3 border-t border-[var(--rule)] pt-2">
        <p className="eyebrow mb-1">Unit cost per output</p>
        {cost.outputs.map((o) => {
          const it = item(o.itemId);
          return (
            <Row
              key={o.outputId}
              label={
                <span>
                  {it?.name ?? "?"} <span className="text-muted">× {formatQty(o.qty, it?.uom)}</span>
                </span>
              }
              value={<b>{formatIDR(o.unitCost)}</b>}
            />
          );
        })}
      </div>
      {((cost.revalued ?? 0) !== 0 || (cost.variance ?? 0) !== 0) && (
        <div className="mt-3 border-t border-[var(--rule)] pt-2">
          <p className="eyebrow mb-1">Partial output</p>
          <Row label="Stock revaluation (provisional → actual cost)" value={formatIDR(cost.revalued)} />
          <Row label="Cost variance on units already out of stock" value={formatIDR(cost.variance)} tone={cost.variance > 0 ? "warning" : "success"} />
        </div>
      )}
      {cost.rejectQty > 0 && <p className="mt-2 text-xs text-danger">{cost.rejectQty} QC reject units go into stock as damaged items.</p>}
      {!compact && (
        <p className="mt-2 text-xs text-muted">
          Material yield {formatPct(cost.yieldRatio)} — the share of material value (after returns) that became product, not waste.
        </p>
      )}
    </div>
  );
}
