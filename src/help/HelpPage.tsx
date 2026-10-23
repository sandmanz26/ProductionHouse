import { Button } from "@heroui/react";
import { ChevronRight, PlayCircle, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { PageHeader, Section } from "@/components/ui";
import { normalize } from "@/lib/table-query";
import { BRAND } from "@/brand/brand";
import { FlowSteps } from "./FlowSteps";
import { GLOSSARY, HELP_TOPICS, type HelpTopic } from "./content";
import { useHelp } from "./help-store";
import { ProcessOverview } from "./ProcessOverview";
import { TopicGuide } from "./TopicGuide";

const GROUPS: HelpTopic["group"][] = ["Start", "Production", "Buying & selling", "Stock", "Analysis", "Setup"];

const FIRST_DAY = [
  { title: "Add what you buy and make", body: "Products & materials: timber, panels, hardware, and your products with their BOM (what one unit needs).", to: "/items" },
  { title: "Add customers and suppliers", body: "Customers & suppliers: names, payment terms, currency.", to: "/contacts" },
  { title: "Put in opening stock", body: "Stock → Materials → Opening stock, or receive your first purchase order.", to: "/stock/materials" },
  { title: "Open a work order", body: "Choose a product and quantity; Serat lists the materials it needs and what is short.", to: "/work-orders/new" },
  { title: "Complete it and sell", body: "Complete the job to lock its cost, then ship it on a sales order and record the payment.", to: "/sales/new" },
];

const FAQ = [
  { q: "Why is the job cost lower than the material I issued?", a: "Usable offcuts you put back on completion take their share of the cost with them, and waste you sold is subtracted. The Job cost section on the work order shows each line." },
  { q: "Which lot does Serat take when I issue material?", a: "Lots bought for this job first, then offcuts (smallest first), then the rest by your costing method (FIFO by default). You can always pick a different lot in the Issue dialog." },
  { q: "I shipped units before the job was completed. Is the margin wrong?", a: "Partial receipts go in at standard cost. When the job completes they are revalued to actual cost, and units already sold show as a cost variance in the Cost report." },
  { q: "Are rented-out units still my stock?", a: "Yes. They stay in stock value with status On rent until they come back. Damaged returns can go straight into a Repair work order." },
  { q: "Where do I see what happened to one board of timber?", a: "Open the lot (from any stock page or the lot code) and use Trace: it shows the purchase it came from and every job, offcut and customer it went to." },
  { q: "Is my data saved?", a: "It is saved in this browser on this device. Use Settings → Backup to download a file and restore it elsewhere." },
];

export default function HelpPage() {
  const { hash } = useLocation();
  const navigate = useNavigate();
  const openTour = useHelp((s) => s.openTour);
  const resetTips = useHelp((s) => s.resetTips);
  const [picked, setPicked] = useState<{ id: string | null; hash: string } | null>(null);
  // A new #topic in the URL opens that guide; a click inside the page overrides it.
  const open = picked && picked.hash === hash ? picked.id : hash ? hash.slice(1) : null;
  const setOpen = (id: string | null) => setPicked({ id, hash });
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!hash) return;
    requestAnimationFrame(() => document.getElementById(`topic-${hash.slice(1)}`)?.scrollIntoView({ block: "start" }));
  }, [hash]);

  const goTopic = (id: string) => {
    setOpen(id);
    requestAnimationFrame(() => document.getElementById(`topic-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const terms = useMemo(() => {
    const words = normalize(q).split(" ").filter(Boolean);
    return GLOSSARY.filter((g) => words.every((w) => normalize(`${g.term} ${g.meaning} ${g.where ?? ""}`).includes(w)));
  }, [q]);

  return (
    <>
      <PageHeader
        title="Help"
        description={`How ${BRAND.name} fits together, a guide to every page, and the words it uses.`}
        actions={
          <>
            <Button variant="tertiary" size="sm" onPress={resetTips}>
              Show page tips again
            </Button>
            <Button variant="primary" size="sm" onPress={openTour}>
              <PlayCircle className="size-4" /> Take the tour
            </Button>
          </>
        }
      />

      <Section title="How the workshop flows" description="Click a box to read its guide. Solid arrows are the main path; dashed arrows are the loops — offcuts back to stock, damaged rentals back to repair." className="mb-6">
        <ProcessOverview onOpen={goTopic} />
      </Section>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <Section title="Your first day" description="Starting from empty data, in this order.">
          <ol className="flex flex-col divide-y divide-[var(--rule)]">
            {FIRST_DAY.map((s, i) => (
              <li key={s.title}>
                <button type="button" onClick={() => navigate(s.to)} className="flex w-full items-start gap-3 py-2.5 text-left hover:bg-default/40">
                  <span className="num mt-0.5 text-[12px] text-muted">{String(i + 1).padStart(2, "0")}</span>
                  <span className="flex-1">
                    <span className="block text-[13px] font-medium">{s.title}</span>
                    <span className="block text-[12px] text-muted">{s.body}</span>
                  </span>
                  <ChevronRight className="mt-1 size-4 text-muted" />
                </button>
              </li>
            ))}
          </ol>
        </Section>
        <Section title="How a job cost is made" description="What Serat calculates when a work order is completed.">
          <FlowSteps
            compact
            steps={[
              { label: "Materials issued", sub: "lot unit costs", kind: "material" },
              { label: "− offcuts returned", sub: "their share goes back to stock", kind: "offcut" },
              { label: "− waste sold", sub: "salvage value", kind: "offcut" },
              { label: "+ labour", sub: "hours × rate or piece rate", kind: "process" },
              { label: "+ overhead & other", sub: "per labour hour", kind: "process" },
              { label: "= job cost ÷ units", sub: "unit cost of the new lot", kind: "money" },
            ]}
            note="Example: Rp 4,200,000 timber issued, Rp 600,000 returned as offcuts, Rp 50,000 sawdust sold, Rp 900,000 labour, Rp 300,000 overhead → Rp 4,750,000 for 6 chairs = Rp 791,667 per chair."
          />
        </Section>
      </div>

      <section aria-labelledby="guides" className="mb-6">
        <h2 id="guides" className="mb-3 text-base font-semibold">
          Guides for each page
        </h2>
        <div className="flex flex-col gap-5">
          {GROUPS.map((g) => (
            <div key={g}>
              <p className="eyebrow mb-1.5">{g}</p>
              <ul className="divide-y divide-[var(--rule)] rounded-md border border-[var(--rule)] bg-surface">
                {HELP_TOPICS.filter((t) => t.group === g).map((t) => {
                  const isOpen = open === t.id;
                  return (
                    <li key={t.id} id={`topic-${t.id}`} className="scroll-mt-20">
                      <button type="button" aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : t.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-default/40">
                        <ChevronRight className={`size-4 shrink-0 text-muted transition-transform ${isOpen ? "rotate-90" : ""}`} />
                        <span className="flex-1">
                          <span className="block text-[14px] font-medium">{t.title}</span>
                          {!isOpen && <span className="block truncate text-[12px] text-muted">{t.summary}</span>}
                        </span>
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-4 sm:pl-11">
                          <TopicGuide topic={t} />
                          {t.routes[0] && !t.routes[0].includes(":") && (
                            <Button className="mt-4" size="sm" variant="tertiary" onPress={() => navigate(t.routes[0]!)}>
                              Go to {t.title}
                            </Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Glossary" description={`${GLOSSARY.length} words used across ${BRAND.name}.`}>
          <label className="mb-3 flex h-8 items-center gap-2 rounded-sm border border-[var(--rule)] px-2.5 text-[13px]">
            <Search className="size-3.5 text-muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search terms…" aria-label="Search the glossary" className="flex-1 bg-transparent outline-none" />
          </label>
          {terms.length ? (
            <dl className="flex flex-col divide-y divide-[var(--rule)]">
              {terms.map((t) => (
                <div key={t.term} className="py-2 text-[13px]">
                  <dt className="font-medium">{t.term}</dt>
                  <dd className="text-foreground/80">{t.meaning}</dd>
                  {t.where && <dd className="text-[12px] text-muted">Where: {t.where}</dd>}
                </div>
              ))}
            </dl>
          ) : (
            <p className="text-[13px] text-muted">No term matches “{q}”.</p>
          )}
        </Section>
        <Section title="Common questions">
          <div className="flex flex-col divide-y divide-[var(--rule)]">
            {FAQ.map((f) => (
              <details key={f.q} className="group py-2.5 text-[13px]">
                <summary className="cursor-pointer font-medium marker:text-muted">{f.q}</summary>
                <p className="mt-1.5 text-foreground/80">{f.a}</p>
              </details>
            ))}
          </div>
        </Section>
      </div>
    </>
  );
}
