import { Button } from "@heroui/react";
import { useId, useState } from "react";
import { BRAND } from "@/brand/brand";
import { GrainRings, LogoMark } from "@/brand/Logo";
import { TextInput } from "@/components/fields";
import { useDbStore } from "@/store/db-store";

const PROOF = [
  {
    n: "01",
    title: "Sisa dihitung, bukan dibuang",
    body: "Potongan layak pakai masuk gudang dengan harganya sendiri dan disarankan lebih dulu di pekerjaan berikutnya.",
  },
  {
    n: "02",
    title: "Satu buku untuk ekspor, supply, dan sewa",
    body: "Proforma & packing list, DP dan pelunasan, serah-terima unit sewa sampai denda telat.",
  },
  {
    n: "03",
    title: "Data tinggal di perangkat ini",
    body: "Tanpa server, tanpa akun. Cadangkan ke satu file kapan saja.",
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
      title: "Bengkel contoh",
      body: "Sekar Kayu, Jepara — kursi jati dalam produksi, sisa papan di gudang, kontainer ke Belanda, dan kursi yang sedang disewa untuk syuting film.",
    },
    { id: "fresh", title: "Bengkel saya", body: "Buku kosong. Isi nama usaha, lalu tambah material dan produk Anda sendiri." },
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
          <p className="eyebrow">Mulai</p>
          <h2 className="mt-1 font-display text-[26px] leading-tight font-semibold tracking-[-0.015em]">Buka buku kerja</h2>
          <p className="mt-1.5 text-[13px] text-muted">Pilih salah satu. Anda bisa pindah kapan saja dari Pengaturan.</p>

          <div role="radiogroup" aria-label="Pilih buku kerja" className="mt-6 flex flex-col gap-2">
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
              <TextInput label="Nama usaha" value={company} onChange={setCompany} placeholder="mis. CV Tunas Jati" isRequired autoFocus />
            </div>
          )}

          <Button className="mt-6 w-full" size="lg" isDisabled={!canStart} onPress={start}>
            {choice === "demo" ? "Masuk ke bengkel contoh" : "Buka buku kerja baru"}
          </Button>
          <p className="mt-4 text-xs text-muted">
            {BRAND.name} {BRAND.version} · bekerja tanpa internet setelah dibuka · data tidak dikirim ke mana pun
          </p>
        </div>
      </section>
    </div>
  );
}
