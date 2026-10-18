import { describe, expect, it } from "vitest";
import { buildInventoryStats } from "../../src/server/catalog/admin-stats";

describe("buildInventoryStats", () => {
  it("totals units and value by type and size", () => {
    const stats = buildInventoryStats([
      { type: "Filipina", size: "M", units: 3, value: 90 },
      { type: "Filipina", size: "S", units: 2, value: 60 },
      { type: "Pantalón", size: "M", units: 4, value: 200 },
    ]);
    expect(stats.totalUnits).toBe(9);
    expect(stats.totalValue).toBe(350);
    expect(stats.byType).toEqual([
      { label: "Pantalón", units: 4, value: 200 },
      { label: "Filipina", units: 5, value: 150 },
    ]);
    expect(stats.bySize.map((group) => group.label)).toEqual(["S", "M"]);
    expect(stats.bySize[1]).toEqual({ label: "M", units: 7, value: 290 });
  });

  it("orders sizes naturally and handles empty input", () => {
    const stats = buildInventoryStats([
      { type: "A", size: "XL", units: 1, value: 1 },
      { type: "A", size: "S", units: 1, value: 1 },
      { type: "A", size: "XS", units: 1, value: 1 },
      { type: "A", size: "38", units: 1, value: 1 },
    ]);
    expect(stats.bySize.map((group) => group.label)).toEqual(["XS", "S", "XL", "38"]);
    expect(buildInventoryStats([])).toEqual({ totalUnits: 0, totalValue: 0, byType: [], bySize: [] });
  });
});
