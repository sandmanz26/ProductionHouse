import { Button, Tabs, type Key } from "@heroui/react";
import { Plus, Trash2, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { createPartner, deletePartner, updatePartner, type Partner, type PartnerInput, type PartnerRole } from "@/domain";
import { TextAreaInput, TextInput } from "@/components/fields";
import { ConfirmButton, DataTable, EmptyBlock, PageHeader, TaskModal, type Column } from "@/components/ui";
import { useDb, useRun } from "@/store/db-store";

export default function PartnersPage() {
  const db = useDb();
  const [role, setRole] = useState<PartnerRole>("customer");
  const [editing, setEditing] = useState<Partner | "new" | null>(null);

  const usage = useMemo(() => {
    const m = new Map<string, number>();
    const add = (id?: string) => id && m.set(id, (m.get(id) ?? 0) + 1);
    db.sales.forEach((s) => add(s.customerId));
    db.rentals.forEach((r) => add(r.customerId));
    db.purchases.forEach((p) => add(p.supplierId));
    return m;
  }, [db]);

  const rows = useMemo(() => {
    return db.partners
      .filter((p) => p.role === role)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db.partners, role]);

  const columns: Column<Partner>[] = [
    {
      key: "name",
      header: "Name",
      isRowHeader: true,
      cell: (p) => (
        <div className="min-w-44">
          <p className="font-medium">{p.name}</p>
          {p.contact && <p className="text-xs text-muted">{p.contact}</p>}
        </div>
      ),
    },
    { key: "phone", header: "Phone", className: "whitespace-nowrap", cell: (p) => p.phone || "—" },
    { key: "email", header: "Email", cell: (p) => p.email || "—" },
    { key: "addr", header: "Address", cell: (p) => <span className="line-clamp-2 text-sm">{[p.address, p.country].filter(Boolean).join(", ") || "—"}</span> },
    { key: "tx", header: "Transactions", align: "end", cell: (p) => usage.get(p.id) ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Customers & suppliers"
        actions={
          <Button onPress={() => setEditing("new")}>
            <Plus className="size-4" /> {role === "customer" ? "New customer" : "New supplier"}
          </Button>
        }
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs selectedKey={role} onSelectionChange={(k: Key) => setRole(k as PartnerRole)}>
          <Tabs.ListContainer>
            <Tabs.List aria-label="Contact type">
              <Tabs.Tab id="customer">
                Customers
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="supplier">
                Suppliers
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <DataTable
        toolbar searchText={(p) => [p.name, p.contact, p.phone, p.email, p.address, p.country].filter(Boolean).join(" ")}
        label="Contact list"
        columns={columns}
        rows={rows}
        dependencies={[usage]}
        onRowAction={(p) => setEditing(p)}
        empty={<EmptyBlock icon={<Users className="size-5" />} title="No contacts yet" description="Timber suppliers, hardware shops, export buyers, renters — all recorded here." action={<Button onPress={() => setEditing("new")}>Add</Button>} />}
      />
      <TaskModal
        isOpen={editing !== null}
        onOpenChange={(o) => !o && setEditing(null)}
        size="md"
        title={editing === "new" ? (role === "customer" ? "New customer" : "New supplier") : (editing?.name ?? "")}
      >
        {editing !== null && <PartnerForm key={editing === "new" ? "new" : editing.id} role={role} existing={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} used={editing !== "new" && (usage.get(editing.id) ?? 0) > 0} />}
      </TaskModal>
    </>
  );
}

function PartnerForm({ role, existing, onDone, used }: { role: PartnerRole; existing?: Partner; onDone: () => void; used: boolean }) {
  const run = useRun();
  const [v, setV] = useState<PartnerInput>(
    existing ? { ...existing } : { role, name: "", contact: "", phone: "", email: "", address: "", country: role === "customer" ? "Indonesia" : "", note: "" },
  );
  const set = (key: keyof PartnerInput) => (value: string) => setV({ ...v, [key]: value });
  return (
    <div className="flex flex-col gap-3">
      <TextInput label="Name" value={v.name} onChange={set("name")} isRequired autoFocus />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextInput label="Contact person" value={v.contact ?? ""} onChange={set("contact")} />
        <TextInput label="Phone" type="tel" value={v.phone ?? ""} onChange={set("phone")} />
        <TextInput label="Email" type="email" value={v.email ?? ""} onChange={set("email")} />
        <TextInput label="Country" value={v.country ?? ""} onChange={set("country")} />
      </div>
      <TextAreaInput label="Address" value={v.address ?? ""} onChange={set("address")} rows={2} />
      <TextAreaInput label="Note" value={v.note ?? ""} onChange={set("note")} rows={2} />
      <div className="mt-2 flex flex-wrap justify-between gap-2">
        {existing && !used ? (
          <ConfirmButton
            variant="danger-soft"
            danger
            title={`Delete ${existing.name}?`}
            confirmLabel="Delete"
            onConfirm={() => run((d) => deletePartner(d, existing.id), "Contact deleted") !== undefined && onDone()}
          >
            <Trash2 className="size-4" /> Delete
          </ConfirmButton>
        ) : (
          <span />
        )}
        <div className="flex gap-2">
          <Button variant="tertiary" onPress={onDone}>
            Cancel
          </Button>
          <Button
            isDisabled={!v.name.trim()}
            onPress={() => {
              const r = run((d) => (existing ? updatePartner(d, existing.id, v) : createPartner(d, v)), (p) => `${p.name} saved`);
              if (r) onDone();
            }}
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
