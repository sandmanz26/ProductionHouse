import { expect, test } from "@playwright/test";
import { freshDemo, idOf, readDb } from "./helpers";

test("dashboard shows metrics and the command palette jumps to a work order", async ({ page }) => {
  await freshDemo(page);
  await expect(page.getByText("Perlu tindakan")).toBeVisible();
  await expect(page.getByText("Nilai stok")).toBeVisible();
  await page.keyboard.press("Control+k");
  await page.getByRole("combobox", { name: "Cari" }).fill("PK-0005");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/#\/produksi\//);
  await expect(page.getByRole("heading", { name: "Kursi Sekar untuk Nordic Living" })).toBeVisible();
});

test("production: issue every material (remnant first) and close with HPP", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/produksi/${idOf(db.workOrders, "PK-0006")}`);
  await expect(page.getByRole("heading", { name: "Kebutuhan bahan" })).toBeVisible();
  for (let i = 0; i < 6; i++) {
    const take = page.getByRole("button", { name: "Ambil", exact: true }).first();
    if (!(await take.isVisible().catch(() => false))) break;
    await take.click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", { name: /^Ambil / }).click();
    await expect(dialog).toBeHidden();
  }
  const afterIssue = await readDb(page);
  const wo = afterIssue.workOrders.find((w: { code: string }) => w.code === "PK-0006");
  const firstLot = afterIssue.lots.find((l: { id: string }) => l.id === wo.issues[0].lotId);
  expect(firstLot.isRemnant).toBe(true);

  await page.getByRole("button", { name: "Selesaikan" }).first().click();
  await page.getByRole("button", { name: "Selesaikan & kunci HPP" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "HPP pekerjaan", exact: true })).toBeVisible();
  const done = await readDb(page);
  expect(done.workOrders.find((w: { code: string }) => w.code === "PK-0006").status).toBe("selesai");
});

test("production: piece-rate labour and partial receipt", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/produksi/${idOf(db.workOrders, "PK-0005")}`);
  await page.getByRole("button", { name: "Catat kerja" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "Borongan (per unit)" }).click();
  await dialog.getByRole("textbox", { name: "Pekerja / tim" }).fill("Bu Sri (jok)");
  await dialog.getByRole("textbox", { name: "Unit selesai" }).fill("6");
  await dialog.getByRole("textbox", { name: "Tarif per unit" }).fill("30000");
  await dialog.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Bu Sri (jok)")).toBeVisible();

  await page.getByRole("button", { name: "Terima sebagian" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Terima ke gudang" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Hasil sebagian", exact: true })).toBeVisible();
  const after = await readDb(page);
  const wo = after.workOrders.find((w: { code: string }) => w.code === "PK-0005");
  expect(wo.receipts.length).toBe(2);
  expect(wo.laborLogs.some((l: { worker: string; pieces: number }) => l.worker === "Bu Sri (jok)" && l.pieces === 6)).toBe(true);
});

test("production board advances a stage", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/produksi/papan");
  await page.getByRole("button", { name: "Majukan PK-0005" }).click();
  await expect(page.getByRole("region", { name: "Amplas" }).getByText("PK-0005")).toBeVisible();
});

test("sales: settle the balance, then close the order", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/penjualan/${idOf(db.sales, "SO-0003")}`);
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(page.getByText(/Masih ada sisa tagihan/)).toBeVisible();
  await page.getByRole("button", { name: "Catat" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Sisa piutang")).toBeVisible();
  await page.getByRole("button", { name: "Tandai selesai" }).click();
  await expect(page.locator("header").getByText("Selesai")).toBeVisible();
});

test("rental: return all units in good condition", async ({ page }) => {
  const db = await freshDemo(page);
  await page.goto(`/#/sewa/${idOf(db.rentals, "SW-0001")}`);
  await page.getByRole("button", { name: "Terima kembali" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Simpan pengembalian" }).click();
  await expect(page.locator("header").getByText("Selesai")).toBeVisible();
  await expect(page.getByText(/Denda telat/)).toBeVisible();
});

test("purchasing: timber volume calculator fills the quantity", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/pembelian/baru");
  await page.getByRole("combobox", { name: "Material" }).fill("Kayu Jati");
  await page.getByRole("option", { name: /Kayu Jati Grade A/ }).click();
  await page.getByRole("button", { name: "Hitung qty (kubikasi / satuan beli)" }).click();
  await page.getByRole("textbox", { name: "Batang" }).fill("10");
  await page.getByRole("textbox", { name: "Tebal" }).fill("5");
  await page.getByRole("textbox", { name: "Lebar" }).fill("20");
  await page.getByRole("textbox", { name: "Panjang" }).fill("3");
  await page.getByRole("textbox", { name: "Panjang" }).press("Tab");
  await expect(page.getByText("0,3 m³")).toBeVisible();
  await page.getByRole("button", { name: "Pakai sebagai qty" }).click();
  await page.getByRole("button", { name: "Simpan & terima barang" }).click();
  await expect(page).toHaveURL(/#\/pembelian\/[^b]/);
  const after = await readDb(page);
  const p = after.purchases[after.purchases.length - 1];
  expect(p.lines[0].qty).toBe(0.3);
  expect(p.status).toBe("diterima");
});

test("finance page lists overdue receivables @mobile", async ({ page }) => {
  await freshDemo(page);
  await page.goto("/#/keuangan");
  await expect(page.getByText("SO-0003")).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
