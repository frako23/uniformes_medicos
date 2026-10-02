import { expect, test } from "@playwright/test";

test.describe("public catalog regression", () => {
  test.skip(!process.env.E2E, "Requiere una base de datos migrada y almacenamiento accesible.");

  test("visitor can browse the catalog", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("main")).toBeVisible();
  });
});
