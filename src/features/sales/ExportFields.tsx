import type { ContainerType, ExportInfo, Incoterm } from "@/domain";
import { INCOTERMS } from "./export-info";
import { CONTAINER_LABEL, isEuDestination } from "@/domain";
import { DateInput, SelectInput, TextInput } from "@/components/fields";

export function ExportFields({ value, onChange }: { value: ExportInfo; onChange: (v: ExportInfo) => void }) {
  const set = <K extends keyof ExportInfo>(key: K, v: ExportInfo[K]) => onChange({ ...value, [key]: v });
  const eu = isEuDestination(value.destinationCountry);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <TextInput label="Destination country" value={value.destinationCountry} onChange={(v) => set("destinationCountry", v)} placeholder="e.g. Netherlands" />
      <SelectInput
        label="Incoterm"
        value={value.incoterm}
        onChange={(v) => set("incoterm", v as Incoterm)}
        options={INCOTERMS.map((i) => ({ id: i.id, label: i.label, description: i.description }))}
      />
      <TextInput label="Port of loading" value={value.portOfLoading} onChange={(v) => set("portOfLoading", v)} />
      <TextInput label="Port of discharge" value={value.portOfDischarge} onChange={(v) => set("portOfDischarge", v)} />
      <SelectInput
        label="Container"
        value={value.containerType}
        onChange={(v) => set("containerType", v as ContainerType)}
        options={(Object.keys(CONTAINER_LABEL) as ContainerType[]).map((c) => ({ id: c, label: CONTAINER_LABEL[c] }))}
      />
      <DateInput label="ETD (estimated departure)" value={value.etd ?? ""} onChange={(v) => set("etd", v || undefined)} />
      <TextInput label="Container no." value={value.containerNo ?? ""} onChange={(v) => set("containerNo", v)} />
      <TextInput label="Seal no." value={value.sealNo ?? ""} onChange={(v) => set("sealNo", v)} />
      <TextInput
        label="V-Legal (SVLK) licence no."
        value={value.vLegalNo ?? ""}
        onChange={(v) => set("vLegalNo", v)}
        description="Required to export wood products from Indonesia."
      />
      <TextInput
        label="EUDR DDS reference"
        value={value.eudrDdsRef ?? ""}
        onChange={(v) => set("eudrDdsRef", v)}
        description={eu ? "EU destination — the importer needs it (EUDR)." : "Fill in for EU destinations."}
      />
      <TextInput label="B/L no." value={value.blNo ?? ""} onChange={(v) => set("blNo", v)} />
      <TextInput label="Shipping mark" value={value.shippingMark ?? ""} onChange={(v) => set("shippingMark", v)} />
    </div>
  );
}
