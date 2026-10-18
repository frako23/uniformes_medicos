import { describe, expect, it } from "vitest";
import {
  deriveFinancingStatus,
  installmentLabels,
  installmentState,
  totals,
} from "../../src/server/financing/summary";

const TODAY = "2026-10-18";

describe("deriveFinancingStatus", () => {
  it("Anulado tiene prioridad", () => {
    expect(
      deriveFinancingStatus({ annulled: true, installments: [{ status: "pendiente", dueDate: "2026-01-01" }] }, TODAY),
    ).toBe("anulado");
  });
  it("es Pagado si no quedan cuotas pendientes", () => {
    expect(
      deriveFinancingStatus({ annulled: false, installments: [{ status: "pagada", dueDate: "2026-01-01" }] }, TODAY),
    ).toBe("pagado");
  });
  it("es Con cuotas vencidas si alguna pendiente vence antes de hoy", () => {
    expect(
      deriveFinancingStatus(
        {
          annulled: false,
          installments: [
            { status: "pagada", dueDate: "2026-09-01" },
            { status: "pendiente", dueDate: "2026-10-17" },
          ],
        },
        TODAY,
      ),
    ).toBe("con_vencidas");
  });
  it("es Al día en los demás casos, incluso si vence hoy", () => {
    expect(
      deriveFinancingStatus({ annulled: false, installments: [{ status: "pendiente", dueDate: TODAY }] }, TODAY),
    ).toBe("al_dia");
  });
});

describe("installmentState", () => {
  it("clasifica las cuotas", () => {
    expect(installmentState({ status: "pendiente", dueDate: "2026-10-10" }, TODAY)).toEqual({
      state: "vencida",
      daysOverdue: 8,
    });
    expect(installmentState({ status: "pendiente", dueDate: TODAY }, TODAY)).toEqual({ state: "vence_hoy", daysOverdue: 0 });
    expect(installmentState({ status: "pendiente", dueDate: "2026-10-30" }, TODAY)).toEqual({
      state: "por_vencer",
      daysOverdue: 0,
    });
    expect(installmentState({ status: "pagada", dueDate: "2026-10-01" }, TODAY)).toEqual({ state: "pagada", daysOverdue: 0 });
  });
});

describe("installmentLabels", () => {
  it("ordena por inicial, fecha, creación e id y numera las demás", () => {
    const labels = installmentLabels([
      { id: "c", isInitial: false, dueDate: "2026-11-15", createdAt: "2026-10-01T00:00:00Z" },
      { id: "a", isInitial: true, dueDate: "2026-10-01", createdAt: "2026-10-01T00:00:00Z" },
      { id: "b", isInitial: false, dueDate: "2026-10-31", createdAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(labels.map((item) => [item.id, item.label])).toEqual([
      ["a", "Inicial"],
      ["b", "1 de 2"],
      ["c", "2 de 2"],
    ]);
  });
  it("desempata las cuotas con la misma fecha por created_at", () => {
    const labels = installmentLabels([
      { id: "z", isInitial: false, dueDate: "2026-10-31", createdAt: "2026-10-02T00:00:00Z" },
      { id: "a", isInitial: false, dueDate: "2026-10-31", createdAt: "2026-10-01T00:00:00Z" },
    ]);
    expect(labels.map((item) => [item.id, item.label])).toEqual([
      ["a", "1 de 2"],
      ["z", "2 de 2"],
    ]);
  });
  it("sin inicial numera desde 1", () => {
    const labels = installmentLabels([{ id: "a", isInitial: false, dueDate: "2026-10-31", createdAt: "2026-10-01T00:00:00Z" }]);
    expect(labels[0].label).toBe("1 de 1");
  });
});

describe("totals", () => {
  it("suma sin errores de coma flotante", () => {
    expect(
      totals([
        { status: "pagada", amountUsd: "33.33" },
        { status: "pendiente", amountUsd: "33.33" },
        { status: "pendiente", amountUsd: "33.34" },
      ]),
    ).toEqual({ total: "100.00", paid: "33.33", balance: "66.67" });
  });
  it("devuelve ceros sin cuotas", () => {
    expect(totals([])).toEqual({ total: "0.00", paid: "0.00", balance: "0.00" });
  });
});
