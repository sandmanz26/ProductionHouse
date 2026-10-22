import { expect, test } from "@playwright/test";
import { freshDemo, idOf, readDb } from "./helpers";

/** Wrong input from the screen must be refused with a clear message and leave the data as it was. */

test("welcome: an own workshop needs a name, then starts empty with first steps @mobile", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByRole("heading", { name: "Setiap potongan punya harga." })).toBeVisible();
  await page.getByText("Bengkel saya").click();
  const start = page.getByRole("button", { name: "Buka buku kerja baru" });
  await expect(start).toBeDisabled();
  await page.getByRole("textbox", { name: "Nama usaha" }).fill("CV Tunas Jati");
  await start.click();
  await expect(page.getByText("Langkah pertama")).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.companyName).toBe("CV Tunas Jati");
  expect(db.items).toHaveLength(0);
});

test("payments: overpaying an order is refused and nothing is recorded", async ({ page }) => {
  const demo = await freshDemo(page);
  const soId = idOf(demo.sales, "SO-0003");
  await page.goto(`/#/penjualan/${soId}`);
  const before = (await readDb(page)).sales.find((s: { id: string }) => s.id === soId).payments.length;
  await page.getByRole("button", { name: "Catat" }).click();
  const amount = page.getByRole("dialog").getByRole("textbox", { name: /Jumlah/ });
  await amount.fill("999999999");
  await amount.press("Tab");
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText(/melebihi sisa tagihan/)).toBeVisible();
  const after = (await readDb(page)).sales.find((s: { id: string }) => s.id === soId).payments.length;
  expect(after).toBe(before);
});

test("settings: a location that still holds stock cannot be removed", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/pengaturan");
  const field = page.getByRole("textbox", { name: "Lokasi gudang (pisahkan dengan koma)" });
  await field.fill("Gudang Baru");
  await page.getByRole("button", { name: "Simpan pengaturan" }).click();
  await expect(page.getByText(/masih ada stok/)).toBeVisible();
  const db = await readDb(page);
  expect(db.settings.locations).toContain("Gudang Utama");
  expect(db.settings.locations).not.toContain("Gudang Baru");
});

test("backup: a corrupted file is rejected and current data is kept", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/pengaturan");
  const db = await readDb(page);
  const broken = structuredClone(db);
  broken.lots[0].itemId = "tidak-ada";
  await page.locator('input[type="file"]').setInputFiles({
    name: "cadangan-rusak.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ app: "serat", data: broken })),
  });
  await expect(page.getByText(/rusak dan tidak dimuat/)).toBeVisible();
  const after = await readDb(page);
  expect(after.lots[0].itemId).toBe(db.lots[0].itemId);
});

test("sales: a draft without a customer cannot be confirmed", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/penjualan/baru");
  await page.getByRole("combobox", { name: "Barang" }).first().fill("Kursi");
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Simpan order" }).click();
  await expect(page).toHaveURL(/#\/penjualan\/[^b]/);
  await expect(page.getByRole("button", { name: "Konfirmasi order" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Pilih pelanggan untuk konfirmasi" })).toBeVisible();
});

test("unknown routes land on the branded dead end", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/tidak-ada");
  await expect(page.getByRole("heading", { name: "Halaman ini tidak ada di buku kerja." })).toBeVisible();
  await page.getByRole("button", { name: "Kembali ke beranda" }).click();
  await expect(page.getByText("Perlu tindakan")).toBeVisible();
});
