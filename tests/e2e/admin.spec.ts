import { test } from "@playwright/test";

test.describe("admin owner workflow", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");

  test("owner can sign in and edit a product", async ({ page }) => {
    await page.goto("/admin/login");
    await page.getByLabel("Correo").fill(process.env.ADMIN_EMAIL ?? "");
    await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "");
    await page.getByRole("button", { name: /entrar/i }).click();
    await page.getByRole("link", { name: /productos/i }).click();
    await page.getByRole("link", { name: /nuevo/i }).click();
    await page.getByRole("button", { name: /guardar/i }).click();
  });
});
