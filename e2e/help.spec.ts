import { expect, test } from "@playwright/test";
import { freshDemo } from "./helpers";

test("first visit: the tour introduces the workshop, then page tips and help explain each page @mobile", async ({ page }) => {
  await freshDemo(page, { withHelp: true });
  const tour = page.getByRole("dialog", { name: "Introduction to Serat" });
  await expect(tour).toBeVisible();
  await expect(tour.getByText("1/6")).toBeVisible();
  for (let i = 0; i < 5; i++) await tour.getByRole("button", { name: /^Next/ }).click();
  await tour.getByRole("button", { name: "Start working" }).click();
  await expect(tour).toBeHidden();

  // The tour does not come back after a reload.
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(tour).toBeHidden();

  // Each page has a one-time tip that opens its guide.
  await page.goto("/#/work-orders");
  const tip = page.getByRole("complementary", { name: "Tip for this page" });
  await expect(tip).toContainText("one job on the shop floor");
  await tip.getByRole("button", { name: "Show me how" }).click();
  const panel = page.getByRole("dialog", { name: "How this page works" });
  await expect(panel.getByRole("heading", { name: "Work orders" })).toBeVisible();
  await expect(panel.getByText("What it changes elsewhere")).toBeVisible();
  await panel.getByRole("button", { name: "Open the full Help" }).click();

  await expect(page).toHaveURL(/#\/help#work-orders/);
  await expect(page.getByRole("button", { name: /Work orders/, expanded: true })).toBeVisible();
  await expect(tip).toBeHidden();
});

test("help page: the workshop map opens a guide and the glossary is searchable", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/help");
  await expect(page.getByRole("img", { name: /How Serat works/ })).toBeVisible();
  await page.getByRole("link", { name: /Offcuts: back to stock/ }).click();
  await expect(page.getByRole("button", { name: /^Offcuts/, expanded: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Search the glossary" }).fill("freight");
  await expect(page.getByText("Purchase price plus a share of freight and unloading.")).toBeVisible();
  await expect(page.getByText("Money customers still owe you.")).toBeHidden();
  await page.getByRole("button", { name: "Take the tour" }).click();
  await expect(page.getByRole("dialog", { name: "Introduction to Serat" })).toBeVisible();
});

test("tables sort by a column and filter by search", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/items");
  const table = page.getByRole("grid").first();
  await expect(table).toBeVisible();
  const search = page.getByRole("search", { name: /Search/ }).getByRole("textbox").or(page.getByRole("search", { name: /Search/ }).getByRole("searchbox")).first();
  await search.fill("teak");
  await expect(page.getByText(/of \d+/).first()).toBeVisible();
  const rows = table.getByRole("row");
  const count = await rows.count();
  for (let i = 1; i < count; i++) await expect(rows.nth(i)).toContainText(/teak/i);

  // Sorting by a money column puts the dearest first on the second click.
  await search.fill("");
  const header = table.getByRole("columnheader", { name: /Standard cost/ });
  await header.click();
  await expect(header).toHaveAttribute("aria-sort", "ascending");
  await header.click();
  await expect(header).toHaveAttribute("aria-sort", "descending");
  const money = async (i: number) => Number((await rows.nth(i).getByText(/^Rp/).first().innerText()).replace(/[^0-9]/g, ""));
  expect(await money(1)).toBeGreaterThanOrEqual(await money(2));
});
