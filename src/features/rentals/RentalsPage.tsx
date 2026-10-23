import { Button, Tabs, type Key } from "@heroui/react";
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
  const t = today();

  const rows = useMemo(() => {
    return [...db.rentals]
      .filter((r) => (filter === "aktif" ? r.status === "dipesan" || r.status === "berjalan" : filter === "selesai" ? r.status === "selesai" || r.status === "batal" : true))
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [db.rentals, filter]);

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
    { key: "code", header: "Code", isRowHeader: true, className: "whitespace-nowrap", cell: (r) => <span className="font-medium">{r.code}</span> },
    {
      key: "proj",
      header: "Event / project",
      cell: (r) => (
        <div className="min-w-48">
          <p className="font-medium">{r.project}</p>
          <p className="text-xs text-muted">
            {partnerName(r.customerId)} · {r.lines.map((l) => `${l.qty}× ${item(l.itemId)?.name ?? "?"}`).join(", ")}
          </p>
        </div>
      ),
    },
    { key: "kind", header: "Type", cell: (r) => <StatusChip tone={r.kind === "sewa" ? "accent" : "default"}>{r.kind === "sewa" ? "Rental" : "Loan"}</StatusChip> },
    {
      key: "dates",
      header: "Period",
      className: "whitespace-nowrap",
      cell: (r) => {
        const late = r.status === "berjalan" && r.endDate < t && outstandingCheckouts(r).length > 0;
        return (
          <span className={late ? "font-medium text-danger" : ""}>
            {formatDate(r.startDate)} – {formatDate(r.endDate)}
            {late && " · late"}
          </span>
        );
      },
    },
    { key: "total", header: "Charges", align: "end", cell: (r) => (r.kind === "sewa" ? formatIDR(rentalCharges(r, t).total) : <span className="text-muted">—</span>) },
    { key: "status", header: "Status", cell: (r) => <StatusChip tone={RENTAL_STATUS[r.status].tone}>{RENTAL_STATUS[r.status].label}</StatusChip> },
  ];

  return (
    <>
      <PageHeader
        title="Rental & loan"
        description="Events, film shoots, photo shoots, partners. Date clashes are checked automatically."
        actions={
          <Button onPress={() => navigate("/rentals/new")}>
            <Plus className="size-4" /> New booking
          </Button>
        }
      />

      {grid.rows.length > 0 && (
        <Section title={`Availability for the next ${DAYS} days`} description="Number = units still free to book that day." className="mb-6" bodyClassName="overflow-x-auto">
          <table className="w-full min-w-[720px] border-separate border-spacing-1 text-xs">
            <thead>
              <tr>
                <th className="text-left font-medium text-muted">Product</th>
                {grid.days.map((d) => (
                  <th key={d} className="w-9 text-center font-medium text-muted">
                    <div>{new Date(`${d}T00:00:00`).toLocaleDateString("en-GB", { weekday: "narrow" })}</div>
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
                      title={`${c.available} of ${c.owned} units available`}
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
            Total rentable units: {sum(grid.rows.map((r) => r.cells[0]?.owned ?? 0))}. Damaged units are not counted until repaired.
          </p>
        </Section>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={filter} onSelectionChange={(k: Key) => setFilter(k as Filter)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Filter status">
              <Tabs.Tab id="aktif">
                Active
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="selesai">
                History
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="semua">
                All
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <DataTable
        toolbar searchText={(r) => `${r.code} ${r.project} ${partnerName(r.customerId)}`}
        label="Rental list"
        columns={columns}
        rows={rows}
        onRowAction={(r) => navigate(`/rentals/${r.id}`)}
        empty={<EmptyBlock icon={<CalendarClock className="size-5" />} title="No rentals" description="Units for events, film shoots or partner showrooms. A loan is a rental at zero rate." action={<Button onPress={() => navigate("/rentals/new")}>New booking</Button>} />}
      />
    </>
  );
}
