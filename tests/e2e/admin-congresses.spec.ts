import { expect, test, type Page } from "@playwright/test";
import { downloadFile, login, uploadWorkbook } from "./helpers/admin";
import { buildWorkbookBuffer } from "../fixtures/bulk/workbook-builder";

// Un año lejano distinto en cada ejecución evita mezclar congresos de pruebas anteriores o datos reales.
const YEAR = 3000 + (Date.now() % 6000);

async function createCongress(page: Page, input: { name: string; from: string; to: string }) {
  await page.goto("/admin/congresos/nuevo");
  await page.getByLabel("Nombre").fill(input.name);
  await page.getByLabel("Desde").fill(input.from);
  await page.getByLabel("Hasta").fill(input.to);
  await page.getByRole("button", { name: "Guardar congreso" }).click();
  await expect(page.getByText("Congreso guardado").first()).toBeVisible();
}

test.describe("congresos", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");
  test.describe.configure({ mode: "serial" });

  test("US6: registrar congresos y verlos en el calendario", async ({ page }, testInfo) => {
    await login(page);
    const stamp = String(Date.now()).slice(-6);
    const long = `Congreso Largo ${stamp}`;
    const short = `Congreso Corto ${stamp}`;
    await createCongress(page, { name: long, from: `${YEAR}-10-30`, to: `${YEAR}-11-01` });
    await createCongress(page, { name: short, from: `${YEAR}-10-31`, to: `${YEAR}-10-31` });

    // Octubre: ambos pintados, con nombres accesibles y carriles distintos.
    await page.goto(`/admin/congresos?mes=${YEAR}-10`);
    await expect(page.getByRole("heading", { name: `octubre de ${YEAR}`, exact: true })).toBeVisible();
    // Un congreso que cruza semanas se dibuja en varios tramos; se usa el primero.
    const longLink = page.getByRole("link", { name: new RegExp(`^${long}, del 30 de octubre al 1 de noviembre de ${YEAR}`) }).first();
    const shortLink = page.getByRole("link", { name: new RegExp(`^${short}, 31 de octubre de ${YEAR}`) }).first();
    if (testInfo.project.name === "mobile") {
      // En teléfono las franjas son barras sin texto y la lista del mes aparece debajo.
      await expect(page.getByRole("link", { name: long, exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    } else {
      await expect(longLink).toBeVisible();
      await expect(shortLink).toBeVisible();
      const [a, b] = [await longLink.boundingBox(), await shortLink.boundingBox()];
      expect(a!.y).not.toBe(b!.y);
    }

    // Noviembre: continúa el congreso largo.
    await page.goto(`/admin/congresos?mes=${YEAR}-11`);
    if (testInfo.project.name !== "mobile") await expect(page.getByRole("link", { name: new RegExp(`^${long}`) }).first()).toBeVisible();

    // Una franja lleva al detalle.
    if (testInfo.project.name !== "mobile") {
      await page.goto(`/admin/congresos?mes=${YEAR}-10`);
      await longLink.click();
    } else {
      await page.goto(`/admin/congresos?mes=${YEAR}-10`);
      await page.getByRole("link", { name: long, exact: true }).click();
    }
    await expect(page.getByRole("heading", { name: long })).toBeVisible();
    await expect(page.getByText("3 días")).toBeVisible();

    // El número de un día abre el formulario con esa fecha de inicio.
    await page.goto(`/admin/congresos?mes=${YEAR}-10`);
    await page.getByRole("link", { name: `Registrar congreso el 12 de octubre de ${YEAR}` }).click();
    await expect(page.getByLabel("Desde")).toHaveValue(`${YEAR}-10-12`);

    // Hasta anterior a Desde: el error aparece en “Hasta”.
    await page.getByLabel("Nombre").fill(`Fechas mal ${stamp}`);
    await page.getByLabel("Hasta").fill(`${YEAR}-10-01`);
    await page.getByRole("button", { name: "Guardar congreso" }).click();
    await expect(page.getByText("La fecha de fin no puede ser anterior a la de inicio.")).toBeVisible();

    // Vista de lista.
    await page.goto(`/admin/congresos?mes=${YEAR}-10&vista=lista`);
    await expect(page.getByRole("heading", { name: "Próximos congresos" })).toBeVisible();
    await expect(page.getByRole("link", { name: long, exact: true })).toBeVisible();
  });

  test("US7: cargar congresos en bloque desde la pestaña Eventos", async ({ page }, testInfo) => {
    await login(page);
    await page.goto("/admin/congresos");
    await page.getByRole("link", { name: "Carga masiva" }).click();
    await expect(page.getByRole("heading", { name: "Carga masiva de congresos" })).toBeVisible();
    const template = await downloadFile(page, "Descargar plantilla vacía");
    expect(template.name).toBe("plantilla-congresos.xlsx");

    const stamp = String(Date.now()).slice(-6);
    const name = `Congreso Masivo ${stamp}`;
    const header = ["Desde", "Hasta", "Especialidad", "Lugar", "Nombre"];
    const withBlankRow = [
      header,
      [`10/03/${YEAR}`, `12/03/${YEAR}`, "Mastología", "Hotel", name],
      [null, null, "Medicina Estética", null, null],
    ];

    // La fila de “Medicina Estética” sin fechas ni nombre es un error REQUIRED.
    await uploadWorkbook(page, "eventos.xlsx", await buildWorkbookBuffer([{ name: "Eventos", rows: withBlankRow }]));
    await expect(page.getByRole("alert").filter({ hasText: /Corrige 3 errores/ })).toBeVisible();
    await expect(page.getByText(/es obligatorio/).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar y aplicar cambios" })).toHaveCount(0);

    // Sin esa fila, la confirmación pinta el congreso en su mes.
    await uploadWorkbook(page, "eventos.xlsx", await buildWorkbookBuffer([{ name: "Eventos", rows: withBlankRow.slice(0, 2) }]));
    await expect(page.getByText("Nuevos (1)")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y aplicar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Cambios aplicados" })).toBeVisible();
    await page.goto(`/admin/congresos?mes=${YEAR}-03`);
    if (testInfo.project.name === "mobile") await expect(page.getByRole("link", { name, exact: true })).toBeVisible();
    else await expect(page.getByRole("link", { name: new RegExp(`^${name}, del 10 al 12 de marzo de ${YEAR}`) }).first()).toBeVisible();
  });
});
