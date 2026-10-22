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
      <Row label={cost.laborFromLogs ? "Tenaga kerja (catatan kerja)" : "Tenaga kerja (rencana)"} value={formatIDR(cost.labor)} />
      <Row label="Overhead" value={formatIDR(cost.overhead)} />
      {cost.extra > 0 && <Row label="Biaya lain" value={formatIDR(cost.extra)} />}
      <div className="my-2 border-t border-[var(--rule)]" />
      <Row label="Total biaya pekerjaan" value={formatIDR(cost.total)} strong />
      {cost.writeOff > 0 && (
        <Row
          label="− Rugi dekonstruksi (di atas nilai pengganti bahan)"
          value={`− ${formatIDR(cost.writeOff)}`}
          tone="danger"
        />
      )}
      <div className="mt-3 border-t border-[var(--rule)] pt-2">
        <p className="eyebrow mb-1">HPP per unit hasil</p>
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
          <p className="eyebrow mb-1">Hasil sebagian</p>
          <Row label="Revaluasi stok (HPP sementara → aktual)" value={formatIDR(cost.revalued)} />
          <Row label="Selisih HPP atas unit yang sudah keluar" value={formatIDR(cost.variance)} tone={cost.variance > 0 ? "warning" : "success"} />
        </div>
      )}
      {cost.rejectQty > 0 && <p className="mt-2 text-xs text-danger">{cost.rejectQty} unit reject QC masuk sebagai barang rusak.</p>}
      {!compact && (
        <p className="mt-2 text-xs text-muted">
          Rendemen bahan {formatPct(cost.yieldRatio)} — porsi nilai bahan (setelah dikurangi yang kembali) yang menjadi produk, bukan limbah.
        </p>
      )}
    </div>
  );
}
