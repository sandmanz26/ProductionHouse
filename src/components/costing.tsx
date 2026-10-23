import { COSTING_COMPLIANCE, COSTING_LABEL, COSTING_METHODS, type CostingMethod } from "@/domain";
import { COSTING_HINT } from "@/lib/labels";

function Compliance({ method }: { method: CostingMethod }) {
  const c = COSTING_COMPLIANCE[method];
  const tag = (ok: boolean, label: string) => (
    <span className={`num rounded-sm border px-1.5 py-px text-[10px] ${ok ? "border-success/40 text-success" : "border-danger/40 text-danger"}`}>
      {ok ? "✓" : "✗"} {label}
    </span>
  );
  return (
    <span className="flex flex-wrap gap-1">
      {tag(c.psak, "PSAK 14")}
      {tag(c.tax, "Income tax")}
    </span>
  );
}

/** Radio cards for the company-wide cost formula. */
export function CostingMethodPicker({ value, onChange, name }: { value: CostingMethod; onChange: (m: CostingMethod) => void; name: string }) {
  return (
    <div role="radiogroup" aria-label="Inventory costing method" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {COSTING_METHODS.map((m) => {
        const active = value === m;
        return (
          <label
            key={m}
            className={`flex cursor-pointer gap-3 rounded-sm border px-3.5 py-3 transition-colors ${
              active ? "border-accent bg-surface" : "border-[var(--rule)] hover:border-[var(--ink-soft)]"
            }`}
          >
            <input
              type="radio"
              name={name}
              value={m}
              checked={active}
              onChange={() => onChange(m)}
              className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
            />
            <span className="min-w-0">
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium">{COSTING_LABEL[m]}</span>
                <Compliance method={m} />
              </span>
              <span className="mt-1 block text-[13px] leading-relaxed text-muted">{COSTING_HINT[m]}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
}
