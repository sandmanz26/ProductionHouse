import { Button, Link } from "@heroui/react";
import { CheckCircle2, GitBranch, PackageCheck, PackagePlus, Play, Plus, Recycle, ShoppingCart, Trash2, Undo2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router";
import {
  cancelWorkOrder,
  createComponentOrders,
  isOpenWo,
  laborCostOf,
  newId,
  requirements,
  startWorkOrder,
  sum,
  unissue,
  updateWorkOrder,
  workOrderFlow,
  type ExtraCost,
  type Issue,
  type Lot,
  type WorkOrder,
} from "@/domain";
import { NumberInput, TextInput } from "@/components/fields";
import { FlowDiagram } from "@/components/FlowDiagram";
import { RecordNotFound } from "@/components/NotFound";
import { Code, ConfirmButton, DataTable, EmptyBlock, KeyValue, PageHeader, Row, Section, StatusChip, Tag, type Column } from "@/components/ui";
import { formatDate, formatDateTime, formatDims, formatIDR, formatPct, formatQty } from "@/lib/format";
import { LOT_ORIGIN, OUTPUT_GRADE, PURCHASE_STATUS, WO_STATUS, WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { CompleteDialog } from "./CompleteDialog";
import { CostBreakdown } from "./CostBreakdown";
import { IssueDialog, type IssueRequest } from "./IssueDialog";
import { ReceiveDialog } from "./ReceiveDialog";
import { LaborPanel, StagesPanel } from "./StagesPanel";
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
  const [receiving, setReceiving] = useState(false);

  const reqs = useMemo(() => (wo ? requirements(db, wo) : []), [db, wo]);
  const lotsById = useMemo(() => new Map(db.lots.map((l) => [l.id, l])), [db.lots]);
  const flow = useMemo(() => (wo ? workOrderFlow(db, wo) : { nodes: [], links: [] }), [db, wo]);

  if (!wo) return <RecordNotFound what="Work order" back="/work-orders" />;

  const open = isOpenWo(wo);
  const shortages = reqs.filter((r) => r.shortage > 0);
  const purchases = db.purchases.filter((p) => p.workOrderId === wo.id);
  const so = wo.salesOrderId ? db.sales.find((s) => s.id === wo.salesOrderId) : undefined;
  const issuedValue = sum(wo.issues.map((i) => i.qty * i.unitCost));
  const componentShort = reqs.filter((r) => r.producible && r.shortage - r.inComponentOrders > 0);
  const children = db.workOrders.filter((w) => w.parentWoId === wo.id);
  const parent = wo.parentWoId ? db.workOrders.find((w) => w.id === wo.parentWoId) : undefined;

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
            {lot?.isRemnant && <Recycle className="size-3.5 text-success" aria-label="Offcut" />}
          </div>
        );
      },
    },
    { key: "item", header: "Material", cell: (i) => item(i.itemId)?.name ?? "?" },
    { key: "qty", header: "Qty", align: "end", cell: (i) => formatQty(i.qty, item(i.itemId)?.uom) },
    { key: "cost", header: "Unit cost", align: "end", cell: (i) => formatIDR(i.unitCost) },
    { key: "value", header: "Value", align: "end", cell: (i) => formatIDR(i.qty * i.unitCost) },
    { key: "at", header: "Time", cell: (i) => <span className="text-muted">{formatDateTime(i.at)}</span> },
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
                title="Return material to the warehouse?"
                description={`${formatQty(i.qty, item(i.itemId)?.uom)} ${item(i.itemId)?.name} goes back to its source lot at the same cost.`}
                confirmLabel="Return"
                onConfirm={() => run((d) => unissue(d, wo.id, i.id, i.qty), "Material returned to the warehouse")}
              >
                <Undo2 className="size-4" />
              </ConfirmButton>
            ),
          },
        ]
      : []),
  ];

  const createdLots = (wo.createdLotIds ?? []).map((lid) => lotsById.get(lid)).filter((l): l is Lot => !!l);
  const recipe = wo.recipeId ? db.recipes.find((r) => r.id === wo.recipeId) : undefined;

  return (
    <>
      <PageHeader
        back="/work-orders"
        title={wo.title}
        badge={
          <>
            <Tag>{WO_TYPE[wo.type].label}</Tag>
            <StatusChip tone={WO_STATUS[wo.status].tone}>{WO_STATUS[wo.status].label}</StatusChip>
          </>
        }
        description={`${wo.code} · created ${formatDate(wo.createdAt)}${wo.dueDate ? ` · due ${formatDate(wo.dueDate)}` : ""}`}
        actions={
          open && (
            <>
              <ConfirmButton
                variant="danger-soft"
                danger
                title={`Cancel ${wo.code}?`}
                description="All issued materials go back to the warehouse, and purchase reservations are released."
                confirmLabel="Cancel job"
                onConfirm={() => run((d) => cancelWorkOrder(d, wo.id), `${wo.code} cancelled`)}
              >
                Cancel
              </ConfirmButton>
              {wo.status === "rencana" && (
                <Button variant="secondary" onPress={() => run((d) => startWorkOrder(d, wo.id), `${wo.code} started`)}>
                  <Play className="size-4" /> Start
                </Button>
              )}
              <Button variant="secondary" onPress={() => setIssueReq({ itemId: null, qty: 1 })}>
                <Plus className="size-4" /> Issue materials
              </Button>
              {wo.type !== "dekonstruksi" && wo.plannedOutputs.length > 0 && (
                <Button variant="secondary" onPress={() => setReceiving(true)}>
                  <PackagePlus className="size-4" /> Receive partial
                </Button>
              )}
              <Button onPress={() => setCompleting(true)} isDisabled={wo.issues.length === 0}>
                <PackageCheck className="size-4" /> Complete
              </Button>
            </>
          )
        }
      />

      <Section
        title="Process map"
        description={
          wo.cost
            ? "Where every rupiah of this job went: materials and labour in, output, offcuts and waste out — then where the output went."
            : wo.issues.length
              ? "What has gone into this job so far. The full map is locked when the job is done."
              : "The plan at standard cost. It turns into actual figures once materials are issued."
        }
        className="mb-6"
        bodyClassName="p-0"
      >
        <FlowDiagram graph={flow} label={`Process map ${wo.code}`} />
      </Section>

      <div className="grid grid-cols-1 gap-6 items-start xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          {open && (
            <Section
              title="Material requirements"
              description={`${recipe ? `From recipe ${recipe.name}` : "From the product BOM and extra materials"}. Click Issue to take materials out of the warehouse.`}
              actions={
                <>
                  {componentShort.length > 0 && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onPress={() => run((d) => createComponentOrders(d, wo.id), (w) => `${w.length} component orders created`)}
                    >
                      <GitBranch className="size-4" /> Make components
                    </Button>
                  )}
                  {shortages.some((r) => !r.producible) && (
                    <Button size="sm" onPress={() => navigate(`/purchases/new?wo=${wo.id}`)}>
                      <ShoppingCart className="size-4" /> Buy shortfall
                    </Button>
                  )}
                </>
              }
              bodyClassName="p-0"
            >
              {reqs.length ? (
                <RequirementsTable reqs={reqs} onIssue={(r) => setIssueReq({ itemId: r.itemId, qty: r.remaining })} />
              ) : (
                <EmptyBlock title="No standard requirements" description="Issue any material with the Issue materials button." />
              )}
            </Section>
          )}

          <StagesPanel wo={wo} />

          {wo.receipts.length > 0 && (
            <Section
              title="Partial output"
              description={wo.status === "selesai" ? "Already revalued to actual cost." : "Received at provisional cost; adjusted when the job is closed."}
              bodyClassName="p-0"
            >
              <DataTable
                label="Partial output"
                rows={wo.receipts}
                columns={[
                  { key: "at", header: "Time", isRowHeader: true, className: "whitespace-nowrap", cell: (r) => formatDateTime(r.at) },
                  { key: "item", header: "Item", cell: (r) => item(r.itemId)?.name ?? "?" },
                  { key: "qty", header: "Qty", align: "end", cell: (r) => formatQty(r.qty, item(r.itemId)?.uom) },
                  { key: "grade", header: "QC", cell: (r) => <StatusChip tone={r.grade === "reject" ? "danger" : "success"}>{OUTPUT_GRADE[r.grade]}</StatusChip> },
                  { key: "cost", header: "Provisional cost", align: "end", cell: (r) => formatIDR(r.provisionalUnitCost) },
                ]}
              />
            </Section>
          )}

          <Section
            title="Materials issued"
            description={wo.issues.length ? `Total value ${formatIDR(issuedValue)}` : undefined}
            bodyClassName="p-0"
          >
            <DataTable
              label="Materials issued"
              columns={issueColumns}
              rows={wo.issues}
              dependencies={[lotsById, open]}
              empty={<EmptyBlock title="No materials issued yet" description="Materials issued from the warehouse are recorded here with their lot cost." />}
            />
          </Section>

          {wo.status === "selesai" && wo.cost && (
            <>
              <Section title="Material usage vs standard" bodyClassName="p-0">
                <DataTable
                  label="Material usage"
                  rows={wo.cost.lines.map((l) => ({ ...l, id: l.itemId }))}
                  columns={[
                    { key: "item", header: "Material", isRowHeader: true, cell: (l) => item(l.itemId)?.name ?? "?" },
                    { key: "issued", header: "Issued", align: "end", cell: (l) => formatQty(l.issuedQty, item(l.itemId)?.uom) },
                    { key: "ret", header: "Returned/offcut", align: "end", cell: (l) => formatQty(l.returnedQty, item(l.itemId)?.uom) },
                    { key: "scrap", header: "Waste", align: "end", cell: (l) => formatQty(l.scrapQty, item(l.itemId)?.uom) },
                    { key: "std", header: "BOM standard", align: "end", cell: (l) => (l.standardQty ? formatQty(l.standardQty, item(l.itemId)?.uom) : "—") },
                    {
                      key: "var",
                      header: "Variance",
                      align: "end",
                      cell: (l) => {
                        if (!l.standardQty) return "—";
                        const v = (l.netQty - l.standardQty) / l.standardQty;
                        return <span className={v > 0.05 ? "text-danger" : v < -0.05 ? "text-success" : ""}>{v > 0 ? "+" : ""}{formatPct(v)}</span>;
                      },
                    },
                    { key: "net", header: "Net value", align: "end", cell: (l) => formatIDR(l.netValue) },
                  ]}
                />
              </Section>
              <Section title="Items received from this job" bodyClassName="p-0">
                <DataTable
                  label="Output lots"
                  rows={createdLots}
                  onRowAction={(l) => navigate(`/stock/items/${l.itemId}`)}
                  columns={[
                    { key: "code", header: "Lot", isRowHeader: true, className: "whitespace-nowrap", cell: (l) => <span className="font-medium">{l.code}</span> },
                    { key: "item", header: "Item", cell: (l) => item(l.itemId)?.name ?? "?" },
                    {
                      key: "type",
                      header: "Type",
                      cell: (l) => <StatusChip tone={l.isRemnant ? "success" : "accent"}>{l.isRemnant ? "Offcut" : LOT_ORIGIN[l.origin]}</StatusChip>,
                    },
                    { key: "dims", header: "Size", cell: (l) => <span className="text-muted">{formatDims(l.dimensions) || "—"}</span> },
                    { key: "qty", header: "Qty now", align: "end", cell: (l) => formatQty(l.qty, item(l.itemId)?.uom) },
                    { key: "cost", header: "Unit cost", align: "end", cell: (l) => formatIDR(l.unitCost) },
                  ]}
                />
              </Section>
            </>
          )}
        </div>

        <div className="flex flex-col gap-6">
          {wo.status === "selesai" && wo.cost ? (
            <Section title="Job cost" description={`Locked ${formatDateTime(wo.completedAt)}`}>
              <CostBreakdown cost={wo.cost} />
            </Section>
          ) : (
            open && <CostEditor key={`${wo.id}-${wo.laborHours}-${wo.laborRate}-${wo.overhead}-${JSON.stringify(wo.extraCosts)}`} wo={wo} issuedValue={issuedValue} />
          )}

          {open && <LaborPanel wo={wo} />}
          {!open && wo.laborLogs.length > 0 && <LaborPanel wo={wo} />}

          {(children.length > 0 || parent) && (
            <Section title="Job structure">
              {parent && <Row label="Part of" value={<Link href={`/work-orders/${parent.id}`}><Code>{parent.code}</Code></Link>} />}
              {children.map((c) => (
                <Row
                  key={c.id}
                  label={
                    <Link href={`/work-orders/${c.id}`}>
                      <Code>{c.code}</Code> <span className="text-sm">{c.title}</span>
                    </Link>
                  }
                  value={<StatusChip tone={WO_STATUS[c.status].tone}>{WO_STATUS[c.status].label}</StatusChip>}
                />
              ))}
            </Section>
          )}

          <Section title="Planned output">
            {wo.plannedOutputs.length === 0 ? (
              <p className="text-sm text-muted">Set on completion.</p>
            ) : (
              wo.plannedOutputs.map((o) => <Row key={o.id} label={item(o.itemId)?.name ?? "?"} value={formatQty(o.qty, item(o.itemId)?.uom)} />)
            )}
            {wo.plannedInputs.length > 0 && (
              <>
                <p className="caption-label mt-3 mb-1">Source / extra items</p>
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
                ["Started", formatDateTime(wo.startedAt)],
                ["Completed", formatDateTime(wo.completedAt)],
                [
                  "For order",
                  so ? (
                    <Link href={`/sales/${so.id}`}>
                      {so.code} · {partnerName(so.customerId)}
                    </Link>
                  ) : (
                    "—"
                  ),
                ],
                ["Recipe", recipe ? <Link href={`/recipes/${recipe.id}`}>{recipe.name}{wo.batches && wo.batches !== 1 ? ` × ${wo.batches} batch` : ""}</Link> : "—"],
                ["Note", wo.note],
              ]}
            />
          </Section>

          {purchases.length > 0 && (
            <Section title="Purchases for this job">
              {purchases.map((p) => (
                <Row
                  key={p.id}
                  label={<Link href={`/purchases/${p.id}`}>{p.code}</Link>}
                  value={<StatusChip tone={PURCHASE_STATUS[p.status].tone}>{PURCHASE_STATUS[p.status].label}</StatusChip>}
                />
              ))}
              {wo.status === "selesai" && (
                <p className="mt-2 flex items-start gap-2 text-xs text-muted">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  Leftover purchased stock has been released to free stock at its purchase price — ready for the next job.
                </p>
              )}
            </Section>
          )}
        </div>
      </div>

      <IssueDialog wo={wo} request={issueReq} onClose={() => setIssueReq(null)} />
      <CompleteDialog wo={wo} isOpen={completing} onOpenChange={setCompleting} />
      <ReceiveDialog wo={wo} isOpen={receiving} onOpenChange={setReceiving} />
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
    <Section title="Running cost" description="You can change this until the job is done.">
      <div className="flex flex-col gap-3">
        <Row label="Materials issued" value={formatIDR(issuedValue)} />
        {wo.laborLogs.length ? (
          <Row label="Labour (from labour log)" value={formatIDR(laborCostOf(wo).amount)} />
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <NumberInput label="Planned labour hours" value={laborHours} onChange={setLaborHours} suffix="h" />
            <NumberInput label="Rate/hour" value={laborRate} onChange={setLaborRate} money />
          </div>
        )}
        <NumberInput label="Overhead" value={overhead} onChange={setOverhead} money />
        <div>
          <p className="mb-1 text-sm font-medium">Other costs (outside services, transport)</p>
          {extras.map((c, idx) => (
            <div key={c.id} className="mb-2 grid grid-cols-[1fr_8rem_auto] gap-2">
              <TextInput aria-label="Description" value={c.label} onChange={(label) => setExtras(extras.map((x, i) => (i === idx ? { ...x, label } : x)))} placeholder="Description" />
              <NumberInput aria-label="Amount" value={c.amount} onChange={(amount) => setExtras(extras.map((x, i) => (i === idx ? { ...x, amount } : x)))} money />
              <Button isIconOnly variant="ghost" aria-label="Remove" onPress={() => setExtras(extras.filter((_, i) => i !== idx))}>
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <Button size="sm" variant="tertiary" onPress={() => setExtras([...extras, { id: newId(), label: "", amount: 0 }])}>
            <Plus className="size-4" /> Other cost
          </Button>
        </div>
        <div className="border-t border-[var(--rule)] pt-2">
          <Row
            label="Current estimated total"
            value={formatIDR(issuedValue + (wo.laborLogs.length ? laborCostOf(wo).amount : laborHours * laborRate) + overhead + sum(extras.map((e) => e.amount)))}
            strong
          />
        </div>
        <Button
          variant="secondary"
          isDisabled={!dirty}
          onPress={() => run((d) => updateWorkOrder(d, wo.id, { laborHours, laborRate, overhead, extraCosts: extras }), "Costs saved")}
        >
          Save costs
        </Button>
      </div>
    </Section>
  );
}
