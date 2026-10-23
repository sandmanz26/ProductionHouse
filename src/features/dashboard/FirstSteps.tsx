import { Link } from "@heroui/react";
import { Check } from "lucide-react";
import { Section } from "@/components/ui";
import { useDb } from "@/store/db-store";

/**
 * Shown on a brand-new workshop until the basics exist. Steps tick themselves off from the data,
 * so there is nothing to dismiss and nothing to fall out of sync.
 */
export function FirstSteps() {
  const db = useDb();
  const steps = [
    {
      done: db.items.some((i) => i.kind === "material"),
      title: "Register materials",
      body: "Wood, boards, foam, hardware — with the stock unit and the unit you buy from the supplier.",
      href: "/items/new?type=material",
      cta: "Add material",
    },
    {
      done: db.items.some((i) => i.kind === "product" && (i.bom?.length ?? 0) > 0),
      title: "Create a product with a recipe",
      body: "Materials per unit and standard labour hours. Material shortages are worked out from this automatically.",
      href: "/items/new",
      cta: "Add product",
    },
    {
      done: db.lots.length > 0,
      title: "Stock the warehouse",
      body: "Record a purchase (freight goes into the unit cost) or opening stock from Materials.",
      href: "/purchases/new",
      cta: "Record purchase",
    },
    {
      done: db.workOrders.length > 0,
      title: "Open the first work order",
      body: "Issue materials by lot, complete it with output and offcuts — the job cost locks there.",
      href: "/work-orders/new",
      cta: "Create work order",
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Section title="First steps" description={`${steps.filter((s) => s.done).length} of ${steps.length} done`} bodyClassName="p-0">
      <ol className="divide-y divide-[var(--rule)]">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 px-4 py-3.5">
            <span
              className={`num grid size-6 shrink-0 place-items-center rounded-sm border text-xs ${
                s.done ? "border-success text-success" : i === next ? "border-accent text-accent" : "border-[var(--rule)] text-muted"
              }`}
            >
              {s.done ? <Check className="size-3.5" aria-label="done" /> : String(i + 1).padStart(2, "0")}
            </span>
            <div className="min-w-0 flex-1">
              <p className={`text-sm font-medium ${s.done ? "text-muted line-through decoration-[var(--rule)]" : ""}`}>{s.title}</p>
              {!s.done && <p className="mt-0.5 text-[13px] text-muted">{s.body}</p>}
            </div>
            {!s.done && i === next && (
              <Link href={s.href} className="shrink-0 self-center text-[13px] font-medium text-accent no-underline">
                {s.cta} →
              </Link>
            )}
          </li>
        ))}
      </ol>
    </Section>
  );
}
