import { useMemo } from "react";
import type { ID, Item, ItemKind, PartnerRole } from "@/domain";
import { formatQty } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";
import { SearchPicker } from "./fields";

export function ItemPicker({
  value,
  onChange,
  kind,
  label = kind === "product" ? "Produk" : kind === "material" ? "Material" : "Item",
  exclude,
  filter,
  isRequired,
  className,
  "aria-label": ariaLabel,
}: {
  value: ID | null;
  onChange: (id: ID | null) => void;
  kind?: ItemKind;
  label?: string;
  exclude?: ID[];
  /** Extra predicate, e.g. only producible items. */
  filter?: (item: Item) => boolean;
  isRequired?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const db = useDb();
  const { stock } = useLookups();
  const options = useMemo(
    () =>
      db.items
        .filter((i) => (!kind || i.kind === kind) && (!i.archived || i.id === value) && !exclude?.includes(i.id) && (!filter || filter(i)))
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((i) => {
          const s = stock.get(i.id);
          return {
            id: i.id,
            label: i.name,
            description: `${i.sku} · stok ${formatQty(s?.available ?? 0, i.uom)}${s?.remnant ? ` (sisa ${formatQty(s.remnant, i.uom)})` : ""}`,
          };
        }),
    [db.items, kind, stock, value, exclude, filter],
  );
  return (
    <SearchPicker
      label={ariaLabel ? undefined : label}
      aria-label={ariaLabel}
      value={value}
      onChange={onChange}
      options={options}
      placeholder="Ketik nama atau kode…"
      isRequired={isRequired}
      className={className}
    />
  );
}

export function PartnerPicker({
  value,
  onChange,
  role,
  label = role === "customer" ? "Pelanggan" : "Pemasok",
}: {
  value: ID | null;
  onChange: (id: ID | null) => void;
  role: PartnerRole;
  label?: string;
}) {
  const db = useDb();
  const options = useMemo(
    () =>
      db.partners
        .filter((p) => p.role === role)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((p) => ({ id: p.id, label: p.name, description: [p.contact, p.country ?? p.address].filter(Boolean).join(" · ") })),
    [db.partners, role],
  );
  return <SearchPicker label={label} value={value} onChange={onChange} options={options} placeholder="Cari nama…" />;
}
