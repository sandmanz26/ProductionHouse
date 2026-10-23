import { Button } from "@heroui/react";
import { useId, useState } from "react";
import { BRAND } from "@/brand/brand";
import { GrainRings, LogoMark } from "@/brand/Logo";
import { TextInput } from "@/components/fields";
import { useDbStore } from "@/store/db-store";

const PROOF = [
  {
    n: "01",
    title: "Offcuts are counted, not binned",
    body: "Usable offcuts go into stock at their own price and are suggested first on the next work order.",
  },
  {
    n: "02",
    title: "One ledger for export, supply and rental",
    body: "Proforma & packing list, down payment and final payment, rental hand-over and take-back down to the late fee.",
  },
  {
    n: "03",
    title: "Data stays on this device",
    body: "No server, no account. Back up to a single file at any time.",
  },
];

type Choice = "demo" | "fresh";

/** First visit: the brand's one full-bleed moment, then straight to work. */
export function WelcomePage() {
  const startDemo = useDbStore((s) => s.startDemo);
  const startFresh = useDbStore((s) => s.startFresh);
  const [choice, setChoice] = useState<Choice>("demo");
  const [company, setCompany] = useState("");
  const name = useId();

  const options: { id: Choice; title: string; body: string }[] = [
    {
      id: "demo",
      title: "Sample workshop",
      body: "Sekar Kayu, Jepara — teak chairs in production, offcut boards in stock, a container to the Netherlands, and chairs out on rent for a film shoot.",
    },
    { id: "fresh", title: "My workshop", body: "An empty workbook. Enter your business name, then add your own materials and products." },
  ];

  const canStart = choice === "demo" || company.trim().length > 1;
  const start = () => (choice === "demo" ? startDemo() : startFresh(company));

  return (
    <div className="grid min-h-dvh bg-background text-foreground lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <section className="relative flex flex-col overflow-hidden bg-arang px-6 py-8 text-kertas sm:px-10 lg:px-14 lg:py-12">
        <GrainRings className="pointer-events-none absolute -right-40 -bottom-48 w-[760px] text-serbuk opacity-[0.13] lg:-right-24" />
        <div className="relative flex items-center gap-2">
          <LogoMark className="size-7 text-serbuk" />
          <span className="font-display text-[22px] leading-none font-semibold tracking-[-0.02em]">{BRAND.name.toLowerCase()}</span>
        </div>

        <div className="relative mt-14 max-w-xl lg:mt-auto">
          <p className="text-xs font-semibold tracking-[0.08em] text-serbuk uppercase">{BRAND.descriptor}</p>
          <h1 className="mt-3 font-display text-[40px] leading-[1.05] font-semibold tracking-[-0.025em] sm:text-[52px]">{BRAND.line}</h1>
          <p className="mt-5 max-w-lg text-[15px] leading-relaxed text-kertas/75">{BRAND.pitch}</p>
        </div>

        <ol className="relative mt-10 grid max-w-xl gap-5 sm:grid-cols-3 sm:gap-6 lg:mt-14">
          {PROOF.map((p) => (
            <li key={p.n} className="border-t border-kertas/20 pt-3">
              <span className="num text-xs text-serbuk">{p.n}</span>
              <p className="mt-1 text-sm font-medium">{p.title}</p>
              <p className="mt-1 text-xs leading-relaxed text-kertas/60">{p.body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col justify-center px-6 py-10 sm:px-10 lg:px-16">
        <div className="mx-auto w-full max-w-md">
          <p className="eyebrow">Start</p>
          <h2 className="mt-1 font-display text-[26px] leading-tight font-semibold tracking-[-0.015em]">Open a workbook</h2>
          <p className="mt-1.5 text-[13px] text-muted">Pick one. You can switch at any time from Settings.</p>

          <div role="radiogroup" aria-label="Choose a workbook" className="mt-6 flex flex-col gap-2">
            {options.map((o) => {
              const active = choice === o.id;
              return (
                <label
                  key={o.id}
                  className={`flex cursor-pointer gap-3 rounded-sm border px-4 py-3.5 transition-colors ${
                    active ? "border-accent bg-surface" : "border-[var(--rule)] hover:border-[var(--ink-soft)]"
                  }`}
                >
                  <input
                    type="radio"
                    name={name}
                    value={o.id}
                    checked={active}
                    onChange={() => setChoice(o.id)}
                    className="mt-1 size-3.5 shrink-0 accent-[var(--accent)]"
                  />
                  <span>
                    <span className="block text-sm font-medium">{o.title}</span>
                    <span className="mt-0.5 block text-[13px] leading-relaxed text-muted">{o.body}</span>
                  </span>
                </label>
              );
            })}
          </div>

          {choice === "fresh" && (
            <div className="mt-4">
              <TextInput label="Business name" value={company} onChange={setCompany} placeholder="e.g. CV Tunas Jati" isRequired autoFocus />
            </div>
          )}

          <Button className="mt-6 w-full" size="lg" isDisabled={!canStart} onPress={start}>
            {choice === "demo" ? "Enter the sample workshop" : "Open a new workbook"}
          </Button>
          <p className="mt-4 text-xs text-muted">
            {BRAND.name} {BRAND.version} · works offline once opened · data is not sent anywhere
          </p>
        </div>
      </section>
    </div>
  );
}
