import { expect, test } from "@playwright/test";
import { freshDemo, idOf, pickOption, readDb } from "./helpers";

/** Wrong input from the screen must be refused with a clear message and leave the data as it was. */

test("welcome: an own workshop needs a name, then starts empty with first steps @mobile", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Every offcut has a price." })).toBeVisible();
  await page.getByText("My workshop").click();
  const start = page.getByRole("button", { name: "Open a new workbook" });
  await expect(start).toBeDisabled();
  await page.getByRole("textbox", { name: "Business name" }).fill("CV Tunas Jati");
  await start.click();
  await expect(page.getByText("First steps")).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.companyName).toBe("CV Tunas Jati");
  expect(db.items).toHaveLength(0);
});

test("payments: overpaying an order is refused and nothing is recorded", async ({ page }) => {
  const demo = await freshDemo(page);
  const soId = idOf(demo.sales, "SO-0003");
  await page.goto(`/#/sales/${soId}`);
  const before = (await readDb(page)).sales.find((s: { id: string }) => s.id === soId).payments.length;
  await page.getByRole("button", { name: "Record" }).click();
  const amount = page.getByRole("dialog").getByRole("textbox", { name: /Amount/ });
  await amount.fill("999999999");
  await amount.press("Tab");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/more than the balance/)).toBeVisible();
  const after = (await readDb(page)).sales.find((s: { id: string }) => s.id === soId).payments.length;
  expect(after).toBe(before);
});

test("settings: a location that still holds stock cannot be removed", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/settings");
  const field = page.getByRole("textbox", { name: "Warehouse locations (separate with commas)" });
  await field.fill("New store");
  await page.getByRole("button", { name: "Save settings" }).click();
  await expect(page.getByText(/still holds stock/)).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.locations).toContain("Main warehouse");
  expect(db.settings.locations).not.toContain("New store");
});

test("backup: a corrupted file is rejected and current data is kept", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/settings");
  const db = await readDb(page);
  const broken = structuredClone(db);
  broken.lots[0].itemId = "tidak-ada";
  await page.locator('input[type="file"]').setInputFiles({
    name: "cadangan-rusak.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "serat", data: broken })),
  });
  await expect(page.getByText(/Backup data is damaged/)).toBeVisible();
  const after = await readDb(page);
  expect(after.lots[0].itemId).toBe(db.lots[0].itemId);
});

test("sales: a draft without a customer cannot be confirmed", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/sales/new");
  await pickOption(page, "Item", "Chair", /Chair/);
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page).toHaveURL(/#\/sales\/[0-9a-f]{8}-[0-9a-f-]{27}$/);
  await expect(page.getByRole("button", { name: "Confirm order" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Choose a customer to confirm" })).toBeVisible();
});

test("unknown routes land on the branded dead end", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/tidak-ada");
  await expect(page.getByRole("heading", { name: "This page is not in the workbook." })).toBeVisible();
  await page.getByRole("button", { name: "Back to home" }).click();
  await expect(page.getByText("Needs attention")).toBeVisible();
});
