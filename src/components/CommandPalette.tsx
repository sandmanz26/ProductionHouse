import { Modal } from "@heroui/react";
import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { EPS } from "@/domain";
import { formatQty } from "@/lib/format";
import { PURCHASE_STATUS, RENTAL_STATUS, SALES_STATUS, WO_STATUS } from "@/lib/labels";
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
  { label: "Home", to: "/" },
  { label: "Production — work order list", to: "/work-orders", keywords: "wo jobs" },
  { label: "Production — board by stage", to: "/board", keywords: "kanban wip" },
  { label: "New work order", to: "/work-orders/new" },
  { label: "Purchasing", to: "/purchases", keywords: "po" },
  { label: "New purchase order", to: "/purchases/new" },
  { label: "Sales & export", to: "/sales", keywords: "so" },
  { label: "New sales order", to: "/sales/new" },
  { label: "Rental & loan", to: "/rentals", keywords: "rn" },
  { label: "New rental booking", to: "/rentals/new" },
  { label: "Finance — receivables & payables", to: "/finance", keywords: "pay down payment invoice" },
  { label: "Materials stock", to: "/stock/materials" },
  { label: "Offcuts", to: "/stock/offcuts", keywords: "remnant leftover" },
  { label: "Products stock", to: "/stock/products" },
  { label: "Stock movements", to: "/stock/movements", keywords: "ledger stock card" },
  { label: "Cost report", to: "/reports", keywords: "job cost cogs" },
  { label: "Products & materials", to: "/items", keywords: "bom recipe" },
  { label: "Customers & suppliers", to: "/contacts", keywords: "contacts" },
  { label: "Settings", to: "/settings", keywords: "backup" },
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
        <Modal.Dialog aria-label="Search">{isOpen && <PaletteBody onClose={() => onOpenChange(false)} />}</Modal.Dialog>
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
    const e: Entry[] = PAGES.map((p) => ({ id: `p:${p.to}`, group: "Pages", label: p.label, to: p.to, haystack: `${p.label} ${p.keywords ?? ""}`.toLowerCase() }));
    for (const w of db.workOrders) e.push({ id: w.id, group: "Work orders", label: `${w.code} · ${w.title}`, hint: WO_STATUS[w.status].label, to: `/work-orders/${w.id}`, haystack: `${w.code} ${w.title}`.toLowerCase() });
    for (const s of db.sales) {
      const who = partnerName(s.customerId);
      e.push({ id: s.id, group: "Sales", label: `${s.code} · ${who}`, hint: SALES_STATUS[s.status].label, to: `/sales/${s.id}`, haystack: `${s.code} ${who}`.toLowerCase() });
    }
    for (const r of db.rentals) e.push({ id: r.id, group: "Rentals", label: `${r.code} · ${r.project}`, hint: RENTAL_STATUS[r.status].label, to: `/rentals/${r.id}`, haystack: `${r.code} ${r.project} ${partnerName(r.customerId)}`.toLowerCase() });
    for (const p of db.purchases) {
      const who = partnerName(p.supplierId);
      e.push({ id: p.id, group: "Purchases", label: `${p.code} · ${who}`, hint: PURCHASE_STATUS[p.status].label, to: `/purchases/${p.id}`, haystack: `${p.code} ${who} ${p.invoiceNo ?? ""}`.toLowerCase() });
    }
    for (const i of db.items) e.push({ id: i.id, group: "Items", label: i.name, hint: i.sku, to: `/stock/items/${i.id}`, haystack: `${i.sku} ${i.name}`.toLowerCase() });
    for (const l of db.lots) {
      if (l.qty <= EPS) continue;
      const it = item(l.itemId);
      e.push({ id: l.id, group: "Lots", label: `${l.code} · ${it?.name ?? ""}`, hint: formatQty(l.qty, it?.uom), to: `/stock/items/${l.itemId}`, haystack: `${l.code} ${it?.name ?? ""}`.toLowerCase() });
    }
    return e;
  }, [db, item, partnerName]);

  const results = useMemo(() => {
    const terms = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return entries.filter((e) => e.group === "Pages").slice(0, 10);
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
          placeholder="Type a code (WO-0005, SO-0002, LOT-0011), item name, client…"
          aria-label="Search"
          role="combobox"
          aria-expanded
          aria-controls="palette-results"
          aria-activedescendant={results[active] ? `palette-${results[active]!.id}` : undefined}
          className="w-full bg-transparent py-1 text-sm outline-none"
        />
        <kbd className="num rounded-sm border border-[var(--rule)] px-1.5 text-[11px] text-muted">Esc</kbd>
      </div>
      <ul ref={listRef} id="palette-results" role="listbox" className="mt-2 overflow-y-auto">
        {results.length === 0 && <li className="px-2 py-6 text-center text-sm text-muted">Nothing matches.</li>}
        {results.map((e, i) => {
          const header = i === 0 || results[i - 1]!.group !== e.group ? e.group : null;
          return (
            <li key={`${e.group}-${e.id}`} role="presentation">
              {header && <p className="caption-label px-2 pt-2 pb-1">{header}</p>}
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
