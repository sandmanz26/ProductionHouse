import { ArrowRight } from "lucide-react";
import type { FlowStep } from "./content";
import { STEP_COLOR } from "./step-color";


/** A small left-to-right picture of a process; wraps to a vertical list on phones. */
export function FlowSteps({ steps, note, compact }: { steps: FlowStep[]; note?: string; compact?: boolean }) {
  return (
    <figure className="m-0">
      <ol className="flex flex-col gap-1.5 sm:flex-row sm:flex-wrap sm:items-stretch sm:gap-0">
        {steps.map((s, i) => (
          <li key={i} className="flex items-stretch gap-1.5 sm:gap-0">
            <div
              className={`flex min-w-0 flex-1 flex-col justify-center rounded-sm border border-[var(--rule)] bg-surface ${compact ? "px-2.5 py-1.5" : "px-3 py-2"} sm:min-w-28`}
              style={{ borderLeft: `3px solid ${STEP_COLOR[s.kind]}` }}
            >
              <span className="num text-[10px] text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className={`${compact ? "text-[12px]" : "text-[13px]"} leading-snug font-medium`}>{s.label}</span>
              {s.sub && <span className="text-[11px] leading-snug text-muted">{s.sub}</span>}
            </div>
            {i < steps.length - 1 && (
              <span aria-hidden className="hidden items-center px-1.5 text-muted sm:flex">
                <ArrowRight className="size-3.5" />
              </span>
            )}
          </li>
        ))}
      </ol>
      {note && <figcaption className="mt-2 text-xs leading-relaxed text-muted">{note}</figcaption>}
    </figure>
  );
}
