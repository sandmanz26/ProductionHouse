import { Modal } from "@heroui/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { EPS } from "@/domain";
import { formatQty } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";

interface Entry {
  id: string;
  group: string;
  label: string;
  hint?: string;
  to: string;
  /** Lower-cased text used for matching. */
  haystack: string;
}

const PAGES: { label: string; to: string; keywords?: string }[] = [
  { label: "Beranda", to: "/" },
  { label: "Produksi — daftar perintah kerja", to: "/produksi", keywords: "wo pk" },
  { label: "Produksi — papan per tahap", to: "/produksi/papan", keywords: "kanban wip" },
  { label: "Perintah kerja baru", to: "/produksi/baru" },
  { label: "Pembelian", to: "/pembelian" },
  { label: "Pembelian baru", to: "/pembelian/baru" },
  { label: "Penjualan & ekspor", to: "/penjualan" },
  { label: "Order penjualan baru", to: "/penjualan/baru" },
  { label: "Sewa & pinjam", to: "/sewa" },
  { label: "Booking sewa baru", to: "/sewa/baru" },
  { label: "Keuangan — piutang & utang", to: "/keuangan", keywords: "bayar dp tagihan" },
  { label: "Stok material", to: "/stok/material" },
  { label: "Sisa material", to: "/stok/sisa", keywords: "remnant potongan" },
  { label: "Stok produk", to: "/stok/produk" },
  { label: "Mutasi stok", to: "/stok/mutasi", keywords: "ledger kartu stok" },
  { label: "Laporan HPP", to: "/laporan" },
  { label: "Produk & material", to: "/master/item", keywords: "bom resep" },
  { label: "Pelanggan & pemasok", to: "/master/relasi" },
  { label: "Pengaturan", to: "/pengaturan", keywords: "backup cadangan" },
];

function score(haystack: string, terms: string[]) {
  let s = 0;
  for (const t of terms) {
    const i = haystack.indexOf(t);
    if (i < 0) return -1;
    s += i === 0 ? 3 : haystack[i - 1] === " " ? 2 : 1;
  }
  return s;
}

/** Global jump-to: Ctrl/⌘ K. Finds pages, documents, items and lots by code or name. */
export function CommandPalette({ isOpen, onOpenChange }: { isOpen: boolean; onOpenChange: (o: boolean) => void }) {
  return (
    <Modal.Backdrop isOpen={isOpen} onOpenChange={onOpenChange}>
      <Modal.Container size="md" placement="top">
        <Modal.Dialog aria-label="Cari">{isOpen && <PaletteBody onClose={() => onOpenChange(false)} />}</Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const db = useDb();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const entries = useMemo<Entry[]>(() => {
    const e: Entry[] = PAGES.map((p) => ({ id: `p:${p.to}`, group: "Halaman", label: p.label, to: p.to, haystack: `${p.label} ${p.keywords ?? ""}`.toLowerCase() }));
    for (const w of db.workOrders) e.push({ id: w.id, group: "Perintah kerja", label: `${w.code} · ${w.title}`, hint: w.status, to: `/produksi/${w.id}`, haystack: `${w.code} ${w.title}`.toLowerCase() });
    for (const s of db.sales) {
      const who = partnerName(s.customerId);
      e.push({ id: s.id, group: "Penjualan", label: `${s.code} · ${who}`, hint: s.status, to: `/penjualan/${s.id}`, haystack: `${s.code} ${who}`.toLowerCase() });
    }
    for (const r of db.rentals) e.push({ id: r.id, group: "Sewa", label: `${r.code} · ${r.project}`, hint: r.status, to: `/sewa/${r.id}`, haystack: `${r.code} ${r.project} ${partnerName(r.customerId)}`.toLowerCase() });
    for (const p of db.purchases) {
      const who = partnerName(p.supplierId);
      e.push({ id: p.id, group: "Pembelian", label: `${p.code} · ${who}`, hint: p.status, to: `/pembelian/${p.id}`, haystack: `${p.code} ${who} ${p.invoiceNo ?? ""}`.toLowerCase() });
    }
    for (const i of db.items) e.push({ id: i.id, group: "Item", label: i.name, hint: i.sku, to: `/stok/item/${i.id}`, haystack: `${i.sku} ${i.name}`.toLowerCase() });
    for (const l of db.lots) {
      if (l.qty <= EPS) continue;
      const it = item(l.itemId);
      e.push({ id: l.id, group: "Lot", label: `${l.code} · ${it?.name ?? ""}`, hint: formatQty(l.qty, it?.uom), to: `/stok/item/${l.itemId}`, haystack: `${l.code} ${it?.name ?? ""}`.toLowerCase() });
    }
    return e;
  }, [db, item, partnerName]);

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return entries.filter((e) => e.group === "Halaman").slice(0, 10);
    return entries
      .map((e) => ({ e, s: score(e.haystack, terms) }))
      .filter((x) => x.s >= 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 30)
      .map((x) => x.e);
  }, [entries, q]);

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const go = (e: Entry | undefined) => {
    if (!e) return;
    onClose();
    navigate(e.to);
  };

  return (
    <div className="flex max-h-[70vh] flex-col">
      <div className="flex items-center gap-2 border-b border-[var(--rule)] px-1 pb-3">
        <Search className="size-4 text-muted" aria-hidden />
        <input
          autoFocus
          value={q}
          onChange={(ev) => {
            setQ(ev.target.value);
            setActive(0);
          }}
          onKeyDown={(ev) => {
            if (ev.key === "ArrowDown") {
              ev.preventDefault();
              setActive((a) => Math.min(results.length - 1, a + 1));
            } else if (ev.key === "ArrowUp") {
              ev.preventDefault();
              setActive((a) => Math.max(0, a - 1));
            } else if (ev.key === "Enter") {
              ev.preventDefault();
              go(results[active]);
            }
          }}
          placeholder="Ketik kode (PK-0005, SO-0002, LOT-0011), nama barang, klien…"
          aria-label="Cari"
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active]!.id}` : undefined}
          className="w-full bg-transparent py-1 text-sm outline-none"
        />
        <kbd className="num rounded-sm border border-[var(--rule)] px-1.5 text-[11px] text-muted">Esc</kbd>
      </div>
      <ul ref={listRef} id="palette-results" role="listbox" className="mt-2 overflow-y-auto">
        {results.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">Tidak ada yang cocok.</li>}
        {results.map((e, i) => {
          const header = i === 0 || results[i - 1]!.group !== e.group ? e.group : null;
          return (
            <li key={`${e.group}-${e.id}`} role="presentation">
              {header && <p className="eyebrow px-2 pt-2 pb-1">{header}</p>}
              <div
                id={`palette-${e.id}`}
                role="option"
                aria-selected={i === active}
                data-index={i}
                onMouseMove={() => setActive(i)}
                onClick={() => go(e)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm ${i === active ? "bg-accent-soft text-accent-soft-foreground" : ""}`}
              >
                <span className="truncate">{e.label}</span>
                {e.hint && <span className="num shrink-0 text-xs text-muted">{e.hint}</span>}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
