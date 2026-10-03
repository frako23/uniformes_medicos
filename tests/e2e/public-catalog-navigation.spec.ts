import { expect, test } from "@playwright/test";

test.describe("guided catalog navigation", () => {
  test.skip(!process.env.E2E, "Requiere una base de datos migrada y almacenamiento accesible.");

  test("visitor can change filters, use any size and reset", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Damas", exact: true }).click();
    await expect(page.getByTestId("guided-step-sizes")).toBeVisible();

    await page.getByRole("button", { name: "Cualquier talla", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Uniformes", exact: true }).click();
    await expect(page.getByTestId("guided-results")).toBeVisible();

    await page.getByRole("button", { name: "Cambiar género", exact: true }).click();
    await expect(page.getByTestId("guided-step-gender")).toBeVisible();
    await page.getByRole("button", { name: "Caballeros", exact: true }).click();
    await expect(page.getByTestId("guided-step-sizes")).toBeVisible();

    await page.goBack();
    await expect(page.getByTestId("guided-step-gender")).toBeVisible();
    await expect(page.getByRole("button", { name: "Caballeros", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Damas", exact: true }).click();
    await page.getByRole("button", { name: "Cualquier talla", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Batas", exact: true }).click();
    await page.getByRole("button", { name: "Reiniciar selección", exact: true }).click();
    await expect(page.getByTestId("guided-step-gender")).toBeVisible();
  });
});
