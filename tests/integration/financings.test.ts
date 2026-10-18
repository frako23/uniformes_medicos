import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/client";
import {
  annulFinancing,
  createFinancing,
  deleteFinancing,
  getFinancingDetail,
  restoreFinancing,
  updateFinancing,
} from "../../src/server/financing/service";
import { HttpError } from "../../src/server/http/errors";
import { hasTestDatabase, resetSections, seedClient, seedFinancing, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;
const NOW = new Date("2026-10-18T16:00:00Z");

async function expectHttp(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  return error as HttpError;
}

const input = (clientRef: number, overrides: Record<string, unknown> = {}) => ({
  clientRef,
  description: "Dos conjuntos",
  purchaseDate: "2026-10-18",
  frequency: "quincenal",
  installments: [
    { isInitial: false, dueDate: "2026-10-31", amountUsd: "25.00" },
    { isInitial: false, dueDate: "2026-11-15", amountUsd: "25.00" },
    { isInitial: false, dueDate: "2026-11-30", amountUsd: "25.00" },
    { isInitial: false, dueDate: "2026-12-15", amountUsd: "25.00" },
  ],
  ...overrides,
});

run("financiamientos con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetSections);
  afterAll(teardownTestDatabase);

  describe("alta", () => {
    it("guarda las cuotas y el detalle trae totales, estado, etiquetas y estado de cada cuota", async () => {
      const client = await seedClient({ name: "Ana", phone: "0414 123 4567" });
      const detail = await createFinancing(
        input(client.ref, {
          purchaseDate: "2026-10-01",
          installments: [
            { isInitial: true, dueDate: "2026-10-01", amountUsd: "20.00" },
            { isInitial: false, dueDate: "2026-10-10", amountUsd: "40.00" },
            { isInitial: false, dueDate: "2026-10-18", amountUsd: "20.00" },
            { isInitial: false, dueDate: "2026-11-10", amountUsd: "20.00" },
          ],
        }),
        NOW,
      );
      expect(detail).toMatchObject({
        description: "Dos conjuntos",
        origin: "panel",
        totalUsd: "100.00",
        paidUsd: "0.00",
        balanceUsd: "100.00",
        status: "con_vencidas",
        client: { ref: client.ref, name: "Ana", phone: "0414-123-4567" },
      });
      expect(detail.installments.map((item) => [item.label, item.state, item.daysOverdue])).toEqual([
        ["Inicial", "vencida", 17],
        ["1 de 3", "vencida", 8],
        ["2 de 3", "vence_hoy", 0],
        ["3 de 3", "por_vencer", 0],
      ]);
      expect(detail.updatedAt).toEqual(expect.any(String));
    });

    it("responde 404 si el cliente no existe", async () => {
      await expectHttp(createFinancing(input(999), NOW), 404);
    });

    it("responde 422 con una compra futura o una cuota antes de la compra", async () => {
      const client = await seedClient();
      const future = await expectHttp(createFinancing(input(client.ref, { purchaseDate: "2026-10-19" }), NOW), 422);
      expect(future.fields).toHaveProperty("purchaseDate");
      const early = await expectHttp(
        createFinancing(
          input(client.ref, {
            installments: [{ isInitial: false, dueDate: "2026-10-01", amountUsd: "10.00" }],
          }),
          NOW,
        ),
        422,
      );
      expect(early.fields).toHaveProperty(["installments.0.dueDate"]);
    });

    it("la hora de Caracas decide si la compra es de hoy", async () => {
      const client = await seedClient();
      // 03:59 UTC del 19/10 todavía es 18/10 en Caracas.
      const detail = await createFinancing(input(client.ref), new Date("2026-10-19T03:59:00Z"));
      expect(detail.purchaseDate).toBe("2026-10-18");
    });
  });

  describe("edición", () => {
    async function seeded() {
      const client = await seedClient();
      return createFinancing(input(client.ref), NOW);
    }

    it("cambia, agrega y quita cuotas pendientes y recalcula el total, sin tocar las pagadas", async () => {
      const client = await seedClient();
      const financing = await seedFinancing({
        clientId: client.id,
        purchaseDate: "2026-10-01",
        installments: [
          { dueDate: "2026-10-01", amount: "25.00", isInitial: true, paid: { origin: "panel", paidOn: "2026-10-01", currency: "USD" } },
          { dueDate: "2026-10-31", amount: "25.00" },
          { dueDate: "2026-11-15", amount: "25.00" },
        ],
      });
      const before = await getFinancingDetail(financing.ref, NOW);
      const pending = before.installments.filter((item) => item.state !== "pagada");
      const updated = await updateFinancing(
        financing.ref,
        {
          description: "Descripción nueva",
          pendingInstallments: [
            { id: pending[0].id, dueDate: "2026-11-05", amountUsd: "30.00" },
            { dueDate: "2026-12-01", amountUsd: "10.00" },
          ],
          expectedUpdatedAt: before.updatedAt,
        },
        NOW,
      );
      expect(updated.description).toBe("Descripción nueva");
      expect(updated.totalUsd).toBe("65.00");
      expect(updated.paidUsd).toBe("25.00");
      expect(updated.balanceUsd).toBe("40.00");
      expect(updated.installments.map((item) => [item.label, item.dueDate, item.amountUsd])).toEqual([
        ["Inicial", "2026-10-01", "25.00"],
        ["1 de 2", "2026-11-05", "30.00"],
        ["2 de 2", "2026-12-01", "10.00"],
      ]);
      expect(updated.installments[0].payment).toMatchObject({ currency: "USD", origin: "panel" });
      expect(updated.updatedAt).not.toBe(before.updatedAt);
    });

    it("rechaza el id de una cuota pagada, un financiamiento anulado y una versión antigua", async () => {
      const client = await seedClient();
      const financing = await seedFinancing({
        clientId: client.id,
        installments: [
          { dueDate: "2026-09-15", amount: "25.00", paid: { origin: "carga_masiva" } },
          { dueDate: "2026-10-15", amount: "25.00" },
        ],
      });
      const detail = await getFinancingDetail(financing.ref, NOW);
      const paid = detail.installments.find((item) => item.state === "pagada")!;
      const body = (overrides: Record<string, unknown> = {}) => ({
        description: "x",
        pendingInstallments: [{ dueDate: "2026-10-15", amountUsd: "25.00" }],
        expectedUpdatedAt: detail.updatedAt,
        ...overrides,
      });

      const paidError = await expectHttp(
        updateFinancing(financing.ref, body({ pendingInstallments: [{ id: paid.id, dueDate: "2026-10-15", amountUsd: "25.00" }] }), NOW),
        409,
      );
      expect(paidError.fields).toHaveProperty("installments");

      await expectHttp(updateFinancing(financing.ref, body({ expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }), NOW), 409);

      const annulled = await annulFinancing(financing.ref, { expectedUpdatedAt: detail.updatedAt }, NOW);
      await expectHttp(updateFinancing(financing.ref, body({ expectedUpdatedAt: annulled.updatedAt }), NOW), 409);
    });

    it("no deja el financiamiento sin cuotas", async () => {
      const detail = await seeded();
      const error = await expectHttp(
        updateFinancing(detail.ref, { description: "x", pendingInstallments: [], expectedUpdatedAt: detail.updatedAt }, NOW),
        422,
      );
      expect(error.fields).toHaveProperty("pendingInstallments");
    });
  });

  describe("anulación y restauración", () => {
    it("anular con motivo y restaurar cambian el estado; repetir la acción da 409", async () => {
      const client = await seedClient();
      const created = await createFinancing(input(client.ref), NOW);
      const annulled = await annulFinancing(created.ref, { reason: "  Cliente canceló ", expectedUpdatedAt: created.updatedAt }, NOW);
      expect(annulled).toMatchObject({ status: "anulado", annulmentReason: "Cliente canceló" });
      expect(annulled.annulledAt).toEqual(expect.any(String));
      await expectHttp(annulFinancing(created.ref, { expectedUpdatedAt: annulled.updatedAt }, NOW), 409);

      const restored = await restoreFinancing(created.ref, { expectedUpdatedAt: annulled.updatedAt }, NOW);
      expect(restored).toMatchObject({ status: "al_dia", annulledAt: null, annulmentReason: null });
      await expectHttp(restoreFinancing(created.ref, { expectedUpdatedAt: restored.updatedAt }, NOW), 409);
    });
  });

  describe("eliminación", () => {
    it("sin cuotas pagadas, borra también las cuotas", async () => {
      const client = await seedClient();
      const created = await createFinancing(input(client.ref), NOW);
      await deleteFinancing(created.ref, { expectedUpdatedAt: created.updatedAt });
      await expectHttp(getFinancingDetail(created.ref, NOW), 404);
      const rows = await getDb().query.installments.findMany();
      expect(rows).toHaveLength(0);
    });

    it("con alguna cuota pagada da 409 y se ofrece anular", async () => {
      const client = await seedClient();
      const financing = await seedFinancing({
        clientId: client.id,
        installments: [
          { dueDate: "2026-09-15", amount: "25.00", paid: { origin: "panel", paidOn: "2026-09-15", currency: "USD" } },
          { dueDate: "2026-10-15", amount: "25.00" },
        ],
      });
      const detail = await getFinancingDetail(financing.ref, NOW);
      const error = await expectHttp(deleteFinancing(financing.ref, { expectedUpdatedAt: detail.updatedAt }), 409);
      expect(error.fields?.installments).toBe("Este financiamiento tiene pagos registrados y no puede eliminarse. Puedes anularlo.");
      expect(await getFinancingDetail(financing.ref, NOW)).toMatchObject({ ref: financing.ref });
    });

    it("rechaza una versión antigua", async () => {
      const client = await seedClient();
      const created = await createFinancing(input(client.ref), NOW);
      const error = await expectHttp(deleteFinancing(created.ref, { expectedUpdatedAt: "2020-01-01T00:00:00.000Z" }), 409);
      expect(error.fields?.expectedUpdatedAt).toBe("El financiamiento cambió; recarga la página.");
    });
  });
});
