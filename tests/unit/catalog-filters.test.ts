import { describe, expect, it } from "vitest";
import {
  filterCatalogRecords,
  getAvailableSizeLabels,
  getAvailableTypeLabels,
  getGarmentGroup,
  matchesCatalogRecord,
  sortSizeLabels,
} from "../../src/utils/catalog-filters";
import { catalogFilterFixtures } from "./catalog-filter-fixtures";

describe("guided catalog filters", () => {
  it("sorts sizes from smallest to largest", () => {
    expect(sortSizeLabels(["XXL", "M", "XS", "XL", "XXS", "L", "S"])).toEqual([
      "XXS",
      "XS",
      "S",
      "M",
      "L",
      "XL",
      "XXL",
    ]);
  });

  it("offers only positive-stock sizes for the selected gender and includes unisex", () => {
    expect(getAvailableSizeLabels(catalogFilterFixtures, "Dama")).toEqual(["S", "M", "XL"]);
    expect(getAvailableSizeLabels(catalogFilterFixtures, "Caballero")).toEqual(["M", "L", "XL"]);
  });

  it("classifies bata labels with accents or extra detail", () => {
    expect(getGarmentGroup("Bata larga sin cuello")).toBe("batas");
    expect(getGarmentGroup("Uniforme Odontológico")).toBe("uniformes");
  });

  it("lists the distinct database type labels available for the selected filters", () => {
    expect(getAvailableTypeLabels(catalogFilterFixtures)).toEqual([
      "Bata",
      "Bata larga sin cuello",
      "Uniforme bota recta",
    ]);
    expect(getAvailableTypeLabels(catalogFilterFixtures, "Dama")).toEqual([
      "Bata",
      "Uniforme bota recta",
    ]);
    expect(getAvailableTypeLabels(catalogFilterFixtures, "Dama", ["S"])).toEqual([
      "Uniforme bota recta",
    ]);
  });

  it("matches a product when at least one selected size has stock", () => {
    expect(
      matchesCatalogRecord(catalogFilterFixtures[0], {
        gender: "Dama",
        sizeLabels: ["XL", "S"],
        typeLabel: "Uniforme bota recta",
      }),
    ).toBe(true);
  });

  it("treats an empty size selection as any size while preserving other filters", () => {
    expect(
      filterCatalogRecords(catalogFilterFixtures, {
        gender: "Dama",
        sizeLabels: [],
        typeLabel: "Uniforme bota recta",
      }).map((record) => record.productId),
    ).toEqual([1]);
  });

  it("excludes products without positive stock and filters the garment group", () => {
    expect(
      filterCatalogRecords(catalogFilterFixtures, {
        gender: "Dama",
        sizeLabels: ["M"],
        typeLabel: "Bata",
      }).map((record) => record.productId),
    ).toEqual([3]);

    expect(
      filterCatalogRecords(catalogFilterFixtures, {
        gender: "Dama",
        sizeLabels: [],
        typeLabel: "Top",
      }).some((record) => record.productId === 4),
    ).toBe(false);
  });
});
