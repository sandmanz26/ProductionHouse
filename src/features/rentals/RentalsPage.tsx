import { Button, SearchField, Tabs, type Key } from "@heroui/react";
import { CalendarClock, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate } from "react-router";
import { addDays, availableForRange, outstandingCheckouts, rentalCharges, sum, today, type Rental } from "@/domain";
import { DataTable, EmptyBlock, PageHeader, Section, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatIDR } from "@/lib/format";
import { RENTAL_STATUS } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

type Filter = "aktif" | "selesai" | "semua";
const DAYS = 14;

export default function RentalsPage() {
  const db = useDb();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>("aktif");
  const [q, setQ] = useState("");
  const t = today();

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    return [...db.rentals]
      .filter((r) => (filter === "aktif" ? r.status === "dipesan" || r.status === "berjalan" : filter === "selesai" ? r.status === "selesai" || r.status === "batal" : true))
      .filter((r) => !term || r.code.toLowerCase().includes(term) || r.project.toLowerCase().includes(term) || partnerName(r.customerId).toLowerCase().includes(term))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [db.rentals, filter, q, partnerName]);

  const grid = useMemo(() => {
    const days = Array.from({ length: DAYS }, (_, i) => addDays(t, i));
    const products = db.items.filter((i) => i.kind === "product" && !i.archived && (i.rentalRatePerDay ?? 0) > 0);
    return {
      days,
      rows: products
        .map((p) => ({ item: p, cells: days.map((d) => availableForRange(db, p.id, d, d, { asOf: t })) }))
        .filter((r) => r.cells.some((c) => c.owned > 0)),
    };
  }, [db, t]);

  const columns: Column<Rental>[] = [
    { key: "code", header: "Kode", isRowHeader: true, className: "whitespace-nowrap", cell: (r) => <span className="font-medium">{r.code}</span> },
    {
      key: "proj",
      header: "Acara / proyek",
      cell: (r) => (
        <div className="min-w-48">
          <p className="font-medium">{r.project}</p>
          <p className="text-xs text-muted">
            {partnerName(r.customerId)} · {r.lines.map((l) => `${l.qty}× ${item(l.itemId)?.name ?? "?"}`).join(", ")}
          </p>
        </div>
      ),
    },
    { key: "kind", header: "Jenis", cell: (r) => <StatusChip tone={r.kind === "sewa" ? "accent" : "default"}>{r.kind === "sewa" ? "Sewa" : "Pinjam"}</StatusChip> },
    {
      key: "dates",
      header: "Periode",
      className: "whitespace-nowrap",
      cell: (r) => {
        const late = r.status === "berjalan" && r.endDate < t && outstandingCheckouts(r).length > 0;
        return (
          <span className={late ? "font-medium text-danger" : ""}>
            {formatDate(r.startDate)} – {formatDate(r.endDate)}
            {late && " · terlambat"}
          </span>
        );
      },
    },
    { key: "total", header: "Tagihan", align: "end", cell: (r) => (r.kind === "sewa" ? formatIDR(rentalCharges(r, t).total) : <span className="text-muted">—</span>) },
    { key: "status", header: "Status", cell: (r) => <StatusChip tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Sewa & Pinjam"
        description="Event, syuting, pemotretan, mitra. Bentrok tanggal dicek otomatis."
        actions={
          <Button onPress={() => navigate("/sewa/baru")}>
            <Plus className="size-4" /> Booking baru
          </Button>
        }
      />

      {grid.rows.length > 0 && (
        <Section title={`Ketersediaan ${DAYS} hari ke depan`} description="Angka = unit yang masih bisa dibooking per hari." className="mb-6" bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted">Produk</th>
                {grid.days.map((d) => (
                  <th key={d} className="w-9 text-center font-medium text-muted">
                    <div>{new Date(`${d}T00:00:00`).toLocaleDateString("id-ID", { weekday: "narrow" })}</div>
                    <div className="text-foreground">{Number(d.slice(8))}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.rows.map((r) => (
                <tr key={r.item.id}>
                  <td className="max-w-48 truncate pr-2 text-sm">{r.item.name}</td>
                  {r.cells.map((c, i) => (
                    <td
                      key={i}
                      title={`${c.available} dari ${c.owned} unit tersedia`}
                      className={`rounded-md py-1.5 text-center font-semibold tabular-nums ${
                        c.available <= 0 ? "bg-danger-soft text-danger-soft-foreground" : c.available < c.owned ? "bg-warning-soft text-warning-soft-foreground" : "bg-success-soft text-success-soft-foreground"
                      }`}
                    >
                      {c.available}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted">
            Total unit dapat disewakan: {sum(grid.rows.map((r) => r.cells[0]?.owned ?? 0))}. Unit rusak tidak dihitung sampai diperbaiki.
          </p>
        </Section>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="aktif">
                Aktif
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="selesai">
                Riwayat
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="semua">
                Semua
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <SearchField value={q} onChange={setQ} aria-label="Cari sewa" className="sm:w-72">
          <SearchField.Group>
            <SearchField.SearchIcon />
            <SearchField.Input placeholder="Cari kode, acara, klien…" />
            <SearchField.ClearButton />
          </SearchField.Group>
        </SearchField>
      </div>
      <DataTable
        label="Daftar sewa"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/sewa/${r.id}`)}
        empty={<EmptyBlock icon={<CalendarClock className="size-5" />} title="Tidak ada sewa" description="Unit untuk event, syuting, atau showroom mitra. Pinjam = sewa dengan tarif nol." action={<Button onPress={() => navigate("/sewa/baru")}>Booking baru</Button>} />}
      />
    </>
  );
}
