import { expect, test } from "@playwright/test";
import { freshDemo, readDb } from "./helpers";

interface Item {
  id: string;
  sku: string;
  name: string;
}

test("one click on an item shows every route to it, and clicking an input re-centres the map @mobile", async ({ page }) => {
  await freshDemo(page);
  const db = await readDb(page);
  const chair = db.items.find((i: Item) => i.sku === "KRS-SEKAR");
  await page.goto("/#/routes");
  // Wait for the page itself: the dashboard underneath also has buttons naming this chair.
  const picks = page.locator("section", { hasText: "Items with more than one route" });
  await expect(page.getByRole("heading", { name: "Production routes", level: 1 })).toBeVisible();
  await picks.getByRole("button", { name: /Sekar Teak Dining Chair/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/routes/${chair.id}`));

  const map = page.getByRole("figure", { name: "Route map Sekar Teak Dining Chair" });
  await expect(map.getByRole("link", { name: /RECIPE Sekar Chair — reclaimed teak/ })).toBeVisible();
  await expect(map.getByRole("link", { name: /Reclaimed Teak \(processed\)/ })).toBeVisible();
  const table = page.locator("section", { hasText: "Route comparison" });
  await expect(table.getByText("cheapest")).toBeVisible();

  // Deeper: the reclaimed timber comes from dismantling, which loops back to the chair.
  await page.getByRole("radio", { name: "4 levels" }).click();
  await expect(map.getByLabel(/Sekar Teak Dining Chair/).first()).toBeAttached();

  await map.getByRole("link", { name: /Reclaimed Teak \(processed\)/ }).first().click();
  const reclaimed = db.items.find((i: Item) => i.sku === "KY-JATI-RCL");
  await expect(page).toHaveURL(new RegExp(`#/routes/${reclaimed.id}`));
  await expect(page.getByRole("heading", { name: "Reclaimed Teak (processed)" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a component that is made and also bought shows both routes and opens the right form", async ({ page }) => {
  await freshDemo(page);
  const db = await readDb(page);
  const frame = db.items.find((i: Item) => i.sku === "KMP-RGK-BAR");
  await page.goto(`/#/stock/items/${frame.id}`);
  await page.getByRole("button", { name: "Production routes" }).click();
  const map = page.getByRole("figure", { name: /Route map Bar Stool Frame/ });
  await expect(map.getByLabel(/MAKE Standard BOM/)).toBeAttached();
  await expect(map.getByLabel(/BUY Buy · UD Rangka Kudus/)).toBeAttached();
  await page.getByRole("button", { name: "Buy", exact: true }).click();
  await expect(page).toHaveURL(/#\/purchases\/new\?item=/);
  await expect(page.getByRole("combobox", { name: "Material" }).first()).toHaveValue(/Bar Stool Frame/);
});
