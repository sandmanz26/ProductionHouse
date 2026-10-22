import { Button, Card } from "@heroui/react";
import { Archive, GitFork, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import {
  COSTING_LABEL,
  COSTING_METHODS,
  createItem,
  isItemReferenced,
  removeItem,
  restoreItem,
  standardProductCost,
  sum,
  updateItem,
  type CostingMethod,
  type ID,
  type Item,
  type ItemInput,
  type ItemKind,
  type Uom,
} from "@/domain";
import { NumberInput, SelectInput, SwitchInput, TextAreaInput, TextInput } from "@/components/fields";
import { RecordNotFound } from "@/components/NotFound";
import { ItemPicker } from "@/components/pickers";
import { ConfirmButton, PageHeader, Row, Section } from "@/components/ui";
import { formatIDR, UOM_LABEL } from "@/lib/format";
import { COSTING_HINT, MATERIAL_CATEGORY, PRODUCT_CATEGORY } from "@/lib/labels";
import { useDb, useLookups, useRun } from "@/store/db-store";

export default function ItemFormPage() {
  const { id } = useParams();
  const db = useDb();
  const it = id ? db.items.find((i) => i.id === id) : undefined;
  if (id && !it) return <RecordNotFound what="Item" back="/master/item" />;
  return <ItemForm key={id ?? "new"} existing={it} />;
}

interface BomRow {
  key: string;
  materialId: ID | null;
  qty: number;
}
let seq = 0;
const k = () => `b${++seq}`;

function ItemForm({ existing }: { existing?: Item }) {
  const db = useDb();
  const run = useRun();
  const { item } = useLookups();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const kind: ItemKind = existing?.kind ?? (params.get("jenis") === "material" ? "material" : "product");
  const isProduct = kind === "product";

  const [name, setName] = useState(existing?.name ?? "");
  const [sku, setSku] = useState(existing?.sku ?? "");
  const [category, setCategory] = useState<string>(existing?.category ?? (isProduct ? "kursi" : "kayu_solid"));
  const [uom, setUom] = useState<Uom>(existing?.uom ?? (isProduct ? "pcs" : "lembar"));
  const [standardCost, setStandardCost] = useState(existing?.standardCost ?? 0);
  const [reorderPoint, setReorderPoint] = useState(existing?.reorderPoint ?? 0);
  const [trackRemnant, setTrackRemnant] = useState(existing?.trackRemnant ?? !isProduct);
  const [minRemnantQty, setMinRemnantQty] = useState(existing?.minRemnantQty ?? 0);
  const [bom, setBom] = useState<BomRow[]>(existing?.bom?.map((b) => ({ key: k(), materialId: b.materialId, qty: b.qty })) ?? []);
  const [laborHours, setLaborHours] = useState(existing?.laborHours ?? 0);
  const [salePrice, setSalePrice] = useState(existing?.salePrice ?? 0);
  const [rentalRate, setRentalRate] = useState(existing?.rentalRatePerDay ?? 0);
  const [hsCode, setHsCode] = useState(existing?.hsCode ?? "");
  const [packing, setPacking] = useState(
    existing?.packing ?? { length: 0, width: 0, height: 0, cartonsPerUnit: 1, grossWeightKg: 0, netWeightKg: 0 },
  );
  const [note, setNote] = useState(existing?.note ?? "");
  const [producible, setProducible] = useState(isProduct || (existing?.bom?.length ?? 0) > 0);
  const [stagesText, setStagesText] = useState(existing?.stages?.join(", ") ?? "");
  const [puLabel, setPuLabel] = useState(existing?.purchaseUnit?.label ?? "");
  const [puFactor, setPuFactor] = useState(existing?.purchaseUnit?.factor ?? 0);
  const [costing, setCosting] = useState<CostingMethod | "default">(existing?.costingMethod ?? "default");
  const hasBom = isProduct || producible;

  const bomLines = bom.filter((b) => b.materialId).map((b) => ({ materialId: b.materialId!, qty: b.qty }));
  const input: ItemInput = {
    kind,
    name,
    sku,
    category: category as Item["category"],
    uom,
    standardCost,
    reorderPoint: reorderPoint || undefined,
    trackRemnant: isProduct ? undefined : trackRemnant,
    minRemnantQty: !isProduct && trackRemnant ? minRemnantQty || undefined : undefined,
    bom: hasBom ? bomLines : undefined,
    laborHours: hasBom ? laborHours : undefined,
    stages: hasBom && stagesText.trim() ? stagesText.split(",").map((x) => x.trim()).filter(Boolean) : undefined,
    purchaseUnit: !isProduct && puLabel.trim() && puFactor > 0 ? { label: puLabel.trim(), factor: puFactor } : undefined,
    salePrice: isProduct ? salePrice || undefined : undefined,
    rentalRatePerDay: isProduct ? rentalRate || undefined : undefined,
    hsCode: isProduct ? hsCode || undefined : undefined,
    packing: isProduct && packing.length && packing.width && packing.height ? packing : undefined,
    note: note || undefined,
    archived: existing?.archived,
    costingMethod: costing === "default" ? undefined : costing,
  };
  const stdCost = hasBom ? standardProductCost(db, { ...input, id: existing?.id ?? "", sku } as Item) : 0;
  const materialCost = sum(bomLines.map((b) => (item(b.materialId)?.standardCost ?? 0) * b.qty));
  const cbm = (packing.length * packing.width * packing.height * packing.cartonsPerUnit) / 1_000_000;

  const save = () => {
    // Products keep their BOM-based standard cost in sync on every save.
    const data = isProduct || (producible && !standardCost) ? { ...input, standardCost: stdCost } : input;
    const r = run((d) => (existing ? updateItem(d, existing.id, data) : createItem(d, data)), (x) => `${x.name} disimpan`);
    if (r) navigate(`/master/item?jenis=${kind}`, { replace: true });
  };

  const categories = isProduct ? PRODUCT_CATEGORY : MATERIAL_CATEGORY;

  return (
    <>
      <PageHeader
        title={existing ? existing.name : isProduct ? "Produk baru" : "Material baru"}
        description={existing ? `${existing.sku} · ${isProduct ? "Produk" : "Material"}` : undefined}
        back={`/master/item?jenis=${kind}`}
        actions={
          existing && (
            <>
              <Button variant="secondary" onPress={() => navigate(`/jalur/${existing.id}`)}>
                <GitFork className="size-4" /> Jalur produksi
              </Button>
              {existing.archived ? (
                <Button variant="secondary" onPress={() => run((d) => restoreItem(d, existing.id), "Item dipulihkan")}>
                  <RotateCcw className="size-4" /> Pulihkan
                </Button>
              ) : (
                <ConfirmButton
                  variant="danger-soft"
                  danger
                  title={isItemReferenced(db, existing.id) ? "Arsipkan item?" : "Hapus item?"}
                  description={
                    isItemReferenced(db, existing.id)
                      ? "Item sudah dipakai di transaksi, jadi akan diarsipkan (riwayat tetap utuh) dan disembunyikan dari pilihan."
                      : "Item belum pernah dipakai dan akan dihapus permanen."
                  }
                  confirmLabel="Lanjutkan"
                  onConfirm={() => {
                    const r = run((d) => removeItem(d, existing.id), (x) => (x === "archived" ? "Item diarsipkan" : "Item dihapus"));
                    if (r) navigate(`/master/item?jenis=${kind}`);
                  }}
                >
                  <Archive className="size-4" /> {isItemReferenced(db, existing.id) ? "Arsipkan" : "Hapus"}
                </ConfirmButton>
              )}
            </>
          )
        }
      />
      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="flex flex-col gap-6 xl:col-span-2">
          <Section title="Identitas">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <TextInput label="Nama" value={name} onChange={setName} isRequired className="sm:col-span-2" />
              <TextInput label="Kode / SKU" value={sku} onChange={setSku} placeholder="Otomatis bila kosong" />
              <SelectInput label="Kategori" value={category} onChange={setCategory} options={Object.entries(categories).map(([id, label]) => ({ id, label }))} />
              <SelectInput
                label="Satuan"
                value={uom}
                onChange={(v) => setUom(v as Uom)}
                options={(Object.keys(UOM_LABEL) as Uom[]).map((u) => ({ id: u, label: UOM_LABEL[u] }))}
                isDisabled={!!existing && db.lots.some((l) => l.itemId === existing.id)}
                description={existing && db.lots.some((l) => l.itemId === existing.id) ? "Tidak bisa diubah karena sudah ada stok." : undefined}
              />
              <SelectInput
                label="Metode biaya"
                value={costing}
                onChange={(v) => setCosting(v as CostingMethod | "default")}
                options={[
                  { id: "default", label: `Ikuti pengaturan (${COSTING_LABEL[db.settings.costingMethod]})` },
                  ...COSTING_METHODS.map((m) => ({ id: m, label: COSTING_LABEL[m] })),
                ]}
                description={costing === "default" ? "Sama dengan metode perusahaan." : COSTING_HINT[costing]}
                className="sm:col-span-2"
              />
              {!isProduct && (
                <NumberInput
                  label={`Harga standar per ${UOM_LABEL[uom]}`}
                  value={standardCost}
                  onChange={setStandardCost}
                  money
                  description="Diperbarui otomatis dari harga pembelian terakhir."
                />
              )}
            </div>
          </Section>

          {!isProduct && (
            <Section title="Stok & sisa">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <NumberInput label="Titik pesan ulang" value={reorderPoint} onChange={setReorderPoint} suffix={UOM_LABEL[uom]} description="Sistem mengingatkan bila stok bebas di bawah angka ini." />
                <div className="flex flex-col gap-3">
                  <SwitchInput isSelected={trackRemnant} onChange={setTrackRemnant} label="Lacak sisa material" description="Potongan sisa produksi disimpan sebagai lot sisa yang diprioritaskan." />
                  {trackRemnant && (
                    <NumberInput label="Ukuran sisa minimum" value={minRemnantQty} onChange={setMinRemnantQty} suffix={UOM_LABEL[uom]} description="Di bawah ini sebaiknya dianggap limbah." />
                  )}
                </div>
                <TextInput label="Satuan beli dari pemasok" value={puLabel} onChange={setPuLabel} placeholder="mis. roll, dus, ikat" description="Kosongkan bila sama dengan satuan stok." />
                <NumberInput label={`Isi per satuan beli (${UOM_LABEL[uom]})`} value={puFactor} onChange={setPuFactor} isDisabled={!puLabel.trim()} description={puLabel.trim() && puFactor ? `1 ${puLabel} = ${puFactor} ${UOM_LABEL[uom]}` : undefined} />
                <div className="sm:col-span-2">
                  <SwitchInput
                    isSelected={producible}
                    onChange={setProducible}
                    label="Diproduksi sendiri"
                    description="Komponen setengah jadi (rangka, dudukan) atau bahan olahan (kayu KD). Punya resep bahan dan bisa dibuat lewat perintah kerja."
                  />
                </div>
              </div>
            </Section>
          )}

          {hasBom && (
            <Section title="Resep bahan (BOM)" description={`Kebutuhan bahan untuk 1 ${UOM_LABEL[uom]}. Boleh berisi komponen yang juga diproduksi sendiri.`}>
              <div className="flex flex-col gap-2">
                {bom.map((b) => {
                  const m = item(b.materialId ?? undefined);
                  return (
                    <div key={b.key} className="grid grid-cols-[1fr_8rem_auto] items-end gap-2">
                      <ItemPicker kind="material" value={b.materialId} onChange={(materialId) => setBom(bom.map((x) => (x.key === b.key ? { ...x, materialId } : x)))} aria-label="Material" />
                      <NumberInput aria-label="Qty per unit" value={b.qty} onChange={(qty) => setBom(bom.map((x) => (x.key === b.key ? { ...x, qty } : x)))} suffix={m ? UOM_LABEL[m.uom] : undefined} />
                      <Button isIconOnly variant="ghost" aria-label="Hapus bahan" onPress={() => setBom(bom.filter((x) => x.key !== b.key))}>
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  );
                })}
                <div>
                  <Button size="sm" variant="tertiary" onPress={() => setBom([...bom, { key: k(), materialId: null, qty: 1 }])}>
                    <Plus className="size-4" /> Tambah bahan
                  </Button>
                </div>
                <div className="mt-2 grid grid-cols-1 gap-3 border-t border-[var(--rule)] pt-3 sm:grid-cols-[1fr_12rem]">
                  <TextInput
                    label="Rute tahapan"
                    value={stagesText}
                    onChange={setStagesText}
                    placeholder={db.settings.defaultStages.join(", ")}
                    description="Pisahkan dengan koma. Kosong = rute default di Pengaturan."
                  />
                  {!isProduct && <NumberInput label="Jam kerja standar" value={laborHours} onChange={setLaborHours} suffix="jam" />}
                </div>
              </div>
            </Section>
          )}

          {isProduct && (
            <Section title="Harga & sewa">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <NumberInput label="Jam kerja standar / unit" value={laborHours} onChange={setLaborHours} suffix="jam" />
                <NumberInput label="Harga jual" value={salePrice} onChange={setSalePrice} money />
                <NumberInput label="Tarif sewa / hari" value={rentalRate} onChange={setRentalRate} money description="Kosongkan bila tidak disewakan." />
              </div>
            </Section>
          )}

          {isProduct && (
            <Section title="Ekspor & kemasan" description="Untuk proforma invoice, packing list, dan estimasi isi kontainer.">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <TextInput label="HS Code" value={hsCode} onChange={setHsCode} placeholder="mis. 9403.60" />
                <NumberInput label="Karton per unit" value={packing.cartonsPerUnit} onChange={(cartonsPerUnit) => setPacking({ ...packing, cartonsPerUnit })} minValue={1} maximumFractionDigits={0} />
                <div />
                <NumberInput label="Panjang karton (cm)" value={packing.length} onChange={(length) => setPacking({ ...packing, length })} />
                <NumberInput label="Lebar karton (cm)" value={packing.width} onChange={(width) => setPacking({ ...packing, width })} />
                <NumberInput label="Tinggi karton (cm)" value={packing.height} onChange={(height) => setPacking({ ...packing, height })} />
                <NumberInput label="Berat kotor / unit (kg)" value={packing.grossWeightKg} onChange={(grossWeightKg) => setPacking({ ...packing, grossWeightKg })} />
                <NumberInput label="Berat bersih / unit (kg)" value={packing.netWeightKg} onChange={(netWeightKg) => setPacking({ ...packing, netWeightKg })} />
              </div>
              {cbm > 0 && <p className="mt-3 text-sm text-muted">Volume per unit ±{cbm.toLocaleString("id-ID", { maximumFractionDigits: 3 })} CBM → ±{Math.floor(68 / cbm)} unit per kontainer 40' HC.</p>}
            </Section>
          )}

          <Section title="Catatan">
            <TextAreaInput aria-label="Catatan" value={note} onChange={setNote} rows={2} />
          </Section>
        </div>

        <div className="xl:sticky xl:top-20 xl:self-start">
          <Card>
            <Card.Header>
              <Card.Title className="text-base">{hasBom ? "HPP standar" : "Ringkasan"}</Card.Title>
              {hasBom && <Card.Description>Estimasi dari BOM × harga standar + jam × (tarif + overhead).</Card.Description>}
            </Card.Header>
            <Card.Content>
              {hasBom ? (
                <>
                  <Row label="Bahan" value={formatIDR(materialCost)} />
                  <Row label="Tenaga kerja + overhead" value={formatIDR(stdCost - materialCost)} />
                  <div className="my-2 border-t border-[var(--rule)]" />
                  <Row label="HPP standar / unit" value={formatIDR(stdCost)} strong />
                  {!isProduct && standardCost > 0 && <Row label="Harga standar tercatat" value={formatIDR(standardCost)} muted />}
                  {isProduct && salePrice > 0 && (
                    <Row
                      label="Margin standar"
                      value={`${Math.round(((salePrice - stdCost) / salePrice) * 100)}%`}
                      tone={(salePrice - stdCost) / salePrice < 0.2 ? "danger" : "success"}
                    />
                  )}
                </>
              ) : (
                <>
                  <Row label="Satuan" value={UOM_LABEL[uom]} />
                  <Row label="Harga standar" value={formatIDR(standardCost)} />
                </>
              )}
            </Card.Content>
            <Card.Footer>
              <Button onPress={save} isDisabled={!name.trim()} fullWidth>
                Simpan
              </Button>
            </Card.Footer>
          </Card>
        </div>
      </div>
    </>
  );
}
