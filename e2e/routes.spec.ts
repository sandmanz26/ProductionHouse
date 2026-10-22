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
  await page.goto("/#/jalur");
  // Wait for the page itself: the dashboard underneath also has buttons naming this chair.
  const picks = page.locator("section", { hasText: "Barang dengan lebih dari satu jalur" });
  await expect(page.getByRole("heading", { name: "Jalur produksi", level: 1 })).toBeVisible();
  await picks.getByRole("button", { name: /Kursi Makan Jati Sekar/ }).click();
  await expect(page).toHaveURL(new RegExp(`#/jalur/${chair.id}`));

  const map = page.getByRole("figure", { name: "Peta jalur Kursi Makan Jati Sekar" });
  await expect(map.getByRole("link", { name: /RESEP Kursi Sekar — kayu reclaimed/ })).toBeVisible();
  await expect(map.getByRole("link", { name: /Kayu Jati Reclaimed/ })).toBeVisible();
  const table = page.locator("section", { hasText: "Perbandingan jalur" });
  await expect(table.getByText("termurah")).toBeVisible();

  // Deeper: the reclaimed timber comes from dismantling, which loops back to the chair.
  await page.getByRole("radio", { name: "4 tingkat" }).click();
  await expect(map.getByLabel(/Siklus ke Kursi Makan Jati Sekar/).first()).toBeAttached();

  await map.getByRole("link", { name: /Kayu Jati Reclaimed/ }).first().click();
  const reclaimed = db.items.find((i: Item) => i.sku === "KY-JATI-RCL");
  await expect(page).toHaveURL(new RegExp(`#/jalur/${reclaimed.id}`));
  await expect(page.getByRole("heading", { name: "Kayu Jati Reclaimed (olahan)" })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test("a component that is made and also bought shows both routes and opens the right form", async ({ page }) => {
  await freshDemo(page);
  const db = await readDb(page);
  const frame = db.items.find((i: Item) => i.sku === "KMP-RGK-BAR");
  await page.goto(`/#/stok/item/${frame.id}`);
  await page.getByRole("button", { name: "Jalur produksi" }).click();
  const map = page.getByRole("figure", { name: /Peta jalur Rangka Kursi Bar/ });
  await expect(map.getByLabel(/BUAT BOM standar/)).toBeAttached();
  await expect(map.getByLabel(/BELI Beli · UD Rangka Kudus/)).toBeAttached();
  await page.getByRole("button", { name: "Beli", exact: true }).click();
  await expect(page).toHaveURL(/#\/pembelian\/baru\?barang=/);
  await expect(page.getByRole("combobox", { name: "Material" }).first()).toHaveValue(/Rangka Kursi Bar/);
});
