import { Button, Tabs, type Key } from "@heroui/react";
import { Printer } from "lucide-react";
import { useState } from "react";
import { useParams } from "react-router";
import { CONTAINER_LABEL, packingList, salesTotals, type SalesOrder } from "@/domain";
import { RecordNotFound } from "@/components/NotFound";
import { PageHeader } from "@/components/ui";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { useDb, useLookups } from "@/store/db-store";

type Doc = "proforma" | "packing";

export default function ExportDocsPage() {
  const { id } = useParams();
  const db = useDb();
  const [doc, setDoc] = useState<Doc>("proforma");
  const so = db.sales.find((s) => s.id === id);
  if (!so) return <RecordNotFound what="Order" back="/penjualan" />;

  return (
    <>
      <div className="print:hidden">
        <PageHeader
          back={`/penjualan/${so.id}`}
          title={`Dokumen ${so.code}`}
          description="Dokumen dalam bahasa Inggris untuk buyer luar negeri. Cetak atau simpan sebagai PDF dari dialog cetak browser."
          actions={
            <Button onPress={() => window.print()}>
              <Printer className="size-4" /> Cetak / PDF
            </Button>
          }
        />
        <Tabs selectedKey={doc} onSelectionChange={(k: Key) => setDoc(k as Doc)} className="mb-4">
          <Tabs.ListContainer>
            <Tabs.List aria-label="Jenis dokumen">
              <Tabs.Tab id="proforma">
                Proforma Invoice
                <Tabs.Indicator />
              </Tabs.Tab>
              <Tabs.Tab id="packing">
                Packing List
                <Tabs.Indicator />
              </Tabs.Tab>
            </Tabs.List>
          </Tabs.ListContainer>
        </Tabs>
      </div>
      <div className="print-sheet mx-auto max-w-4xl overflow-x-auto rounded-2xl border border-separator bg-white p-6 text-[13px] text-neutral-900 shadow-sm sm:p-10">
        {doc === "proforma" ? <Proforma so={so} /> : <Packing so={so} />}
      </div>
    </>
  );
}

function DocHeader({ title, so }: { title: string; so: SalesOrder }) {
  const db = useDb();
  const { partners } = useLookups();
  const s = db.settings;
  const buyer = so.customerId ? partners.get(so.customerId) : undefined;
  const e = so.export;
  return (
    <>
      <div className="flex flex-col justify-between gap-4 border-b border-neutral-300 pb-4 sm:flex-row">
        <div>
          <p className="text-lg font-bold">{s.companyName}</p>
          <p className="text-neutral-600">{s.companyAddress}</p>
          <p className="text-neutral-600">{[s.companyPhone, s.companyEmail].filter(Boolean).join(" · ")}</p>
          {s.npwp && <p className="text-neutral-600">NPWP {s.npwp}</p>}
        </div>
        <div className="sm:text-right">
          <p className="text-xl font-bold tracking-wide uppercase">{title}</p>
          <p>No. {so.code}</p>
          <p>Date {formatDate(so.date)}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 border-b border-neutral-300 py-4 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold text-neutral-500 uppercase">Buyer / Consignee</p>
          <p className="font-semibold">{buyer?.name ?? "—"}</p>
          <p className="text-neutral-600">{buyer?.address}</p>
          <p className="text-neutral-600">{buyer?.country}</p>
          {buyer?.contact && <p className="text-neutral-600">Attn. {buyer.contact}</p>}
        </div>
        {e && (
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <Field k="Incoterm" v={`${e.incoterm} ${e.incoterm === "FOB" || e.incoterm === "FCA" ? e.portOfLoading : e.portOfDischarge}`} />
            <Field k="Container" v={CONTAINER_LABEL[e.containerType]} />
            <Field k="Port of loading" v={e.portOfLoading} />
            <Field k="Port of discharge" v={e.portOfDischarge} />
            <Field k="Destination" v={e.destinationCountry} />
            <Field k="ETD" v={formatDate(e.etd)} />
            <Field k="V-Legal No." v={e.vLegalNo || "—"} />
            <Field k="EUDR DDS ref." v={e.eudrDdsRef || "—"} />
          </div>
        )}
      </div>
    </>
  );
}

function Field({ k, v }: { k: string; v?: string }) {
  return (
    <div>
      <p className="text-[11px] text-neutral-500">{k}</p>
      <p className="font-medium">{v || "—"}</p>
    </div>
  );
}

function Proforma({ so }: { so: SalesOrder }) {
  const db = useDb();
  const { item } = useLookups();
  const t = salesTotals(db, so);
  return (
    <>
      <DocHeader title="Proforma Invoice" so={so} />
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-400 text-left text-[11px] text-neutral-500 uppercase">
            <th className="py-2 pr-2">No</th>
            <th className="py-2 pr-2">Code</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2">HS Code</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Unit price</th>
            <th className="py-2 text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          {so.lines.map((l, i) => {
            const it = item(l.itemId);
            return (
              <tr key={l.id} className="border-b border-neutral-200">
                <td className="py-2 pr-2">{i + 1}</td>
                <td className="py-2 pr-2">{it?.sku}</td>
                <td className="py-2 pr-2">{it?.name}</td>
                <td className="py-2 pr-2">{it?.hsCode ?? "—"}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(l.qty)} pcs</td>
                <td className="py-2 pr-2 text-right tabular-nums">{formatMoney(l.unitPrice, so.currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatMoney(l.qty * l.unitPrice, so.currency)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6} className="pt-3 pr-2 text-right">Subtotal</td>
            <td className="pt-3 text-right tabular-nums">{formatMoney(t.subtotal, so.currency)}</td>
          </tr>
          {so.discount > 0 && (
            <tr>
              <td colSpan={6} className="pr-2 text-right">Discount</td>
              <td className="text-right tabular-nums">− {formatMoney(so.discount, so.currency)}</td>
            </tr>
          )}
          {so.shippingCharge > 0 && (
            <tr>
              <td colSpan={6} className="pr-2 text-right">Freight</td>
              <td className="text-right tabular-nums">{formatMoney(so.shippingCharge, so.currency)}</td>
            </tr>
          )}
          <tr className="font-bold">
            <td colSpan={6} className="pt-1 pr-2 text-right">TOTAL {so.currency}</td>
            <td className="pt-1 text-right tabular-nums">{formatMoney(t.total, so.currency)}</td>
          </tr>
        </tfoot>
      </table>
      <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="text-neutral-600">
          <p className="font-semibold text-neutral-900">Terms</p>
          <p>Payment: 30% deposit, 70% against copy of B/L.</p>
          <p>Validity: 30 days from date of issue.</p>
          <p>All wood products are SVLK-certified (Indonesian Timber Legality Assurance System).</p>
        </div>
        <div className="sm:text-right">
          <p className="mb-16">Authorized signature</p>
          <p className="font-semibold">{db.settings.companyName}</p>
        </div>
      </div>
    </>
  );
}

function Packing({ so }: { so: SalesOrder }) {
  const db = useDb();
  const pl = packingList(db, so);
  return (
    <>
      <DocHeader title="Packing List" so={so} />
      {so.export?.shippingMark && (
        <p className="mt-3">
          <span className="text-neutral-500">Shipping mark:</span> <b>{so.export.shippingMark}</b>
          {so.export.containerNo && ` · Container ${so.export.containerNo}`}
          {so.export.sealNo && ` · Seal ${so.export.sealNo}`}
        </p>
      )}
      <table className="mt-4 w-full border-collapse">
        <thead>
          <tr className="border-b border-neutral-400 text-left text-[11px] text-neutral-500 uppercase">
            <th className="py-2 pr-2">Code</th>
            <th className="py-2 pr-2">Description</th>
            <th className="py-2 pr-2 text-right">Qty</th>
            <th className="py-2 pr-2 text-right">Cartons</th>
            <th className="py-2 pr-2 text-right">N.W. (kg)</th>
            <th className="py-2 pr-2 text-right">G.W. (kg)</th>
            <th className="py-2 text-right">CBM</th>
          </tr>
        </thead>
        <tbody>
          {pl.rows.map((r) => (
            <tr key={r.itemId} className="border-b border-neutral-200">
              <td className="py-2 pr-2">{r.sku}</td>
              <td className="py-2 pr-2">
                {r.name}
                {r.missingSpec && <span className="ml-1 text-red-600 print:hidden">(data kemasan kosong)</span>}
              </td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(r.qty)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(r.cartons)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(r.netKg, 1)}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{formatNumber(r.grossKg, 1)}</td>
              <td className="py-2 text-right tabular-nums">{formatNumber(r.cbm, 3)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-bold">
            <td colSpan={2} className="pt-3 pr-2 text-right">TOTAL</td>
            <td className="pt-3 pr-2 text-right tabular-nums">{formatNumber(pl.totals.qty)}</td>
            <td className="pt-3 pr-2 text-right tabular-nums">{formatNumber(pl.totals.cartons)}</td>
            <td className="pt-3 pr-2 text-right tabular-nums">{formatNumber(pl.totals.netKg, 1)}</td>
            <td className="pt-3 pr-2 text-right tabular-nums">{formatNumber(pl.totals.grossKg, 1)}</td>
            <td className="pt-3 text-right tabular-nums">{formatNumber(pl.totals.cbm, 3)}</td>
          </tr>
        </tfoot>
      </table>
      {pl.capacity > 0 && (
        <p className="mt-4 text-neutral-600">
          Estimated container utilisation: {formatNumber(pl.fill * 100, 0)}% of ±{pl.capacity} CBM.
        </p>
      )}
    </>
  );
}
