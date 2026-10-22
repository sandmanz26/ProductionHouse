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
      title: "Daftarkan material",
      body: "Kayu, papan, busa, hardware — dengan satuan stok dan satuan beli dari pemasok.",
      href: "/master/item/baru?jenis=material",
      cta: "Tambah material",
    },
    {
      done: db.items.some((i) => i.kind === "product" && (i.bom?.length ?? 0) > 0),
      title: "Buat produk dengan resep",
      body: "Kebutuhan bahan per unit dan jam kerja standar. Dari sini kekurangan bahan dihitung otomatis.",
      href: "/master/item/baru",
      cta: "Tambah produk",
    },
    {
      done: db.lots.length > 0,
      title: "Isi gudang",
      body: "Catat pembelian (ongkir ikut ke harga pokok) atau stok awal dari Stok Material.",
      href: "/pembelian/baru",
      cta: "Catat pembelian",
    },
    {
      done: db.workOrders.length > 0,
      title: "Buka perintah kerja pertama",
      body: "Ambil bahan per lot, tutup dengan hasil dan sisa — HPP terkunci di situ.",
      href: "/produksi/baru",
      cta: "Buat perintah kerja",
    },
  ];
  if (steps.every((s) => s.done)) return null;
  const next = steps.findIndex((s) => !s.done);
  return (
    <Section title="Langkah pertama" description={`${steps.filter((s) => s.done).length} dari ${steps.length} selesai`} bodyClassName="p-0">
      <ol className="divide-y divide-[var(--rule)]">
        {steps.map((s, i) => (
          <li key={s.title} className="flex gap-4 px-4 py-3.5">
            <span
              className={`num grid size-6 shrink-0 place-items-center rounded-sm border text-xs ${
                s.done ? "border-success text-success" : i === next ? "border-accent text-accent" : "border-[var(--rule)] text-muted"
              }`}
            >
              {s.done ? <Check className="size-3.5" aria-label="selesai" /> : String(i + 1).padStart(2, "0")}
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
