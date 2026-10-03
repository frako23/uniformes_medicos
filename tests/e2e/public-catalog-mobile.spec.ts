import { expect, test } from "@playwright/test";

test.describe("guided catalog mobile experience", () => {
  test.skip(!process.env.E2E, "Requiere una base de datos migrada y almacenamiento accesible.");

  test("fits a phone viewport and keeps controls accessible", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("guided-step-gender")).toBeVisible();

    const genderButton = page.getByRole("button", { name: "Damas", exact: true });
    const genderBox = await genderButton.boundingBox();
    expect(genderBox?.height).toBeGreaterThanOrEqual(44);

    await genderButton.focus();
    await expect(genderButton).toBeFocused();
    await genderButton.click();
    await page.getByRole("button", { name: "Cualquier talla", exact: true }).click();
    await page.getByRole("button", { name: "Continuar", exact: true }).click();
    await page.getByRole("button", { name: "Uniformes", exact: true }).click();
    await expect(page.getByTestId("guided-results")).toBeVisible();

    const dimensions = await page.locator("body").evaluate((body) => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: body.scrollWidth,
    }));
    expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth + 1);

    const detailLink = page.locator(".product-card a[aria-label^='Ver detalles']").first();
    if (await detailLink.count()) {
      await expect(detailLink).toHaveAttribute("href", /\/productos\//);
      await expect(detailLink).toBeVisible();
    }
  });
});
