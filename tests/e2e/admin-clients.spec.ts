import { expect, test } from "@playwright/test";
import { downloadFile, login, unique, uniquePhone, uploadWorkbook } from "./helpers/admin";
import { medicosWorkbook } from "../fixtures/bulk/workbook-builder";

test.describe("clientes", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");
  test.describe.configure({ mode: "serial" });

  test("US1: registrar, buscar, filtrar, editar y eliminar clientes", async ({ page }, testInfo) => {
    await login(page);
    const navLink = page.getByRole("navigation", { name: "Administración" }).getByRole("link", { name: "Clientes", exact: true });
    if (!(await navLink.isVisible())) {
      await page.getByText("Menú", { exact: true }).click();
    }
    await navLink.click();
    await expect(page.getByRole("heading", { name: "Clientes", exact: true })).toBeVisible();

    // Alta
    const stamp = String(Date.now()).slice(-6);
    const surname = `Zeta${stamp}`;
    const phone = uniquePhone();
    const specialty = `Especialidad ${stamp}`;
    await page.getByRole("link", { name: "Nuevo cliente" }).click();
    await page.getByLabel("Nombre").fill(`Ana Pérez ${surname}`);
    await page.getByLabel("Celular").fill(phone);
    await page.getByLabel("Sexo").selectOption("Mujer");
    await page.getByLabel("Talla").fill("M");
    await page.getByLabel("Especialidad").fill(specialty);
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByText("Cliente guardado").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: `Ana Pérez ${surname}` })).toBeVisible();
    const profileUrl = page.url().replace(/\?.*$/, "");

    // Búsqueda por apellido sin tilde y por 4 dígitos del celular
    await page.goto("/admin/clientes");
    await page.getByLabel("Nombre o celular").fill(`perez ${surname.toLowerCase()}`);
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("link", { name: `Ana Pérez ${surname}` }).first()).toBeVisible();
    await page.getByLabel("Nombre o celular").fill(phone.replace(/\D/g, "").slice(-4));
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("link", { name: `Ana Pérez ${surname}` }).first()).toBeVisible();

    // Filtro por especialidad y “Quitar filtros”
    await page.goto("/admin/clientes");
    await page.getByLabel("Especialidad").selectOption(specialty);
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByText(/1 resultado/)).toBeVisible();
    await page.getByRole("link", { name: "Quitar filtros" }).first().click();
    await expect(page).toHaveURL(/\/admin\/clientes$/);

    if (testInfo.project.name === "mobile") {
      await page.getByLabel("Nombre o celular").fill(surname);
      await page.getByRole("button", { name: "Aplicar" }).click();
      await expect(page.locator("ul.md\\:hidden li").first()).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    }

    // Edición: la talla se conserva
    await page.goto(`${profileUrl}?editar=1`);
    await page.getByLabel("Talla").fill("L");
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByText("Cliente guardado").first()).toBeVisible();
    await expect(page.getByText("L", { exact: true })).toBeVisible();

    // Celular repetido con otra escritura: el error enlaza a la ficha del dueño
    await page.goto("/admin/clientes/nuevo");
    await page.getByLabel("Nombre").fill(`Otro ${surname}`);
    await page.getByLabel("Celular").fill(`+58 ${phone.replace(/\D/g, "").slice(1)}`);
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    const conflict = page.getByText(/Este celular ya pertenece a/);
    await expect(conflict).toBeVisible();
    await conflict.getByRole("link", { name: "Ver ficha" }).click();
    await expect(page.getByRole("heading", { name: `Ana Pérez ${surname}` })).toBeVisible();

    // Eliminación: Escape cierra el diálogo y devuelve el foco
    await page.goto("/admin/clientes/nuevo");
    await page.getByLabel("Nombre").fill(`Borrar ${surname}`);
    await page.getByLabel("Celular").fill(uniquePhone().replace(/.$/, String((Date.now() + 7) % 10)));
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    await expect(page.getByRole("heading", { name: `Borrar ${surname}` })).toBeVisible();
    const deleteButton = page.getByRole("button", { name: "Eliminar", exact: true });
    await deleteButton.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(deleteButton).toBeFocused();
    await deleteButton.click();
    await page.getByRole("dialog").getByRole("button", { name: "Eliminar" }).click();
    await expect(page.getByText("Cliente eliminado").first()).toBeVisible();
  });

  test("US1: las rutas exigen sesión y token CSRF", async ({ page, request }) => {
    expect((await request.get("/api/admin/clients")).status()).toBe(401);
    const redirected = await request.get("/admin/clientes", { maxRedirects: 0 });
    expect(redirected.status()).toBe(303);
    expect(redirected.headers().location).toContain("/admin/login");

    await login(page);
    const response = await page.request.post("/api/admin/clients", {
      data: { name: unique("Sin CSRF"), phone: "0414-000-0000" },
    });
    expect(response.status()).toBe(403);
  });

  test("US2: importar la hoja de médicos desde la carga masiva", async ({ page }) => {
    await login(page);
    await page.goto("/admin/clientes");
    await page.getByRole("link", { name: "Carga masiva" }).click();
    await expect(page.getByRole("heading", { name: "Carga masiva de clientes" })).toBeVisible();

    const template = await downloadFile(page, "Descargar plantilla vacía");
    expect(template.name).toBe("plantilla-clientes.xlsx");

    const stamp = String(Date.now()).slice(-6);
    const phoneA = `414${stamp}1`;
    const phoneB = `424${stamp}2`;
    const sheet = (phone: string | number) =>
      medicosWorkbook([
        [`Ana Importada ${stamp}`, phoneA, "Mujer", "M", "Caracas", "Los Magallanes", null, "Pediatría"],
        [`Luis Importado ${stamp}`, phone, "Hombre", "L", "Valencia", null, null, "Cirugía"],
      ]);

    // Celular de 9 dígitos: alerta con fila y columna, hoja leída y confirmación deshabilitada.
    await uploadWorkbook(page, "medicos.xlsx", await sheet(phoneB.slice(0, 9)));
    await expect(page.getByRole("alert").filter({ hasText: /Corrige 1 error/ })).toBeVisible();
    await expect(page.getByText("Columna “Celular”")).toBeVisible();
    await expect(page.getByText(/Fila 3/).first()).toBeVisible();
    await expect(page.getByText("Se procesó la hoja «Medicos»")).toBeVisible();
    await expect(page.getByRole("button", { name: "Confirmar y aplicar cambios" })).toHaveCount(0);

    // Corregido: confirmar y encontrar los clientes en la lista.
    await uploadWorkbook(page, "medicos.xlsx", await sheet(phoneB));
    await expect(page.getByText("Nuevos (2)")).toBeVisible();
    await page.getByRole("button", { name: "Confirmar y aplicar cambios" }).click();
    await expect(page.getByRole("heading", { name: "Cambios aplicados" })).toBeVisible();
    await page.getByRole("link", { name: "Ver clientes" }).click();
    await page.getByLabel("Nombre o celular").fill(`Importad`);
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.getByRole("link", { name: `Ana Importada ${stamp}` }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: `Luis Importado ${stamp}` }).first()).toBeVisible();
  });

  test("US2: la vista previa exige sesión y token CSRF", async ({ page, request }) => {
    expect((await request.post("/api/admin/clients/bulk/preview")).status()).toBe(401);
    await login(page);
    const response = await page.request.post("/api/admin/clients/bulk/preview");
    expect(response.status()).toBe(403);
  });

  test("US8: la ficha enlaza a WhatsApp", async ({ page }) => {
    await login(page);
    const phone = uniquePhone();
    await page.goto("/admin/clientes/nuevo");
    await page.getByLabel("Nombre").fill(`Cliente WhatsApp ${Date.now()}`);
    await page.getByLabel("Celular").fill(phone);
    await page.getByRole("button", { name: "Guardar cliente" }).click();
    const link = page.getByRole("link", { name: "Escribir por WhatsApp" });
    await expect(link).toHaveAttribute("href", /^https:\/\/wa\.me\/58\d{10}$/);
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });
});
