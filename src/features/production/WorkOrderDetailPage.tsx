import { Button, Link } from "@heroui/react";
import { CheckCircle2, PackageCheck, Play, Plus, Recycle, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  cancelWorkOrder,
  isOpenWo,
  newId,
  requirements,
  startWorkOrder,
  sum,
  unissue,
  updateWorkOrder,
  type ExtraCost,
  type Issue,
  type Lot,
  type WorkOrder,
} from "@/domain";
import { NumberInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ConfirmButton, DataTable, EmptyBlock, KeyValue, PageHeader, Row, Section, StatusChip, type Column } from "@/components/ui";
import { formatDate, formatDateTime, formatDims, formatIDR, formatPct, formatQty } from "@/lib/format";
import { LOT_ORIGIN, PURCHASE_STATUS, WO_STATUS, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { CompleteDialog } from "./CompleteDialog";
import { CostBreakdown } from "./CostBreakdown";
import { IssueDialog, type IssueRequest } from "./IssueDialog";
import { RequirementsTable } from "./shared";

export default function WorkOrderDetailPage() {
  const { id } = useParams();
  const db = useDb();
  const run = useRun();
  const { item, partnerName } = useLookups();
  const navigate = useNavigate();
  const wo = db.workOrders.find((w) => w.id === id);
  const [issueReq, setIssueReq] = useState<IssueRequest | null>(null);
  const [completing, setCompleting] = useState(false);

  const reqs = useMemo(() => (wo ? requirements(db, wo) : []), [db, wo]);
  const lotsById = useMemo(() => new Map(db.lots.map((l) => [l.id, l])), [db.lots]);

  if (!wo) return <RecordNotFound what="Perintah kerja" back="/produksi" />;

  const open = isOpenWo(wo);
  const shortages = reqs.filter((r) => r.shortage > 0);
  const purchases = db.purchases.filter((p) => p.workOrderId === wo.id);
  const so = wo.salesOrderId ? db.sales.find((s) => s.id === wo.salesOrderId) : undefined;
  const issuedValue = sum(wo.issues.map((i) => i.qty * i.unitCost));

  const issueColumns: Column<Issue>[] = [
    {
      key: "lot",
      header: "Lot",
      isRowHeader: true,
      className: "whitespace-nowrap",
      cell: (i) => {
        const lot = lotsById.get(i.lotId);
        return (
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{lot?.code ?? "?"}</span>
            {lot?.isRemnant && <Recycle className="size-3.5 text-success" aria-label="Sisa" />}
          </div>
        );
      },
    },
    { key: "item", header: "Bahan", cell: (i) => item(i.itemId)?.name ?? "?" },
    { key: "qty", header: "Qty", align: "end", cell: (i) => formatQty(i.qty, item(i.itemId)?.uom) },
    { key: "cost", header: "Harga/satuan", align: "end", cell: (i) => formatIDR(i.unitCost) },
    { key: "value", header: "Nilai", align: "end", cell: (i) => formatIDR(i.qty * i.unitCost) },
    { key: "at", header: "Waktu", cell: (i) => <span className="text-muted">{formatDateTime(i.at)}</span> },
    ...(open
      ? [
          {
            key: "undo",
            header: "",
            align: "end" as const,
            cell: (i: Issue) => (
              <ConfirmButton
                size="sm"
                variant="ghost"
                title="Kembalikan bahan ke gudang?"
                description={`${formatQty(i.qty, item(i.itemId)?.uom)} ${item(i.itemId)?.name} dikembalikan ke lot asalnya dengan harga yang sama.`}
                confirmLabel="Kembalikan"
                onConfirm={() => run((d) => unissue(d, wo.id, i.id, i.qty), "Bahan dikembalikan ke gudang")}
              >
                <Undo2 className="size-4" />
              </ConfirmButton>
            ),
          },
        ]
      : []),
  ];

  const createdLots = (wo.createdLotIds ?? []).map((lid) => lotsById.get(lid)).filter((l): l is Lot => !!l);

  return (
    <>
      <PageHeader
        back="/produksi"
        title={wo.title}
        badge={
          <>
            <StatusChip tone={WO_TYPE[wo.type].tone}>{WO_TYPE[wo.type].label}</StatusChip>
            <StatusChip tone={WO_STATUS[wo.status].tone}>{WO_STATUS[wo.status].label}</StatusChip>
          </>
        }
        description={`${wo.code} · dibuat ${formatDate(wo.createdAt)}${wo.dueDate ? ` · target ${formatDate(wo.dueDate)}` : ""}`}
        actions={
          open && (
            <>
              <ConfirmButton
                variant="danger-soft"
                danger
                title={`Batalkan ${wo.code}?`}
                description="Semua bahan yang sudah diambil dikembalikan ke gudang, dan cadangan pembelian dilepas."
                confirmLabel="Batalkan pekerjaan"
                onConfirm={() => run((d) => cancelWorkOrder(d, wo.id), `${wo.code} dibatalkan`)}
              >
                Batalkan
              </ConfirmButton>
              {wo.status === "rencana" && (
                <Button variant="secondary" onPress={() => run((d) => startWorkOrder(d, wo.id), `${wo.code} mulai dikerjakan`)}>
                  <Play className="size-4" /> Mulai
                </Button>
              )}
              <Button variant="secondary" onPress={() => setIssueReq({ itemId: null, qty: 1 })}>
                <Plus className="size-4" /> Ambil bahan
              </Button>
              <Button onPress={() => setCompleting(true)} isDisabled={wo.issues.length === 0}>
                <PackageCheck className="size-4" /> Selesaikan
              </Button>
            </>
          )
        }
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          {open && (
            <Section
              title="Kebutuhan bahan"
              description="Dari BOM produk dan bahan tambahan. Klik Ambil untuk mengeluarkan bahan dari gudang."
              actions={
                shortages.length > 0 && (
                  <Button size="sm" onPress={() => navigate(`/pembelian/baru?wo=${wo.id}`)}>
                    <ShoppingCart className="size-4" /> Beli kekurangan
                  </Button>
                )
              }
              bodyClassName="p-0"
            >
              {reqs.length ? (
                <RequirementsTable reqs={reqs} onIssue={(r) => setIssueReq({ itemId: r.itemId, qty: r.remaining })} />
              ) : (
                <EmptyBlock title="Tidak ada kebutuhan standar" description="Ambil bahan secara bebas lewat tombol Ambil bahan." />
              )}
            </Section>
          )}

          <Section
            title="Bahan diambil"
            description={wo.issues.length ? `Total nilai ${formatIDR(issuedValue)}` : undefined}
            bodyClassName="p-0"
          >
            <DataTable
              label="Bahan diambil"
              columns={issueColumns}
              rows={wo.issues}
              dependencies={[lotsById, open]}
              empty={<EmptyBlock title="Belum ada bahan diambil" description="Bahan yang diambil dari gudang tercatat di sini beserta harga lotnya." />}
            />
          </Section>

          {wo.status === "selesai" && wo.cost && (
            <>
              <Section title="Pemakaian bahan vs standar" bodyClassName="p-0">
                <DataTable
                  label="Pemakaian bahan"
                  rows={wo.cost.lines.map((l) => ({ ...l, id: l.itemId }))}
                  columns={[
                    { key: "item", header: "Bahan", isRowHeader: true, cell: (l) => item(l.itemId)?.name ?? "?" },
                    { key: "issued", header: "Diambil", align: "end", cell: (l) => formatQty(l.issuedQty, item(l.itemId)?.uom) },
                    { key: "ret", header: "Kembali/sisa", align: "end", cell: (l) => formatQty(l.returnedQty, item(l.itemId)?.uom) },
                    { key: "scrap", header: "Limbah", align: "end", cell: (l) => formatQty(l.scrapQty, item(l.itemId)?.uom) },
                    { key: "std", header: "Standar BOM", align: "end", cell: (l) => (l.standardQty ? formatQty(l.standardQty, item(l.itemId)?.uom) : "—") },
                    {
                      key: "var",
                      header: "Selisih",
                      align: "end",
                      cell: (l) => {
                        if (!l.standardQty) return "—";
                        const v = (l.netQty - l.standardQty) / l.standardQty;
                        return <span className={v > 0.05 ? "text-danger" : v < -0.05 ? "text-success" : ""}>{v > 0 ? "+" : ""}{formatPct(v)}</span>;
                      },
                    },
                    { key: "net", header: "Nilai neto", align: "end", cell: (l) => formatIDR(l.netValue) },
                  ]}
                />
              </Section>
              <Section title="Barang masuk gudang dari pekerjaan ini" bodyClassName="p-0">
                <DataTable
                  label="Lot hasil"
                  rows={createdLots}
                  onRowAction={(l) => navigate(`/stok/item/${l.itemId}`)}
                  columns={[
                    { key: "code", header: "Lot", isRowHeader: true, className: "whitespace-nowrap", cell: (l) => <span className="font-medium">{l.code}</span> },
                    { key: "item", header: "Item", cell: (l) => item(l.itemId)?.name ?? "?" },
                    {
                      key: "type",
                      header: "Jenis",
                      cell: (l) => <StatusChip tone={l.isRemnant ? "success" : "accent"}>{l.isRemnant ? "Sisa material" : LOT_ORIGIN[l.origin]}</StatusChip>,
                    },
                    { key: "dims", header: "Ukuran", cell: (l) => <span className="text-muted">{formatDims(l.dimensions) || "—"}</span> },
                    { key: "qty", header: "Qty kini", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
                    { key: "cost", header: "HPP/satuan", align: "end", cell: (l) => formatIDR(l.unitCost) },
                  ]}
                />
              </Section>
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {wo.status === "selesai" && wo.cost ? (
            <Section title="HPP pekerjaan" description={`Dikunci ${formatDateTime(wo.completedAt)}`}>
              <CostBreakdown cost={wo.cost} />
            </Section>
          ) : (
            open && <CostEditor key={`${wo.id}-${wo.laborHours}-${wo.laborRate}-${wo.overhead}-${JSON.stringify(wo.extraCosts)}`} wo={wo} issuedValue={issuedValue} />
          )}

          <Section title="Rencana hasil">
            {wo.plannedOutputs.length === 0 ? (
              <p className="text-sm text-muted">Ditentukan saat selesai.</p>
            ) : (
              wo.plannedOutputs.map((o) => <Row key={o.id} label={item(o.itemId)?.name ?? "?"} value={formatQty(o.qty, item(o.itemId)?.uom)} />)
            )}
            {wo.plannedInputs.length > 0 && (
              <>
                <p className="mt-3 mb-1 text-xs font-semibold text-muted uppercase">Barang asal / tambahan</p>
                {wo.plannedInputs.map((i) => (
                  <Row
                    key={i.id}
                    label={`${item(i.itemId)?.name ?? "?"}${i.lotId ? ` · ${lotsById.get(i.lotId)?.code ?? ""}` : ""}`}
                    value={formatQty(i.qty, item(i.itemId)?.uom)}
                  />
                ))}
              </>
            )}
          </Section>

          <Section title="Info">
            <KeyValue
              columns={1}
              items={[
                ["Mulai", formatDateTime(wo.startedAt)],
                ["Selesai", formatDateTime(wo.completedAt)],
                [
                  "Untuk order",
                  so ? (
                    <Link href={`/penjualan/${so.id}`}>
                      {so.code} · {partnerName(so.customerId)}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
                ["Catatan", wo.note],
              ]}
            />
          </Section>

          {purchases.length > 0 && (
            <Section title="Pembelian khusus pekerjaan ini">
              {purchases.map((p) => (
                <Row
                  key={p.id}
                  label={<Link href={`/pembelian/${p.id}`}>{p.code}</Link>}
                  value={<StatusChip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</StatusChip>}
                />
              ))}
              {wo.status === "selesai" && (
                <p className="mt-2 flex items-start gap-2 text-xs text-muted">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Sisa pembelian telah dilepas menjadi stok bebas dengan harga belinya — siap dipakai produksi berikutnya.
                </p>
              )}
            </Section>
          )}
        </div>
      </div>

      <IssueDialog wo={wo} request={issueReq} onClose={() => setIssueReq(null)} />
      <CompleteDialog wo={wo} isOpen={completing} onOpenChange={setCompleting} />
    </>
  );
}

function CostEditor({ wo, issuedValue }: { wo: WorkOrder; issuedValue: number }) {
const run = useRun();
  const [laborHours, setLaborHours] = useState(wo.laborHours);
  const [laborRate, setLaborRate] = useState(wo.laborRate);
  const [overhead, setOverhead] = useState(wo.overhead);
  const [extras, setExtras] = useState<ExtraCost[]>(wo.extraCosts);
  const dirty =
    laborHours !== wo.laborHours ||
    laborRate !== wo.laborRate ||
    overhead !== wo.overhead ||
    JSON.stringify(extras) !== JSON.stringify(wo.extraCosts);
  return (
    <Section title="Biaya berjalan" description="Bisa diubah sampai pekerjaan selesai.">
      <div className="flex flex-col gap-3">
        <Row label="Bahan diambil" value={formatIDR(issuedValue)} />
        <div className="grid grid-cols-2 gap-2">
          <NumberInput label="Jam kerja" value={laborHours} onChange={setLaborHours} suffix="jam" />
          <NumberInput label="Tarif/jam" value={laborRate} onChange={setLaborRate} money />
        </div>
        <NumberInput label="Overhead" value={overhead} onChange={setOverhead} money />
        <div>
          <p className="mb-1 text-sm font-medium">Biaya lain (jasa luar, transport)</p>
          {extras.map((c, idx) => (
            <div key={c.id} className="mb-2 grid grid-cols-[1fr_8rem_auto] gap-2">
              <TextInput aria-label="Keterangan" value={c.label} onChange={(label) => setExtras(extras.map((x, i) => (i === idx ? { ...x, label } : x)))} placeholder="Keterangan" />
              <NumberInput aria-label="Jumlah" value={c.amount} onChange={(amount) => setExtras(extras.map((x, i) => (i === idx ? { ...x, amount } : x)))} money />
              <Button isIconOnly variant="ghost" aria-label="Hapus" onPress={() => setExtras(extras.filter((_, i) => i !== idx))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="tertiary" onPress={() => setExtras([...extras, { id: newId(), label: "", amount: 0 }])}>
            <Plus className="size-4" /> Biaya lain
          </Button>
        </div>
        <div className="border-t border-separator pt-2">
          <Row label="Estimasi total saat ini" value={formatIDR(issuedValue + laborHours * laborRate + overhead + sum(extras.map((e) => e.amount)))} strong />
        </div>
        <Button
          variant="secondary"
          isDisabled={!dirty}
          onPress={() => run((d) => updateWorkOrder(d, wo.id, { laborHours, laborRate, overhead, extraCosts: extras }), "Biaya disimpan")}
        >
          Simpan biaya
        </Button>
      </div>
    </Section>
  );
}
