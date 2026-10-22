import { expect, type Page } from "@playwright/test";

interface DemoDb {
  workOrders: { id: string; code: string }[];
  sales: { id: string; code: string }[];
  rentals: { id: string; code: string }[];
  purchases: { id: string; code: string }[];
  items: { id: string; sku: string }[];
}

/** Starts every test from the bundled demo data and returns its record ids. */
export async function freshDemo(page: Page): Promise<DemoDb> {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole("button", { name: "Masuk ke bengkel contoh" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  return page.evaluate(() => JSON.parse(localStorage.getItem("mebelos:db")!).state.db as DemoDb);
}

export const idOf = <T extends { id: string; code: string }>(list: T[], code: string) => list.find((x) => x.code === code)!.id;

export async function readDb(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("mebelos:db")!).state.db);
}
