import { Button, Card } from "@heroui/react";
import { Check, Combine, Hammer, Plus, Recycle, Trash2, Wrench, Shuffle, Scissors, X, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  createWorkOrder,
  createWorkOrderFromRecipe,
  EPS,
  getLot,
  isProducibleIn,
  recipeFlow,
  requirements,
  sum,
  transact,
  type ID,
  type Item,
  type WorkOrderInput,
  type WorkOrderType,
} from "@/domain";
import { DateInput, NumberInput, SelectInput, TextAreaInput, TextInput } from "@/components/fields";
import { ItemPicker } from "@/components/pickers";
import { FlowDiagram } from "@/components/FlowDiagram";
import { PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, formatQty, UOM_LABEL } from "@/lib/format";
import { WO_TYPE } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";
import { lotLabel } from "./lot-label";
import { RequirementsTable } from "./shared";

const TYPE_ICON: Record<WorkOrderType, LucideIcon> = {
  produksi: Hammer,
  konversi: Shuffle,
  gabung: Combine,
  dekonstruksi: Scissors,
  perbaikan: Wrench,
};

interface LineState {
  key: string;
  itemId: ID | null;
  qty: number;
}

let keySeq = 0;
const newLine = (itemId: ID | null = null, qty = 1): LineState => ({ key: `l${++keySeq}`, itemId, qty });

export default function WorkOrderNewPage() {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialLot = params.get("lot");
  const initialType = (params.get("type") as WorkOrderType | null) ?? "produksi";
  const salesOrderId = params.get("so") ?? undefined;

  const [type, setType] = useState<WorkOrderType>(WO_TYPE[initialType] ? initialType : "produksi");
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [note, setNote] = useState("");
  const [outputs, setOutputs] = useState<LineState[]>(() => [newLine(params.get("item"))]);
  const [extras, setExtras] = useState<LineState[]>([]);
  const [sourceLotId, setSourceLotId] = useState<ID | null>(initialLot);
  const [sourceQty, setSourceQty] = useState(1);
  const [recipeId, setRecipeId] = useState<ID | null>(params.get("recipe"));
  const [batches, setBatches] = useState(1);
  const recipe = recipeId ? db.recipes.find((r) => r.id === recipeId && !r.archived) : undefined;
  const recipeOptions = db.recipes
    .filter((r) => !r.archived)
    .map((r) => ({ id: r.id, label: r.name, description: `${r.code} · ${WO_TYPE[r.type].short} · ${r.outputs.map((o) => item(o.itemId)?.name).join(", ")}` }));

  const needsSource = type === "konversi" || type === "dekonstruksi" || type === "perbaikan";
  const sourceLot = sourceLotId ? db.lots.find((l) => l.id === sourceLotId) : undefined;
  const sourceItem = item(sourceLot?.itemId);

  const sourceOptions = useMemo(
    () =>
      db.lots
        .filter((l) => l.qty > EPS && !l.reservedForWo && item(l.itemId)?.kind === "product")
        .filter((l) => (type === "perbaikan" ? l.status === "rusak" : l.status === "tersedia" || l.status === "rusak"))
        .map((l) => ({ id: l.id, label: item(l.itemId)?.name ?? "?", description: lotLabel(l, item(l.itemId)) })),
    [db.lots, item, type],
  );

  const input: WorkOrderInput | null = useMemo(() => {
    const outs = outputs.filter((o) => o.itemId && o.qty > 0).map((o) => ({ itemId: o.itemId!, qty: o.qty }));
    const ext = extras.filter((o) => o.itemId && o.qty > 0).map((o) => ({ itemId: o.itemId!, qty: o.qty }));
    const source = sourceLot ? [{ itemId: sourceLot.itemId, qty: sourceQty, lotId: sourceLot.id }] : [];
    const autoTitle = (() => {
      const first = outs[0] ? item(outs[0].itemId)?.name : undefined;
      switch (type) {
        case "produksi":
          return first ? `Make ${first}${outs.length > 1 ? ` +${outs.length - 1}` : ""}` : "";
        case "konversi":
          return sourceItem && first ? `Convert ${sourceItem.name} → ${first}` : "";
        case "gabung":
          return first ? `Merge → ${first}` : "";
        case "dekonstruksi":
          return sourceItem ? `Dismantle ${sourceItem.name}` : "";
        case "perbaikan":
          return sourceItem ? `Repair ${sourceItem.name} (${sourceLot?.code})` : "";
      }
    })();
    const base = { type, title: title.trim() || autoTitle, dueDate: dueDate || undefined, note: note || undefined, salesOrderId };
    if (type === "produksi" || type === "gabung") return { ...base, plannedOutputs: outs, plannedInputs: ext };
    if (type === "perbaikan")
      return { ...base, plannedOutputs: sourceLot ? [{ itemId: sourceLot.itemId, qty: sourceQty }] : [], plannedInputs: [...source, ...ext] };
    if (type === "konversi") return { ...base, plannedOutputs: outs, plannedInputs: [...source, ...ext] };
    return { ...base, plannedOutputs: outs, plannedInputs: source };
  }, [type, title, dueDate, note, outputs, extras, sourceLot, sourceQty, sourceItem, item, salesOrderId]);

  const ready = recipe ? batches > 0 : needsSource ? !!sourceLot : !!input?.plannedOutputs.length;
  const create = useMemo(
    () => (d: typeof db) =>
      recipe
        ? createWorkOrderFromRecipe(d, recipe.id, { batches, title: title.trim() || undefined, dueDate: dueDate || undefined, salesOrderId, note: note || undefined })
        : createWorkOrder(d, input!),
    [recipe, batches, title, dueDate, salesOrderId, note, input],
  );
  const preview = useMemo(() => {
    if ((!input && !recipe) || !ready) return null;
    try {
      return transact(db, (d) => {
        const wo = create(d);
        const reqs = requirements(d, wo);
        const material = sum(
          reqs.map((r) => {
            const lotCost = r.lotId ? getLot(d, r.lotId).unitCost : undefined;
            return r.required * (lotCost ?? item(r.itemId)?.standardCost ?? 0);
          }),
        );
        return { reqs, laborHours: wo.laborHours, labor: wo.laborHours * wo.laborRate, overhead: wo.overhead, material };
      }).result;
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  }, [db, input, recipe, create, item, ready]);
  const recipeMap = useMemo(() => (recipe ? recipeFlow(db, recipe, batches || 1) : null), [db, recipe, batches]);

  const outputUnits = recipe ? sum(recipe.outputs.map((o) => o.qty * batches)) : sum(input?.plannedOutputs.map((o) => o.qty) ?? []);
  const canSave = !!preview && !("error" in preview);

  const save = () => {
    if (!input && !recipe) return;
    const wo = run(create, (w) => `Work order ${w.code} created`);
    if (wo) navigate(`/work-orders/${wo.id}`, { replace: true });
  };


  return (
    <>
      <PageHeader title="New work order" description="Start from a proven recipe, or build it yourself: job type, items, then check material requirements." back="/work-orders" />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Start from a recipe" description="A recipe brings its own materials, output, labour hours and stages — multiplied by the number of batches.">
            <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-[1fr_8rem_auto]">
              <SelectInput
                label="Recipe"
                value={recipeId}
                onChange={setRecipeId}
                options={recipeOptions}
                placeholder={recipeOptions.length ? "No recipe — build it yourself" : "No recipes yet"}
                isDisabled={!recipeOptions.length}
              />
              <NumberInput label="Batch" value={batches} onChange={setBatches} isDisabled={!recipe} maximumFractionDigits={2} />
              {recipe && (
                <Button variant="ghost" onPress={() => setRecipeId(null)}>
                  <X className="size-4" /> Clear recipe
                </Button>
              )}
            </div>
            {recipeMap && (
              <div className="-mx-4 mt-3 border-t border-[var(--rule)]">
                <FlowDiagram graph={recipeMap} label={`Recipe map ${recipe?.name}`} />
              </div>
            )}
          </Section>

          {!recipe && (
          <Section title="1 · Job type">
            <div role="radiogroup" aria-label="Job type" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(Object.keys(WO_TYPE) as WorkOrderType[]).map((t) => {
                const Icon = TYPE_ICON[t];
                const active = t === type;
                return (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    onClick={() => {
                      setType(t);
                      if (t !== type) setSourceLotId(null);
                      setOutputs([newLine()]);
                      // A merge needs at least two things to join; start with two empty rows.
                      if (t === "gabung" && extras.length < 2) setExtras([newLine(), newLine()]);
                    }}
                    className={`flex items-start gap-3 rounded-md border p-4 text-left transition focus-visible:ring-2 focus-visible:ring-focus focus-visible:outline-none ${
                      active ? "border-accent bg-accent-soft/50" : "border-[var(--rule)] hover:border-accent/60"
                    }`}
                  >
                    <div className={`grid size-9 shrink-0 place-items-center rounded-sm ${active ? "bg-accent text-accent-foreground" : "bg-default"}`}>
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{WO_TYPE[t].label}</p>
                      <p className="mt-0.5 text-sm text-muted">{WO_TYPE[t].description}</p>
                    </div>
                    {active && <Check className="size-4 text-accent" />}
                  </button>
                );
              })}
            </div>
          </Section>

          )}

          <Section title={recipe ? "Details" : "2 · Items"}>
            <div className="flex flex-col gap-5">
              {!recipe && needsSource && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
                  <SelectInput
                    label={type === "perbaikan" ? "Damaged unit to repair" : "Source product (taken from stock)"}
                    value={sourceLotId}
                    onChange={(id) => {
                      setSourceLotId(id);
                      setSourceQty(Math.min(1, db.lots.find((l) => l.id === id)?.qty ?? 1));
                    }}
                    options={sourceOptions}
                    placeholder={sourceOptions.length ? "Choose a unit…" : type === "perbaikan" ? "No damaged units" : "No product stock"}
                    isRequired
                  />
                  <NumberInput
                    label="Qty"
                    value={sourceQty}
                    onChange={setSourceQty}
                    minValue={0}
                    maxValue={sourceLot?.qty}
                    suffix={sourceItem ? UOM_LABEL[sourceItem.uom] : undefined}
                  />
                </div>
              )}

              {!recipe && type !== "perbaikan" && (
                <LineEditor
                  title={
                    type === "dekonstruksi"
                      ? "Expected materials recovered (can be changed on completion)"
                      : type === "gabung"
                        ? "Merged output — one item (e.g. Dining set, laminated panel)"
                        : "Output — product, component or processed material"
                  }
                  kind={type === "dekonstruksi" ? "material" : undefined}
                  filter={type === "dekonstruksi" || type === "gabung" ? undefined : (i) => isProducibleIn(db, i)}
                  lines={outputs}
                  onChange={setOutputs}
                  addLabel={type === "dekonstruksi" ? "Add material" : "Add product"}
                  single={type === "gabung"}
                />
              )}

              {!recipe && type !== "dekonstruksi" && (
                <LineEditor
                  title={
                    type === "produksi"
                      ? "Extra materials outside the BOM (optional)"
                      : type === "gabung"
                        ? "Items to merge — from stock (products, components, offcuts, materials)"
                        : "Extra materials needed"
                  }
                  kind={type === "gabung" ? undefined : "material"}
                  lines={extras}
                  onChange={setExtras}
                  addLabel="Add material"
                  allowEmpty
                />
              )}

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <TextInput
                  label="Title"
                  value={title}
                  onChange={setTitle}
                  placeholder={recipe ? `${recipe.name}${batches !== 1 ? ` ×${batches}` : ""}` : input?.title || "Automatic from the product"}
                />
                <DateInput label="Due date" value={dueDate} onChange={setDueDate} />
              </div>
              <TextAreaInput label="Note" value={note} onChange={setNote} placeholder="Instructions for the craftsmen, finishing spec, etc." rows={2} />
            </div>
          </Section>

          <Section
            title={recipe ? "Check material requirements" : "3 · Check material requirements"}
            description="Offcuts are used first, then the oldest stock. After saving you can raise a purchase for any shortfall."
            bodyClassName="p-0"
          >
            {preview && "reqs" in preview && preview.reqs.length > 0 ? (
              <RequirementsTable reqs={preview.reqs} showIssued={false} />
            ) : (
              <p className="px-4 pb-4 text-sm text-muted">
                {preview && "error" in preview ? preview.error : "Fill in the items in step 2 to see the requirements."}
              </p>
            )}
          </Section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">Standard cost estimate</Card.Title>
              <Card.Description>Estimated from the {recipe ? "recipe" : "BOM"} & rates. The actual job cost is calculated on completion.</Card.Description>
            </Card.Header>
            <Card.Content>
              {preview && "material" in preview ? (
                <>
                  <Row label="Materials (standard)" value={formatIDR(preview.material)} />
                  <Row label={`Labour · ${formatQty(preview.laborHours)} h`} value={formatIDR(preview.labor)} />
                  <Row label="Overhead" value={formatIDR(preview.overhead)} />
                  <div className="my-2 border-t border-[var(--rule)]" />
                  <Row label="Estimated total" value={formatIDR(preview.material + preview.labor + preview.overhead)} strong />
                  {outputUnits > 0 && (
                    <Row label="Per output unit" value={formatIDR((preview.material + preview.labor + preview.overhead) / outputUnits)} muted />
                  )}
                  {preview.reqs.some((r) => r.freeRemnant > 0 && r.required > 0) && (
                    <p className="mt-3 flex items-start gap-2 rounded-sm bg-success-soft p-3 text-xs text-success-soft-foreground">
                      <Recycle className="mt-0.5 size-4 shrink-0" />
                      Matching offcuts are in stock — they will be suggested when you issue materials, so the job cost comes out lower.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-muted">No data yet.</p>
              )}
            </Card.Content>
            <Card.Footer className="flex-col items-stretch gap-2">
              <Button onPress={save} isDisabled={!canSave} fullWidth>
                Save work order
              </Button>
              {preview && "error" in preview && input?.title && <p className="text-xs text-danger">{preview.error}</p>}
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}

function LineEditor({
  title,
  kind,
  filter,
  lines,
  onChange,
  addLabel,
  allowEmpty,
  single,
}: {
  title: string;
  kind?: "material" | "product";
  filter?: (item: Item) => boolean;
  lines: LineState[];
  onChange: (lines: LineState[]) => void;
  addLabel: string;
  allowEmpty?: boolean;
  /** Exactly one line (a merge has one output). */
  single?: boolean;
}) {
  const { item } = useLookups();
  const update = (key: string, patch: Partial<LineState>) => onChange(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  return (
    <div>
      <p className="mb-2 text-sm font-medium">{title}</p>
      <div className="flex flex-col gap-2">
        {lines.map((l) => (
          <div key={l.key} className="grid grid-cols-[1fr_7.5rem_auto] items-end gap-2">
            <ItemPicker kind={kind} filter={filter} value={l.itemId} onChange={(id) => update(l.key, { itemId: id })} aria-label={kind === "material" ? "Material" : "Item"} />
            <NumberInput aria-label="Qty" value={l.qty} onChange={(qty) => update(l.key, { qty })} suffix={l.itemId ? UOM_LABEL[item(l.itemId)?.uom ?? "pcs"] : undefined} />
            <Button
              isIconOnly
              variant="ghost"
              aria-label="Remove row"
              isDisabled={!allowEmpty && lines.length === 1}
              onPress={() => onChange(lines.filter((x) => x.key !== l.key))}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
        {!single && (
          <div>
            <Button size="sm" variant="tertiary" onPress={() => onChange([...lines, newLine()])}>
              <Plus className="size-4" /> {addLabel}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
