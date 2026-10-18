import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";
import { login } from "./helpers/admin";

/** En pantallas estrechas los enlaces viven dentro de “Menú”; lo abre con el teclado. */
async function openMenuIfCollapsed(page: Page) {
  const menu = page.getByText("Menú", { exact: true });
  if (await menu.isVisible()) {
    await menu.focus();
    await page.keyboard.press("Enter");
  }
}

const SECTIONS = [
  { name: "Productos", path: "/admin/productos" },
  { name: "Estadísticas", path: "/admin/estadisticas" },
];

test.describe("navegación del panel", () => {
  test.skip(!process.env.E2E, "Requiere DATABASE_URL, BLOB_READ_WRITE_TOKEN y datos de aceptación.");

  test("cada enlace responde y marca su página como actual", async ({ page }) => {
    await login(page);
    for (const section of SECTIONS) {
      const response = await page.goto(section.path);
      expect(response?.status()).toBeLessThan(400);
      await openMenuIfCollapsed(page);
      const nav = page.getByRole("navigation", { name: "Administración" });
      await expect(nav.getByRole("link", { name: section.name, exact: true })).toHaveAttribute("aria-current", "page");
    }
  });

  test("a 320 px los enlaces van dentro de Menú y no hay desplazamiento horizontal", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await login(page);
    await page.goto("/admin/productos");
    const menu = page.getByText("Menú", { exact: true });
    await expect(menu).toBeVisible();
    await expect(page.getByRole("link", { name: "Productos", exact: true })).toBeHidden();
    await menu.focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("link", { name: "Productos", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "Estadísticas", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Salir" })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
    expect(overflow).toBe(true);
  });

  test("el orden final de la navegación y el texto del inicio", async ({ page }) => {
    await login(page);
    await page.goto("/admin");
    await openMenuIfCollapsed(page);
    const nav = page.getByRole("navigation", { name: "Administración" });
    const links = (await nav.getByRole("link").allInnerTexts()).map((text) => text.trim()).filter(Boolean);
    const visible = [...new Set(links)];
    expect(visible).toEqual(["Productos", "Clientes", "Pagos financiados", "Congresos", "Estadísticas", "Ver vitrina"]);
    await expect(nav.getByRole("button", { name: "Salir" })).toBeVisible();
    await expect(page.getByText("Gestiona productos, clientes, pagos financiados y congresos")).toBeVisible();
  });

  test("las pantallas nuevas no tienen desplazamiento horizontal a 320 px", async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await login(page);
    const paths = [
      "/admin/clientes",
      "/admin/clientes/nuevo",
      "/admin/clientes/carga-masiva",
      "/admin/pagos-financiados",
      "/admin/pagos-financiados/nuevo",
      "/admin/pagos-financiados/carga-masiva",
      "/admin/congresos",
      "/admin/congresos?vista=lista",
      "/admin/congresos/nuevo",
      "/admin/congresos/carga-masiva",
    ];
    for (const path of paths) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBeLessThan(400);
      const fits = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
      expect(fits, `${path} desborda a 320 px`).toBe(true);
    }
  });
});
