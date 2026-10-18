import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { reworkWorkbook, type RawCell } from "../fixtures/inventory/workbook-builder";

const XLSX_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

async function login(page: Page) {
  await page.goto("/admin/login");
  await page.getByLabel("Correo").fill(process.env.ADMIN_EMAIL ?? "");
  await page.getByLabel("Contraseña").fill(process.env.ADMIN_PASSWORD ?? "");
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/admin\/?$/);
}

async function downloadFile(page: Page, linkName: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: linkName }).click()]);
  return { name: download.suggestedFilename(), bytes: await readFile((await download.path()) as string) };
}

async function upload(page: Page, name: string, buffer: Buffer) {
  await page.getByLabel("Archivo de Excel").setInputFiles({ name, mimeType: XLSX_TYPE, buffer });
  await page.getByRole("button", { name: "Validar archivo" }).click();
}

const unique = () => `E2E ${Date.now()}`;

test.describe("carga masiva de inventario", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");
  test.describe.configure({ mode: "serial" });

  test("la plantilla vacía crea productos nuevos con enlace para agregar fotos", async ({ page }) => {
    await login(page);
    await page.goto("/admin/productos");
    await expect(page.getByRole("link", { name: "Carga masiva" })).toBeVisible();
    await page.getByRole("link", { name: "Carga masiva" }).click();
    await expect(page.getByRole("heading", { name: "Carga masiva de inventario" })).toBeVisible();

    const template = await downloadFile(page, "Descargar plantilla vacía");
    expect(template.name).toBe("plantilla-inventario.xlsx");

    const brand = unique();
    const filled = await reworkWorkbook(template.bytes, ({ header, rows }) => {
      // Tras la primera ejecución la plantilla ya trae la columna “Talla 4XL”.
      if (!header.includes("Talla 4XL")) header.push("Talla 4XL");
      const width = header.length;
      const sizeColumn = header.indexOf("Talla 4XL");
      const row = (color: string, quantity: number | null): RawCell[] => {
        const cells: RawCell[] = Array(width).fill(null);
        ["Pijama", "Fab E2E", brand, "Unisex", 45.5].forEach((value, offset) => (cells[1 + offset] = value));
        cells[7] = color;
        cells[sizeColumn] = quantity;
        return cells;
      };
      rows.push(row("Azul", 2), row("Rojo", null));
    });
    await upload(page, "plantilla.xlsx", filled);
    await expect(page.getByText("Productos nuevos (2)")).toBeVisible();

    await page.getByRole("button", { name: "Confirmar y aplicar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Cambios aplicados" })).toBeVisible();
    await page.getByText("Productos creados (2)").click();
    const photosLink = page.getByRole("link", { name: /Agregar fotos/ }).first();
    await photosLink.click();
    await expect(page).toHaveURL(/\/admin\/productos\/[0-9a-f-]{36}$/);
  });

  test("descarga el inventario, cambia una existencia y la aplica tras la vista previa", async ({ page }, testInfo) => {
    await login(page);
    await page.goto("/admin/productos/carga-masiva");
    const inventory = await downloadFile(page, "Descargar inventario actual");
    expect(inventory.name).toMatch(/^inventario-\d{4}-\d{2}-\d{2}\.xlsx$/);

    const edited = await reworkWorkbook(inventory.bytes, ({ header, rows }) => {
      const sizeColumns = header.map((cell, index) => (typeof cell === "string" && cell.startsWith("Talla ") ? index : -1)).filter((index) => index >= 0);
      const target = rows.find((row) => sizeColumns.some((index) => typeof row[index] === "number"))!;
      const column = sizeColumns.find((index) => typeof target[index] === "number")!;
      target[column] = (target[column] as number) + 1;
    });
    await upload(page, "inventario.xlsx", edited);
    await expect(page.getByRole("heading", { name: "3. Vista previa" })).toBeVisible();
    await expect(page.getByText("→").first()).toBeVisible();

    if (testInfo.project.name === "mobile") {
      // Sin desplazamiento horizontal ni a 320 px de ancho.
      for (const width of [390, 320]) {
        await page.setViewportSize({ width, height: 800 });
        const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
        expect(fits, `ancho ${width}`).toBe(true);
      }
    }

    await page.getByRole("button", { name: "Confirmar y aplicar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Cambios aplicados" })).toBeVisible();

    // El mismo archivo ya no tiene cambios.
    await page.getByRole("button", { name: "Hacer otra carga" }).click();
    await upload(page, "inventario.xlsx", edited);
    await expect(page.getByText("El archivo no contiene cambios respecto del inventario actual.")).toBeVisible();
  });

  test("muestra los errores con fila y columna y no permite confirmar", async ({ page }) => {
    await login(page);
    await page.goto("/admin/productos/carga-masiva");
    const inventory = await downloadFile(page, "Descargar inventario actual");
    const broken = await reworkWorkbook(inventory.bytes, ({ header, rows }) => {
      rows[0][header.indexOf("Precio")] = "$50";
      rows[0][header.indexOf("Género")] = "mujer";
    });
    await upload(page, "errores.xlsx", broken);
    const alert = page.getByRole("alert").filter({ hasText: "Corrige" });
    await expect(alert).toBeVisible();
    await expect(alert).toContainText("Columna “Precio”");
    await expect(alert).toContainText("Fila 2");
    await expect(page.getByRole("button", { name: "Confirmar y aplicar cambios" })).toHaveCount(0);
  });

  test("rechaza en el navegador archivos no .xlsx o de más de 4 MB sin enviar peticiones", async ({ page }) => {
    await login(page);
    await page.goto("/admin/productos/carga-masiva");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (request.url().includes("/api/admin/inventory/")) requests.push(request.url());
    });
    const input = page.getByLabel("Archivo de Excel");
    await input.setInputFiles({ name: "datos.csv", mimeType: "text/csv", buffer: Buffer.from("a,b") });
    await expect(page.getByRole("alert")).toContainText(".xlsx");
    await input.setInputFiles({ name: "grande.xlsx", mimeType: XLSX_TYPE, buffer: Buffer.alloc(4 * 1024 * 1024 + 1) });
    await expect(page.getByRole("alert")).toContainText("supera 4 MB");
    await expect(page.getByRole("button", { name: "Validar archivo" })).toBeDisabled();
    expect(requests).toEqual([]);
  });

  test("las rutas exigen sesión y token CSRF", async ({ page, request }) => {
    expect((await request.get("/api/admin/inventory/export")).status()).toBe(401);
    const file = { name: "a.xlsx", mimeType: XLSX_TYPE, buffer: Buffer.from("PK") };
    expect((await request.post("/api/admin/inventory/preview", { multipart: { file } })).status()).toBe(401);

    await login(page);
    const withoutCsrf = await page.request.post("/api/admin/inventory/preview", { multipart: { file } });
    expect(withoutCsrf.status()).toBe(403);
  });
});
