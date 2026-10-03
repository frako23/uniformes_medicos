import type { CatalogFilterRecord } from "../../src/utils/catalog-filters";

export const catalogFilterFixtures: CatalogFilterRecord[] = [
  {
    productId: 1,
    gender: "Dama",
    typeLabel: "Uniforme bota recta",
    positiveSizeLabels: ["S", "M"],
  },
  {
    productId: 2,
    gender: "Caballero",
    typeLabel: "Bata larga sin cuello",
    positiveSizeLabels: ["L"],
  },
  {
    productId: 3,
    gender: "Unisex",
    typeLabel: "Bata",
    positiveSizeLabels: ["M", "XL"],
  },
  {
    productId: 4,
    gender: "Dama",
    typeLabel: "Top",
    positiveSizeLabels: [],
  },
];
