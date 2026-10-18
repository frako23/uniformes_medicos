import { expect, test, type Page } from "@playwright/test";
import { downloadFile, login, uniquePhone, uploadWorkbook } from "./helpers/admin";
import { buildWorkbookBuffer } from "../fixtures/bulk/workbook-builder";

async function createClient(page: Page, name: string, phone = uniquePhone()) {
  await page.goto("/admin/clientes/nuevo");
  await page.getByLabel("Nombre").fill(name);
  await page.getByLabel("Celular").fill(phone);
  await page.getByRole("button", { name: "Guardar cliente" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
  return page.url().replace(/\?.*$/, "");
}

test.describe("pagos financiados", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");
  test.describe.configure({ mode: "serial" });

  test("US3: registrar un financiamiento con su calendario editable", async ({ page }, testInfo) => {
    await login(page);
    const stamp = String(Date.now()).slice(-6);
    const name = `Cliente Crédito ${stamp}`;
    const profileUrl = await createClient(page, name);

    // 1. Desde la ficha, “Nuevo financiamiento” abre el formulario con el cliente preseleccionado.
    await page.getByRole("link", { name: "Nuevo financiamiento" }).click();
    await expect(page.getByRole("heading", { name: "Nuevo financiamiento" })).toBeVisible();
    await expect(page.getByText(name, { exact: false }).first()).toBeVisible();

    // 2. $100,00 en 3 cuotas quincenales muestra $33,33, $33,33 y $33,34.
    await page.getByLabel("Descripción").fill(`Dos conjuntos ${stamp}`);
    await page.getByLabel(/Monto total/).fill("100");
    await page.getByLabel(/Número de cuotas/).fill("3");
    await page.getByLabel("Frecuencia").selectOption("quincenal");
    const amounts = page.locator("#fin-rows input[type='text']");
    await expect(amounts).toHaveCount(3);
    await expect(amounts.nth(0)).toHaveValue("33.33");
    await expect(amounts.nth(1)).toHaveValue("33.33");
    await expect(amounts.nth(2)).toHaveValue("33.34");
    await expect(page.getByText("Total del financiamiento: $100,00")).toBeVisible();

    if (testInfo.project.name === "mobile") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    // 3. Mover una fecha cambia el calendario (la cuota queda como la escribió la propietaria).
    const dates = page.locator("#fin-rows input[type='date']");
    const original = await dates.nth(1).inputValue();
    const moved = `${original.slice(0, 8)}${original.endsWith("28") ? "27" : "28"}`;
    await dates.nth(1).fill(moved);
    await expect(dates.nth(1)).toHaveValue(moved);

    // Un monto distinto avisa que el total difiere sin impedir guardar.
    await amounts.nth(0).fill("30");
    await amounts.nth(0).blur();
    await expect(page.getByText(/difiere del monto indicado/)).toBeVisible();
    await amounts.nth(0).fill("33.33");
    await amounts.nth(0).blur();

    // 4. Guardar lleva al detalle con el anuncio.
    await page.getByRole("button", { name: "Guardar financiamiento" }).click();
    await expect(page.getByText("Financiamiento registrado").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: /Financiamiento #\d+/ })).toBeVisible();
    await expect(page.getByText(`Dos conjuntos ${stamp}`).first()).toBeVisible();
    await expect(page.getByText("$100,00").first()).toBeVisible();
    const detailUrl = page.url().replace(/\?.*$/, "");

    // 5. La ficha del cliente lista el financiamiento.
    await page.goto(profileUrl);
    await expect(page.getByRole("link", { name: new RegExp(`Dos conjuntos ${stamp}`) })).toBeVisible();

    // Editar el calendario: quitar una cuota y agregar otra.
    await page.goto(detailUrl);
    await page.getByRole("button", { name: "Editar calendario" }).click();
    await page.getByRole("button", { name: "Agregar cuota" }).click();
    await expect(page.getByText(/Nuevo total:/)).toBeVisible();
    if (testInfo.project.name === "mobile") {
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }
    await page.getByRole("button", { name: /Quitar la cuota 4/ }).click();
    await page.getByRole("button", { name: "Guardar calendario" }).click();
    await expect(page.getByText("Financiamiento guardado").first()).toBeVisible();

    // Anular y restaurar.
    await page.getByRole("button", { name: "Anular", exact: true }).click();
    await page.getByRole("dialog").getByLabel(/Motivo/).fill("Prueba E2E");
    await page.getByRole("dialog").getByRole("button", { name: "Anular" }).click();
    await expect(page.getByText("Anulado").first()).toBeVisible();
    await page.getByRole("button", { name: "Restaurar" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Restaurar" }).click();
    await expect(page.getByRole("button", { name: "Anular", exact: true })).toBeVisible();
  });

  test("US4: registrar un pago en bolívares y deshacerlo", async ({ page }, testInfo) => {
    await login(page);
    // La tasa oficial no depende de la red: se simula como no disponible.
    await page.route("**/api/admin/euro-rate**", (route) =>
      route.fulfill({ json: { status: "unavailable", rate: null, stale: false } }),
    );
    const stamp = String(Date.now()).slice(-6);
    const profileUrl = await createClient(page, `Cliente Cobro ${stamp}`);
    const clientRef = profileUrl.split("/").pop();

    // Financiamiento con compra hace 40 días: tiene cuotas vencidas.
    const past = new Date(Date.now() - 40 * 86_400_000).toISOString().slice(0, 10);
    await page.goto(`/admin/pagos-financiados/nuevo?cliente=${clientRef}`);
    await page.getByLabel("Descripción").fill(`Cobro ${stamp}`);
    await page.getByLabel("Fecha de compra").fill(past);
    await page.getByLabel(/Monto total/).fill("100");
    await page.getByLabel(/Número de cuotas/).fill("4");
    await page.getByRole("button", { name: "Guardar financiamiento" }).click();
    await expect(page.getByText("Financiamiento registrado").first()).toBeVisible();
    const detailUrl = page.url().replace(/\?.*$/, "");

    // 1. Resumen y cuota vencida.
    await page.goto(`/admin/pagos-financiados?status=overdue&client=${clientRef}`);
    for (const label of ["Por cobrar", "Vencido", "Vence en 15 días", "Cobrado este mes"]) {
      await expect(page.getByText(label, { exact: true })).toBeVisible();
    }
    await expect(page.getByText(/Vencida hace \d+ días?/).first()).toBeVisible();
    await expect(page.getByText(/Tasa euro BCV|Sin tasa disponible/).first()).toBeVisible();

    // 2. Bolívares exige la tasa y calcula en vivo.
    await page.getByRole("button", { name: "Registrar pago" }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByLabel("Bolívares").check();
    await expect(dialog.getByText(/No se pudo obtener la tasa oficial/)).toBeVisible();
    await dialog.getByRole("button", { name: "Registrar pago" }).click();
    await expect(dialog.getByText("Escribe la tasa para continuar.")).toBeVisible();
    await dialog.getByLabel(/^Tasa/).fill("50");
    await expect(dialog.getByText(/Bs 1\.250,00|Bs [\d.]+,\d{2}/).first()).toBeVisible();
    if (testInfo.project.name === "mobile") {
      const box = (await dialog.boundingBox())!;
      const viewport = page.viewportSize()!;
      expect(box.width).toBeLessThanOrEqual(viewport.width);
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);
    }

    // 3-4. Un doble clic registra un solo pago y se anuncia el resultado.
    await dialog.getByRole("button", { name: "Registrar pago" }).dblclick();
    await expect(page.getByText("Pago registrado").first()).toBeVisible();
    await page.goto(detailUrl);
    await expect(page.getByText(/Pagada el/).locator("visible=true")).toHaveCount(1);
    await expect(page.getByText(/tasa Bs 50,00 por € \(escrita a mano\)/).locator("visible=true")).toHaveCount(1);

    // 5. Deshacer el pago, con confirmación.
    await page.getByRole("button", { name: "Deshacer pago" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Deshacer pago" }).click();
    await expect(page.getByText("Pago deshecho").first()).toBeVisible();
    await expect(page.getByText(/Pagada el/).locator("visible=true")).toHaveCount(0);
  });

  test("US5: cargar financiamientos en bloque con cuotas ya pagadas", async ({ page }) => {
    await login(page);
    const stamp = String(Date.now()).slice(-6);
    const phone = uniquePhone();
    await createClient(page, `Cliente Masivo ${stamp}`, phone);
    await page.goto("/admin/pagos-financiados");
    await page.getByRole("link", { name: "Carga masiva" }).click();
    await expect(page.getByRole("heading", { name: "Carga masiva de financiamientos" })).toBeVisible();
    const template = await downloadFile(page, "Descargar plantilla");
    expect(template.name).toBe("plantilla-financiamientos.xlsx");

    const header = ["Celular del cliente", "Cliente", "Descripción", "Fecha de compra", "Monto total", "Inicial", "Número de cuotas", "Frecuencia", "Fecha de la primera cuota", "Cuotas pagadas"];
    const book = (celular: string) =>
      buildWorkbookBuffer([
        { name: "Financiamientos", rows: [header, [celular, null, `Carga ${stamp}`, "01/09/2026", 120, 20, 4, "Quincenal", "15/09/2026", 3]] },
      ]);

    // Celular inexistente: error y confirmación deshabilitada.
    await uploadWorkbook(page, "financiamientos.xlsx", await book("0414-000-0000"));
    await expect(page.getByRole("alert").filter({ hasText: /Corrige 1 error/ })).toBeVisible();
    await expect(page.getByText(/No hay ningún cliente con este celular/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar y aplicar cambios" })).toHaveCount(0);

    // Corregido: resumen y “Ver fechas”.
    await uploadWorkbook(page, "financiamientos.xlsx", await book(phone));
    await expect(page.getByText("Nuevos (1)")).toBeVisible();
    await expect(page.getByText(/Inicial \$20,00 \(pagada\) \+ 4 cuotas quincenales de \$25,00/)).toBeVisible();
    await page.getByRole("button", { name: "Ver fechas" }).click();
    await expect(page.getByText(/Cuota 3: 15\/10\/2026/)).toBeVisible();

    await page.getByRole("button", { name: "Confirmar y aplicar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Cambios aplicados" })).toBeVisible();
    await page.getByText("Creados (1)").click();
    await page.getByRole("link", { name: /^Abrir/ }).click();
    await expect(page.getByText("Pagada (registrada por carga masiva)").locator("visible=true").first()).toBeVisible();
  });

  test("US8: recordar una cuota por WhatsApp", async ({ page }) => {
    await login(page);
    const stamp = String(Date.now()).slice(-6);
    const profileUrl = await createClient(page, `Cliente Recordatorio ${stamp}`);
    const clientRef = profileUrl.split("/").pop();
    await page.goto(`/admin/pagos-financiados/nuevo?cliente=${clientRef}`);
    await page.getByLabel("Descripción").fill(`Recordar ${stamp}`);
    await page.getByLabel(/Monto total/).fill("80");
    await page.getByLabel(/Número de cuotas/).fill("2");
    await page.getByRole("button", { name: "Guardar financiamiento" }).click();
    await expect(page.getByText("Financiamiento registrado").first()).toBeVisible();

    await page.goto(`/admin/pagos-financiados?client=${clientRef}`);
    const link = page.getByRole("link", { name: "Recordar por WhatsApp" }).first();
    const href = (await link.getAttribute("href"))!;
    expect(href).toMatch(/^https:\/\/wa\.me\/58\d{10}\?text=/);
    const text = decodeURIComponent(href.split("?text=")[1]);
    expect(text).toContain(`Recordar ${stamp}`);
    expect(text).toContain("la cuota 1 de 2");
    expect(text).toContain("$40,00");
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
