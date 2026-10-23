import { expect, test } from "@playwright/test";
import { freshDemo, pickOption, readDb } from "./helpers";

interface Row {
  id: string;
  code: string;
}

test("a merge recipe becomes a work order with its own process map", async ({ page }) => {
  await freshDemo(page);
  const db = await readDb(page);
  const recipe = db.recipes.find((r: Row & { name: string }) => r.name.startsWith("Sekar Dining Set"));
  await page.goto(`/#/recipes/${recipe.id}`);
  await expect(page.getByRole("figure", { name: /Recipe map/ })).toBeVisible();
  await page.getByRole("button", { name: "Create work order" }).click();
  await expect(page.getByRole("button", { name: "Clear recipe" })).toBeVisible();
  const batch = page.getByRole("textbox", { name: "Batch" });
  await batch.fill("2");
  await batch.press("Tab");
  await page.getByRole("button", { name: "Save work order" }).click();
  await expect(page.getByRole("heading", { name: "Process map" })).toBeVisible();
  const after = await readDb(page);
  const wo = after.workOrders.at(-1);
  expect(wo).toMatchObject({ type: "gabung", recipeId: recipe.id, batches: 2 });
  expect(wo.plannedInputs.find((i: { itemId: string }) => i.itemId === recipe.inputs[1].itemId).qty).toBe(12);
});

test("writing a recipe shows its cost and map before it is saved", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/recipes/new");
  await page.getByRole("textbox", { name: "Recipe name" }).fill("Plywood wall shelf");
  await pickOption(page, "Item", "Plywood", /Plywood 18mm/, 0);
  await pickOption(page, "Item", "Bench", /Accent Bench/, 1);
  await expect(page.getByRole("figure", { name: "Recipe map preview" })).toBeVisible();
  await page.getByRole("button", { name: "Save recipe" }).click();
  await expect(page.getByRole("heading", { name: "Plywood wall shelf" })).toBeVisible();
  const db = await readDb(page);
  expect(db.recipes.at(-1)).toMatchObject({ name: "Plywood wall shelf", type: "produksi" });
});

test("offcut lots merge into one, and the merged lot traces back to both", async ({ page }) => {
  await freshDemo(page);
  const before = await readDb(page);
  const ply = before.items.find((i: { name: string }) => i.name.startsWith("Plywood"));
  await page.goto(`/#/stock/items/${ply.id}`);
  await page.getByRole("button", { name: "Merge lots" }).click();
  const dialog = page.getByRole("dialog");
  const offcuts = dialog.getByRole("checkbox");
  const labels = dialog.locator("label", { hasText: "· offcut" });
  await expect(labels.first()).toBeVisible();
  expect(await labels.count()).toBeGreaterThanOrEqual(2);
  await labels.nth(0).getByRole("checkbox").check();
  await labels.nth(1).getByRole("checkbox").check();
  expect(await offcuts.count()).toBeGreaterThanOrEqual(2);
  await dialog.getByRole("button", { name: /^Merge 2 lots/ }).click();
  await expect(dialog).toBeHidden();
  const after = await readDb(page);
  const merged = after.lots.at(-1);
  expect(merged).toMatchObject({ itemId: ply.id, origin: "gabung", isRemnant: true });
  expect(merged.mergedFrom).toHaveLength(2);

  await page.getByRole("link", { name: `Trace ${merged.code}` }).click();
  await expect(page.getByRole("heading", { name: "Origin & destination" })).toBeVisible();
  await expect(page.getByRole("figure", { name: `Trace ${merged.code}` })).toBeVisible();
});

test("the workshop map has a table view with the same flows", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/flow-map");
  await page.getByRole("radio", { name: "All" }).click();
  const figure = page.getByRole("figure", { name: "Workshop flow map" });
  await expect(figure.getByRole("img")).toBeVisible();
  await figure.getByRole("button", { name: "Table" }).click();
  await expect(figure.getByRole("cell", { name: "Material store" }).first()).toBeVisible();
  await expect(figure.getByRole("cell", { name: "Production" }).first()).toBeVisible();
});
