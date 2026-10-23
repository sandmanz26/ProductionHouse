import { expect, type Page } from "@playwright/test";

interface DemoDb {
  workOrders: { id: string; code: string }[];
  sales: { id: string; code: string }[];
  rentals: { id: string; code: string }[];
  purchases: { id: string; code: string }[];
  items: { id: string; sku: string }[];
}

/**
 * Starts every test from the bundled demo data and returns its record ids. The first-visit tour
 * and page tips are switched off unless `withHelp` is set (help.spec covers them).
 */
export async function freshDemo(page: Page, { withHelp = false } = {}): Promise<DemoDb> {
  await page.goto("/");
  await page.evaluate((withHelp) => {
    localStorage.clear();
    if (!withHelp) localStorage.setItem("serat:help", JSON.stringify({ state: { tourDone: true, seenTips: [], tipsOff: true }, version: 0 }));
  }, withHelp);
  await page.reload();
  await page.getByRole("button", { name: "Enter the sample workshop" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page.evaluate(() => JSON.parse(localStorage.getItem("mebelos:db")!).state.db as DemoDb);
}

export const idOf = <T extends { id: string; code: string }>(list: T[], code: string) => list.find((x) => x.code === code)!.id;

export async function readDb(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mebelos:db")!).state.db);
}

/**
 * Types into a combobox and picks an option, retrying until the field shows the choice. Under
 * load the list re-renders while it filters, and a click on a detached option selects nothing.
 */
export async function pickOption(page: Page, combobox: string, text: string, option: RegExp, nth = 0) {
  const box = page.getByRole("combobox", { name: combobox }).nth(nth);
  await expect(async () => {
    await box.fill(text);
    await page.getByRole("option", { name: option }).first().click({ timeout: 3_000 });
    await expect(box).toHaveValue(option, { timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}
