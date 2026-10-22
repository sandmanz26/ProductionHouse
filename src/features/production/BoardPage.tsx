import { Button, Link } from "@heroui/react";
import { ChevronRight } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router";
import { currentStage, getWorkOrder, setStageStatus, stageBoard, startWorkOrder, today } from "@/domain";
import { Code, EmptyBlock, PageHeader } from "@/components/ui";
import { formatDate } from "@/lib/format";
import { useDb, useRun } from "@/store/db-store";

/** Shop-floor board: every open work order sits in the column of its current stage. */
export default function BoardPage() {
  const db = useDb();
  const run = useRun();
  const navigate = useNavigate();
  const t = today();
  const columns = useMemo(() => stageBoard(db, t), [db, t]);
  const total = columns.reduce((a, c) => a + c.workOrders.length, 0);

  const advance = (woId: string) =>
    run((d) => {
      const wo = getWorkOrder(d, woId);
      if (wo.status === "rencana") return startWorkOrder(d, woId) && "mulai dikerjakan";
      const stage = currentStage(wo);
      if (!stage) return "siap ditutup";
      setStageStatus(d, woId, stage.id, "selesai");
      return `${stage.name} selesai`;
    }, (msg) => `${getWorkOrder(db, woId).code}: ${msg}`);

  return (
    <>
      <PageHeader
        title="Papan produksi"
        description={`${total} pekerjaan aktif. Geser ke tahap berikutnya langsung dari sini.`}
        actions={<Button onPress={() => navigate("/produksi/baru")}>Perintah kerja</Button>}
      />
      {total === 0 ? (
        <EmptyBlock title="Lantai produksi kosong" description="Perintah kerja yang sedang berjalan muncul di sini per tahap." />
      ) : (
        <div className="-mx-4 overflow-x-auto px-4 pb-2 lg:-mx-8 lg:px-8">
          <div className="flex min-w-max gap-3 max-sm:min-w-0 max-sm:flex-col">
            {columns.map((c) => (
              <section key={c.name} aria-label={c.name} className="flex w-64 shrink-0 flex-col rounded-md bg-default/40 max-sm:w-full">
                <header className="flex items-center justify-between px-3 py-2">
                  <h2 className="text-[13px] font-semibold">{c.name}</h2>
                  <span className="num text-xs text-muted">{c.workOrders.length}</span>
                </header>
                <ul className="flex flex-col gap-2 px-2 pb-2">
                  {c.workOrders.length === 0 && <li className="px-1 py-3 text-xs text-muted">Kosong</li>}
                  {c.workOrders.map((w) => {
                    const wo = db.workOrders.find((x) => x.id === w.id)!;
                    const done = wo.stages.filter((s) => s.status === "selesai").length;
                    return (
                      <li key={w.id} className="rounded-sm bg-surface p-2.5 shadow-[var(--surface-shadow)]">
                        <div className="flex items-baseline justify-between gap-2">
                          <Link href={`/produksi/${w.id}`}>
                            <Code>{w.code}</Code>
                          </Link>
                          <span className={`num text-[11px] ${w.late ? "font-semibold text-danger" : "text-muted"}`}>{w.dueDate ? formatDate(w.dueDate) : ""}</span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[13px]">{w.title}</p>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="num text-[11px] text-muted">
                            {done}/{wo.stages.length} tahap
                          </span>
                          {c.name !== "Siap ditutup" ? (
                            <Button size="sm" variant="ghost" onPress={() => advance(w.id)} aria-label={`Majukan ${w.code}`}>
                              {wo.status === "rencana" ? "Mulai" : "Selesai"} <ChevronRight className="size-3.5" />
                            </Button>
                          ) : (
                            <Button size="sm" variant="secondary" onPress={() => navigate(`/produksi/${w.id}`)}>
                              Tutup & HPP
                            </Button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
