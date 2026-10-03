import { expect, test } from "@playwright/test";

test.describe("public catalog regression", () => {
  test.skip(!process.env.E2E, "Requiere una base de datos migrada y almacenamiento accesible.");

  test("visitor can complete the guided catalog flow", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByTestId("guided-step-gender")).toBeVisible();
    await expect(page.getByRole("button", { name: "Damas", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Caballeros", exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Damas", exact: true }).click();
    await expect(page.getByTestId("guided-step-sizes")).toBeVisible();

    const sizeOptions = page.locator("[data-size-option]");
    if ((await sizeOptions.count()) > 0) {
      await sizeOptions.first().click();
    } else {
      await page.getByRole("button", { name: "Cualquier talla", exact: true }).click();
    }
    await page.getByRole("button", { name: "Continuar", exact: true }).click();

    await expect(page.getByTestId("guided-step-garment")).toBeVisible();
    await page.getByRole("button", { name: "Batas", exact: true }).click();
    await expect(page.getByTestId("guided-results")).toBeVisible();
  });
});
