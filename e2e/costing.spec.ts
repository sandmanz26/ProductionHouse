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
  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /LIFO/ }).check();
  await expect(page.getByText(/LIFO is not/)).toBeVisible();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();
  await expect(page.getByText("Change history")).toBeVisible();
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

  await page.goto("/#/settings");
  await page.getByRole("radio", { name: /Moving average/ }).check();
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText("Settings saved")).toBeVisible();

  const after = (await readDb(page)).lots as LotRow[];
  const costs = new Set(after.filter((l) => regular(l) && l.itemId === itemId).map((l) => l.unitCost));
  expect(costs.size).toBe(1);
  expect(valueOf(after)).toBeCloseTo(valueOf(lots), -1);
});

test("issuing material shows which costing method applies", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/work-orders/${idOf(db.workOrders, "WO-0006")}`);
  await page.getByRole("button", { name: "Issue", exact: true }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/Costing method FIFO/)).toBeVisible();
});

test("HPP report compares FIFO, moving average and LIFO", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/reports");
  await page.getByRole("tab", { name: "Costing methods" }).click();
  const summary = page.getByRole("grid", { name: "Summary by method" }).or(page.getByRole("table", { name: "Summary by method" }));
  await expect(summary.getByText("As recorded")).toBeVisible();
  await expect(summary.getByText("Moving average")).toBeVisible();
  await expect(summary.getByText("not PSAK")).toBeVisible();
  await expect(summary.getByText("in use")).toBeVisible();
});
