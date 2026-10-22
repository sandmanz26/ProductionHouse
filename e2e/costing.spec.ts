import { expect, test } from "@playwright/test";
import { freshDemo, idOf, readDb } from "./helpers";

interface LotRow {
  id: string;
  itemId: string;
  qty: number;
  unitCost: number;
  isRemnant: boolean;
  reservedForWo?: string;
  status: string;
}

const regular = (l: LotRow) => !l.isRemnant && !l.reservedForWo && l.qty > 0 && l.status === "tersedia";

test("settings: switching to LIFO warns that it is not PSAK and logs the change", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/pengaturan");
  await page.getByRole("radio", { name: /LIFO/ }).check();
  await expect(page.getByText(/LIFO tidak diakui PSAK 14/)).toBeVisible();
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan disimpan")).toBeVisible();
  await expect(page.getByText("Riwayat perubahan")).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.costingMethod).toBe("lifo");
  expect(db.settings.costingHistory).toHaveLength(1);
});

test("settings: moving average gives every regular lot of an item the same cost, value unchanged", async ({ page }) => {
  await freshDemo(page);
  const before = await readDb(page);
  const lots = before.lots as LotRow[];
  const itemId = [...new Set(lots.filter(regular).map((l) => l.itemId))].find(
    (id) => new Set(lots.filter((l) => regular(l) && l.itemId === id).map((l) => l.unitCost)).size > 1,
  );
  expect(itemId, "demo should hold an item bought at two prices").toBeTruthy();
  const valueOf = (ls: LotRow[]) => ls.filter((l) => l.itemId === itemId).reduce((a, l) => a + l.qty * l.unitCost, 0);

  await page.goto("/#/pengaturan");
  await page.getByRole("radio", { name: /Rata-rata bergerak/ }).check();
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText("Pengaturan disimpan")).toBeVisible();

  const after = (await readDb(page)).lots as LotRow[];
  const costs = new Set(after.filter((l) => regular(l) && l.itemId === itemId).map((l) => l.unitCost));
  expect(costs.size).toBe(1);
  expect(valueOf(after)).toBeCloseTo(valueOf(lots), -1);
});

test("issuing material shows which costing method applies", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/produksi/${idOf(db.workOrders, "PK-0006")}`);
  await page.getByRole("button", { name: "Ambil", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Metode biaya FIFO/)).toBeVisible();
});

test("HPP report compares FIFO, moving average and LIFO", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/laporan");
  await page.getByRole("tab", { name: "Metode biaya" }).click();
  const summary = page.getByRole("grid", { name: "Ringkasan per metode" }).or(page.getByRole("table", { name: "Ringkasan per metode" }));
  await expect(summary.getByText("Tercatat di buku")).toBeVisible();
  await expect(summary.getByText("Rata-rata bergerak")).toBeVisible();
  await expect(summary.getByText("bukan PSAK")).toBeVisible();
  await expect(summary.getByText("dipakai")).toBeVisible();
});
