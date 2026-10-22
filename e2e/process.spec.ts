import { expect, test } from "@playwright/test";
import { freshDemo, pickOption, readDb } from "./helpers";

interface Row {
  id: string;
  code: string;
}

test("a merge recipe becomes a work order with its own process map", async ({ page }) => {
  await freshDemo(page);
  const db = await readDb(page);
  const recipe = db.recipes.find((r: Row & { name: string }) => r.name.startsWith("Set Makan"));
  await page.goto(`/#/resep/${recipe.id}`);
  await expect(page.getByRole("figure", { name: /Peta resep/ })).toBeVisible();
  await page.getByRole("button", { name: "Buat perintah kerja" }).click();
  await expect(page.getByRole("button", { name: "Lepas resep" })).toBeVisible();
  const batch = page.getByRole("textbox", { name: "Batch" });
  await batch.fill("2");
  await batch.press("Tab");
  await page.getByRole("button", { name: "Simpan perintah kerja" }).click();
  await expect(page.getByRole("heading", { name: "Peta proses" })).toBeVisible();
  const after = await readDb(page);
  const wo = after.workOrders.at(-1);
  expect(wo).toMatchObject({ type: "gabung", recipeId: recipe.id, batches: 2 });
  expect(wo.plannedInputs.find((i: { itemId: string }) => i.itemId === recipe.inputs[1].itemId).qty).toBe(12);
});

test("writing a recipe shows its cost and map before it is saved", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/resep/baru");
  await page.getByRole("textbox", { name: "Nama resep" }).fill("Rak dinding dari plywood");
  await pickOption(page, "Barang", "Plywood", /Plywood 18mm/, 0);
  await pickOption(page, "Barang", "Bangku", /Bangku Dekor/, 1);
  await expect(page.getByRole("figure", { name: "Pratinjau peta resep" })).toBeVisible();
  await page.getByRole("button", { name: "Simpan resep" }).click();
  await expect(page.getByRole("heading", { name: "Rak dinding dari plywood" })).toBeVisible();
  const db = await readDb(page);
  expect(db.recipes.at(-1)).toMatchObject({ name: "Rak dinding dari plywood", type: "produksi" });
});

test("offcut lots merge into one, and the merged lot traces back to both", async ({ page }) => {
  await freshDemo(page);
  const before = await readDb(page);
  const ply = before.items.find((i: { name: string }) => i.name.startsWith("Plywood"));
  await page.goto(`/#/stok/item/${ply.id}`);
  await page.getByRole("button", { name: "Gabung lot" }).click();
  const dialog = page.getByRole("dialog");
  const offcuts = dialog.getByRole("checkbox");
  const labels = dialog.locator("label", { hasText: "sisa" });
  await expect(labels.first()).toBeVisible();
  expect(await labels.count()).toBeGreaterThanOrEqual(2);
  await labels.nth(0).getByRole("checkbox").check();
  await labels.nth(1).getByRole("checkbox").check();
  expect(await offcuts.count()).toBeGreaterThanOrEqual(2);
  await dialog.getByRole("button", { name: /^Gabung 2 lot/ }).click();
  await expect(dialog).toBeHidden();
  const after = await readDb(page);
  const merged = after.lots.at(-1);
  expect(merged).toMatchObject({ itemId: ply.id, origin: "gabung", isRemnant: true });
  expect(merged.mergedFrom).toHaveLength(2);

  await page.getByRole("link", { name: `Telusuri ${merged.code}` }).click();
  await expect(page.getByRole("heading", { name: "Asal-usul & tujuan" })).toBeVisible();
  await expect(page.getByRole("figure", { name: `Telusur ${merged.code}` })).toBeVisible();
});

test("the workshop map has a table view with the same flows", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/peta");
  await page.getByRole("radio", { name: "Semua" }).click();
  const figure = page.getByRole("figure", { name: "Peta alur bengkel" });
  await expect(figure.getByRole("img")).toBeVisible();
  await figure.getByRole("button", { name: "Tabel" }).click();
  await expect(figure.getByRole("cell", { name: "Gudang bahan" }).first()).toBeVisible();
  await expect(figure.getByRole("cell", { name: "Produksi" }).first()).toBeVisible();
});
