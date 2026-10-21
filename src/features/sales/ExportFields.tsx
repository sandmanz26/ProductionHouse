import type { ContainerType, ExportInfo, Incoterm } from "@/domain";
import { INCOTERMS } from "./export-info";
import { CONTAINER_LABEL, isEuDestination } from "@/domain";
import { DateInput, SelectInput, TextInput } from "@/components/fields";

export function ExportFields({ value, onChange }: { value: ExportInfo; onChange: (v: ExportInfo) => void }) {
  const set = <K extends keyof ExportInfo>(key: K, v: ExportInfo[K]) => onChange({ ...value, [key]: v });
  const eu = isEuDestination(value.destinationCountry);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput label="Negara tujuan" value={value.destinationCountry} onChange={(v) => set("destinationCountry", v)} placeholder="mis. Belanda" />
      <SelectInput
        label="Incoterm"
        value={value.incoterm}
        onChange={(v) => set("incoterm", v as Incoterm)}
        options={INCOTERMS.map((i) => ({ id: i.id, label: i.label, description: i.description }))}
      />
      <TextInput label="Pelabuhan muat" value={value.portOfLoading} onChange={(v) => set("portOfLoading", v)} />
      <TextInput label="Pelabuhan bongkar" value={value.portOfDischarge} onChange={(v) => set("portOfDischarge", v)} />
      <SelectInput
        label="Kontainer"
        value={value.containerType}
        onChange={(v) => set("containerType", v as ContainerType)}
        options={(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((c) => ({ id: c, label: CONTAINER_LABEL[c] }))}
      />
      <DateInput label="ETD (perkiraan berangkat)" value={value.etd ?? ""} onChange={(v) => set("etd", v || undefined)} />
      <TextInput label="No. kontainer" value={value.containerNo ?? ""} onChange={(v) => set("containerNo", v)} />
      <TextInput label="No. segel" value={value.sealNo ?? ""} onChange={(v) => set("sealNo", v)} />
      <TextInput
        label="No. Dokumen V-Legal (SVLK)"
        value={value.vLegalNo ?? ""}
        onChange={(v) => set("vLegalNo", v)}
        description="Wajib untuk ekspor produk kayu dari Indonesia."
      />
      <TextInput
        label="Referensi DDS EUDR"
        value={value.eudrDdsRef ?? ""}
        onChange={(v) => set("eudrDdsRef", v)}
        description={eu ? "Tujuan Uni Eropa — dibutuhkan importir (EUDR)." : "Diisi bila tujuan Uni Eropa."}
      />
      <TextInput label="No. B/L" value={value.blNo ?? ""} onChange={(v) => set("blNo", v)} />
      <TextInput label="Shipping mark" value={value.shippingMark ?? ""} onChange={(v) => set("shippingMark", v)} />
    </div>
  );
}
