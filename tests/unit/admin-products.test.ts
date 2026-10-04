import { describe, expect, it } from "vitest";
import {
  ADMIN_PRODUCT_PAGE_SIZES,
  ADMIN_PRODUCT_SORT_OPTIONS,
  normalizeAdminProductFilterValues,
  normalizeAdminProductPageSize,
  normalizeAdminProductSort,
} from "../../src/server/catalog/admin-products";

describe("admin product pagination", () => {
  it("allows only the supported page sizes", () => {
    expect(ADMIN_PRODUCT_PAGE_SIZES).toEqual([20, 50, 100]);
    expect(normalizeAdminProductPageSize(20)).toBe(20);
    expect(normalizeAdminProductPageSize(50)).toBe(50);
    expect(normalizeAdminProductPageSize(100)).toBe(100);
  });

  it("falls back to 20 for missing or unsupported values", () => {
    expect(normalizeAdminProductPageSize()).toBe(20);
    expect(normalizeAdminProductPageSize(25)).toBe(20);
    expect(normalizeAdminProductPageSize(Number.NaN)).toBe(20);
  });

  it("supports the available product sort orders", () => {
    expect(ADMIN_PRODUCT_SORT_OPTIONS.map((option) => option.value)).toEqual([
      "updated",
      "priceAsc",
      "priceDesc",
    ]);
    expect(normalizeAdminProductSort("priceAsc")).toBe("priceAsc");
    expect(normalizeAdminProductSort("priceDesc")).toBe("priceDesc");
    expect(normalizeAdminProductSort("unknown")).toBe("updated");
  });

  it("cleans, deduplicates, and sorts database filter values", () => {
    expect(normalizeAdminProductFilterValues([" Bata ", "bata", "Uniforme", "", "uniforme"])).toEqual([
      "Bata",
      "Uniforme",
    ]);
  });
});
