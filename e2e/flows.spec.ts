import { expect, test } from "@playwright/test";
import { freshDemo, idOf, pickOption, readDb } from "./helpers";

test("dashboard shows metrics and the command palette jumps to a work order", async ({ page }) => {
  await freshDemo(page);
  await expect(page.getByText("Needs attention")).toBeVisible();
  await expect(page.getByText("Stock value")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Search" }).fill("WO-0005");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/work-orders\//);
  await expect(page.getByRole("heading", { name: "Sekar chairs for Nordic Living" })).toBeVisible();
});

test("production: issue every material (remnant first) and close with HPP", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/work-orders/${idOf(db.workOrders, "WO-0006")}`);
  await expect(page.getByRole("heading", { name: "Material requirements" })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const take = page.getByRole("button", { name: "Issue", exact: true }).first();
    if (!(await take.isVisible().catch(() => false))) break;
    await take.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Issue / }).click();
    await expect(dialog).toBeHidden();
  }
  const afterIssue = await readDb(page);
  const wo = afterIssue.workOrders.find((w: { code: string }) => w.code === "WO-0006");
  const firstLot = afterIssue.lots.find((l: { id: string }) => l.id === wo.issues[0].lotId);
  expect(firstLot.isRemnant).toBe(true);

  await page.getByRole("button", { name: "Complete" }).first().click();
  await page.getByRole("button", { name: "Complete & lock cost" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Job cost", exact: true })).toBeVisible();
  const done = await readDb(page);
  expect(done.workOrders.find((w: { code: string }) => w.code === "WO-0006").status).toBe("selesai");
});

test("production: piece-rate labour and partial receipt", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/work-orders/${idOf(db.workOrders, "WO-0005")}`);
  await page.getByRole("button", { name: "Log labour" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Piece rate (per unit)" }).click();
  await dialog.getByRole("textbox", { name: "Worker / team" }).fill("Bu Sri (jok)");
  await dialog.getByRole("textbox", { name: "Units done" }).fill("6");
  await dialog.getByRole("textbox", { name: "Rate per unit" }).fill("30000");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Bu Sri (jok)")).toBeVisible();

  await page.getByRole("button", { name: "Receive partial" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Receive into warehouse" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Partial output", exact: true })).toBeVisible();
  const after = await readDb(page);
  const wo = after.workOrders.find((w: { code: string }) => w.code === "WO-0005");
  expect(wo.receipts.length).toBe(2);
  expect(wo.laborLogs.some((l: { worker: string; pieces: number }) => l.worker === "Bu Sri (jok)" && l.pieces === 6)).toBe(true);
});

test("production board advances a stage", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/board");
  await page.getByRole("button", { name: "Advance WO-0005" }).click();
  await expect(page.getByRole("region", { name: "Sanding" }).getByText("WO-0005")).toBeVisible();
});

test("sales: settle the balance, then close the order", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/sales/${idOf(db.sales, "SO-0003")}`);
  await page.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByText(/still unpaid/)).toBeVisible();
  await page.getByRole("button", { name: "Record" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Receivable left")).toBeVisible();
  await page.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.locator("header").getByText("Done")).toBeVisible();
});

test("rental: return all units in good condition", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/rentals/${idOf(db.rentals, "RN-0001")}`);
  await page.getByRole("button", { name: "Take back" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Save return" }).click();
  await expect(page.locator("header").getByText("Done")).toBeVisible();
  await expect(page.getByText(/Late fee/)).toBeVisible();
});

test("purchasing: timber volume calculator fills the quantity", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/purchases/new");
  await pickOption(page, "Material", "Teak Grade", /Teak Grade A/);
  await page.getByRole("button", { name: "Calculate quantity (timber volume / purchase unit)" }).click();
  await page.getByRole("textbox", { name: "Pieces" }).fill("10");
  await page.getByRole("textbox", { name: "Thickness" }).fill("5");
  await page.getByRole("textbox", { name: "Width" }).fill("20");
  await page.getByRole("textbox", { name: "Length" }).fill("3");
  await page.getByRole("textbox", { name: "Length" }).press("Tab");
  await expect(page.getByText("0.3 m³")).toBeVisible();
  await page.getByRole("button", { name: "Use as quantity" }).click();
  await page.getByRole("button", { name: "Save & receive" }).click();
  await expect(page).toHaveURL(/#\/purchases\/[0-9a-f]{8}-[0-9a-f-]{27}$/);
  const after = await readDb(page);
  const p = after.purchases[after.purchases.length - 1];
  expect(p.lines[0].qty).toBe(0.3);
  expect(p.status).toBe("diterima");
});

test("finance page lists overdue receivables @mobile", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/finance");
  await expect(page.getByText("SO-0003")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
