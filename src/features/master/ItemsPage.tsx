import { Button, Tabs, type Key } from "@heroui/react";
import { Package, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { standardProductCost, type Item, type ItemKind } from "@/domain";
import { SwitchInput } from "@/components/fields";
import { DataTable, EmptyBlock, PageHeader, StatusChip, type Column } from "@/components/ui";
import { formatIDR, formatQty } from "@/lib/format";
import { categoryLabel } from "@/lib/labels";
import { useDb, useLookups } from "@/store/db-store";

export default function ItemsPage() {
  const db = useDb();
  const { stock } = useLookups();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const kind: ItemKind = params.get("type") === "material" ? "material" : "product";
  const [showArchived, setShowArchived] = useState(false);

  const rows = useMemo(() => {
    return db.items
      .filter((i) => i.kind === kind && (showArchived || !i.archived))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.items, kind, showArchived]);

  const nameCol: Column<Item> = {
    key: "name",
    header: kind === "product" ? "Product" : "Material",
    isRowHeader: true,
    cell: (i) => (
      <div className="min-w-44">
        <p className="font-medium">
          {i.name} {i.archived && <StatusChip tone="default">Archived</StatusChip>}
        </p>
        <p className="text-xs text-muted">
          {i.sku} · {categoryLabel(i.category)}
        </p>
      </div>
    ),
  };
  const columns: Column<Item>[] =
    kind === "product"
      ? [
          nameCol,
          { key: "bom", header: "BOM", align: "end", cell: (i) => `${i.bom?.length ?? 0} materials` },
          { key: "labor", header: "Labour hours", align: "end", cell: (i) => formatQty(i.laborHours ?? 0) },
          { key: "std", header: "Standard cost", align: "end", cell: (i) => formatIDR(standardProductCost(db, i)) },
          { key: "price", header: "Sale price", align: "end", cell: (i) => (i.salePrice ? formatIDR(i.salePrice) : "—") },
          { key: "rent", header: "Rent/day", align: "end", cell: (i) => (i.rentalRatePerDay ? formatIDR(i.rentalRatePerDay) : "—") },
          { key: "stock", header: "Stock", align: "end", cell: (i) => stock.get(i.id)?.total ?? 0 },
        ]
      : [
          nameCol,
          { key: "uom", header: "Unit", cell: (i) => i.uom },
          { key: "std", header: "Last price", align: "end", cell: (i) => formatIDR(i.standardCost) },
          { key: "rem", header: "Track offcuts", cell: (i) => (i.trackRemnant ? <StatusChip tone="success">Yes</StatusChip> : <span className="text-muted">No</span>) },
          { key: "rop", header: "Reorder point", align: "end", cell: (i) => (i.reorderPoint ? formatQty(i.reorderPoint, i.uom) : "—") },
          { key: "stock", header: "Stock", align: "end", cell: (i) => formatQty(stock.get(i.id)?.available ?? 0, i.uom) },
        ];

  return (
    <>
      <PageHeader
        title="Products & materials"
        description="Bill of materials (BOM), stage route, prices, rental rates, export data."
        actions={
          <Button onPress={() => navigate(`/items/new?type=${kind}`)}>
            <Plus className="size-4" /> {kind === "product" ? "New product" : "New material"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={kind} onSelectionChange={(k: Key) => setParams({ jenis: String(k) }, { replace: true })}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Item type">
              <Tabs.Tab id="product">
                Products
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="material">
                Materials
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <SwitchInput isSelected={showArchived} onChange={setShowArchived} label="Show archived" />
        </div>
      </div>
      <DataTable
        toolbar searchText={(i) => `${i.name} ${i.sku}`}
        label="Item list"
        columns={columns}
        rows={rows}
        dependencies={[kind, stock]}
        onRowAction={(i) => navigate(`/items/${i.id}`)}
        empty={<EmptyBlock icon={<Package className="size-5" />} title={kind === "material" ? "No materials yet" : "No products yet"} description={kind === "material" ? "Start with the materials you buy most often: timber, boards, foam, hardware." : "A product carries its bill of materials, standard labour hours, sale price and rental rate."} action={<Button onPress={() => navigate(`/items/new?type=${kind}`)}>Add</Button>} />}
      />
    </>
  );
}
