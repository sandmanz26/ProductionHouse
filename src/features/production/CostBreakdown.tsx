import type { CostSummary } from "@/domain";
import { Row } from "@/components/ui";
import { formatIDR, formatPct, formatQty } from "@/lib/format";
import { useLookups } from "@/store/db-store";

export function CostBreakdown({ cost, compact }: { cost: CostSummary; compact?: boolean }) {
  const { item } = useLookups();
  return (
    <div className="flex flex-col">
      <Row label="Bahan diambil (bruto)" value={formatIDR(cost.materialGross)} />
      {cost.returnCredit > 0 && <Row label="− Kredit sisa & bahan kembali" value={`− ${formatIDR(cost.returnCredit)}`} tone="success" />}
      {cost.scrapRecovery > 0 && <Row label="− Nilai limbah terjual" value={`− ${formatIDR(cost.scrapRecovery)}`} tone="success" />}
      <Row label="Bahan terpakai (neto)" value={formatIDR(cost.materialNet)} strong />
      <Row label="Tenaga kerja" value={formatIDR(cost.labor)} />
      <Row label="Overhead" value={formatIDR(cost.overhead)} />
      {cost.extra > 0 && <Row label="Biaya lain" value={formatIDR(cost.extra)} />}
      <div className="my-2 border-t border-separator" />
      <Row label="Total biaya pekerjaan" value={formatIDR(cost.total)} strong />
      {cost.writeOff > 0 && (
        <Row
          label="− Rugi dekonstruksi (di atas nilai pengganti bahan)"
          value={`− ${formatIDR(cost.writeOff)}`}
          tone="danger"
        />
      )}
      <div className="mt-3 rounded-2xl bg-accent-soft/60 p-3">
        <p className="mb-1 text-xs font-semibold tracking-wide text-accent-soft-foreground uppercase">HPP per unit hasil</p>
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
      {!compact && (
        <p className="mt-2 text-xs text-muted">
          Rendemen bahan {formatPct(cost.yieldRatio)} — porsi nilai bahan (setelah dikurangi yang kembali) yang menjadi produk, bukan limbah.
        </p>
      )}
    </div>
  );
}
