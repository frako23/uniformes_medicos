import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { euroRates } from "../../src/db/schema";
import { resetEuroRateSyncState } from "../../src/server/financing/euro-rates";
import { registerPayments, undoInstallmentPayment } from "../../src/server/financing/payments";
import { getFinancingDetail, getInstallmentList } from "../../src/server/financing/service";
import { HttpError } from "../../src/server/http/errors";
import { hasTestDatabase, resetSections, seedClient, seedEuroRates, seedFinancing, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;
const NOW = new Date("2026-10-18T16:00:00Z");
const TODAY = "2026-10-18";
const downFetch = vi.fn(async () => new Response("no", { status: 500 })) as unknown as typeof fetch;

async function expectHttp(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  return error as HttpError;
}

const pay = (ids: string[], extra: Record<string, unknown> = {}) =>
  registerPayments({ installmentIds: ids, paidOn: TODAY, currency: "USD", ...extra }, { now: NOW, fetchImpl: downFetch });

run("pagos de cuotas con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetSections();
    resetEuroRateSyncState();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterAll(teardownTestDatabase);

  async function financingWith(amounts: Array<[string, string]>, extra: { annulledAt?: Date } = {}) {
    const client = await seedClient();
    const financing = await seedFinancing({
      clientId: client.id,
      annulledAt: extra.annulledAt,
      installments: amounts.map(([dueDate, amount]) => ({ dueDate, amount })),
    });
    return { client, financing, ids: financing.installments.sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((row) => row.id) };
  }

  describe("pagos", () => {
    it("en dólares, con referencia", async () => {
      const { financing, ids } = await financingWith([["2026-10-10", "25.00"], ["2026-11-10", "25.00"]]);
      const result = await pay([ids[0]], { reference: " pago móvil 1234 " });
      expect(result.paid).toEqual([{ id: ids[0], label: "1 de 2", amountUsd: "25.00", amountVes: null }]);
      const detail = await getFinancingDetail(financing.ref, NOW);
      expect(detail.installments[0].payment).toMatchObject({
        paidOn: TODAY, currency: "USD", rate: null, amountVes: null, reference: "pago móvil 1234", origin: "panel",
      });
      expect(detail).toMatchObject({ paidUsd: "25.00", balanceUsd: "25.00" });
    });

    it("en bolívares con tasa oficial: el servidor resuelve la tasa e ignora la enviada", async () => {
      await seedEuroRates([{ date: "2026-10-16", value: "991.16" }, { date: TODAY, value: "991.16" }]);
      const { financing, ids } = await financingWith([["2026-10-10", "25.00"]]);
      const result = await pay([ids[0]], { currency: "VES", rate: { source: "oficial", value: "1.00" } });
      expect(result.paid[0].amountVes).toBe("24779.00");
      const payment = (await getFinancingDetail(financing.ref, NOW)).installments[0].payment!;
      expect(payment.rate).toEqual({ value: "991.16", rateDate: TODAY, source: "oficial" });
    });

    it("en bolívares con tasa manual", async () => {
      const { financing, ids } = await financingWith([["2026-10-10", "33.33"]]);
      const result = await pay([ids[0]], { currency: "VES", rate: { source: "manual", value: "991.16" } });
      expect(result.paid[0].amountVes).toBe("33035.36");
      const payment = (await getFinancingDetail(financing.ref, NOW)).installments[0].payment!;
      expect(payment.rate).toEqual({ value: "991.16", rateDate: null, source: "manual" });
    });

    it("varias cuotas se pagan en una sola acción y la última deja el financiamiento Pagado", async () => {
      const { financing, ids } = await financingWith([["2026-10-10", "10.00"], ["2026-11-10", "15.00"]]);
      const result = await pay(ids);
      expect(result.paid).toHaveLength(2);
      expect((await getFinancingDetail(financing.ref, NOW)).status).toBe("pagado");
    });
  });

  it("pago parcial: divide la cuota y conserva el total", async () => {
    const { financing, ids } = await financingWith([["2026-10-20", "25.00"]]);
    const result = await pay([ids[0]], { partialAmountUsd: "10.00" });
    expect(result.paid[0].amountUsd).toBe("10.00");
    expect(result.created).toMatchObject([{ dueDate: "2026-10-20", amountUsd: "15.00" }]);
    const detail = await getFinancingDetail(financing.ref, NOW);
    expect(detail).toMatchObject({ totalUsd: "25.00", paidUsd: "10.00", balanceUsd: "15.00" });
    expect(detail.installments.map((item) => item.state)).toEqual(["pagada", "por_vencer"]);
  });

  describe("conflictos y errores", () => {
    it("dos pagos simultáneos de la misma cuota: uno se aplica y el otro recibe 409", async () => {
      const { ids } = await financingWith([["2026-10-10", "25.00"]]);
      const results = await Promise.allSettled([pay([ids[0]]), pay([ids[0]])]);
      expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
      const rejected = results.find((result) => result.status === "rejected") as PromiseRejectedResult;
      expect((rejected.reason as HttpError).status).toBe(409);
      expect((rejected.reason as HttpError).fields).toHaveProperty("installments");
    });

    it("pagar una cuota de un financiamiento anulado da 409 y no registra nada", async () => {
      const { ids } = await financingWith([["2026-10-10", "25.00"], ["2026-11-10", "25.00"]], { annulledAt: new Date("2026-10-01") });
      await expectHttp(pay(ids), 409);
      expect((await getDb().query.installments.findMany()).every((row) => row.status === "pendiente")).toBe(true);
    });

    it("todo o nada: una cuota ya pagada impide registrar las demás", async () => {
      const { ids } = await financingWith([["2026-10-10", "25.00"], ["2026-11-10", "25.00"]]);
      await pay([ids[0]]);
      await expectHttp(pay(ids), 409);
      expect((await getDb().query.installments.findMany()).filter((row) => row.status === "pagada")).toHaveLength(1);
    });

    it("sin ninguna tasa y con la fuente caída, la tasa oficial da 409 con fields.rate", async () => {
      expect(await getDb().select().from(euroRates)).toHaveLength(0);
      const { ids } = await financingWith([["2026-10-10", "25.00"]]);
      const error = await expectHttp(pay([ids[0]], { currency: "VES", rate: { source: "oficial" } }), 409);
      expect(error.fields?.rate).toBe("No hay una tasa euro oficial para esa fecha; escríbela a mano.");
    });

    it("422: fecha futura, parcial con varias cuotas y monto parcial fuera de rango", async () => {
      const { ids } = await financingWith([["2026-10-10", "25.00"], ["2026-11-10", "25.00"]]);
      await expectHttp(pay([ids[0]], { paidOn: "2026-10-19" }), 422);
      await expectHttp(pay(ids, { partialAmountUsd: "5.00" }), 422);
      await expectHttp(pay([ids[0]], { partialAmountUsd: "25.00" }), 422);
      await expectHttp(pay([ids[0]], { partialAmountUsd: "0" }), 422);
      await expectHttp(pay([ids[0]], { currency: "VES" }), 422);
    });
  });

  describe("deshacer", () => {
    it("devuelve la cuota a pendiente sin datos de pago", async () => {
      const { financing, ids } = await financingWith([["2026-10-10", "25.00"]]);
      await pay([ids[0]], { currency: "VES", rate: { source: "manual", value: "50.00" } });
      const detail = await undoInstallmentPayment(ids[0], { now: NOW });
      expect(detail.installments[0]).toMatchObject({ state: "vencida", payment: null });
      const [row] = await getDb().query.installments.findMany();
      expect(row).toMatchObject({ status: "pendiente", paidOn: null, euroRate: null, amountVes: null, paymentOrigin: null, paidRecordedAt: null });
      expect(detail.ref).toBe(financing.ref);
    });

    it("deshacer una cuota pendiente da 409", async () => {
      const { ids } = await financingWith([["2026-10-10", "25.00"]]);
      await expectHttp(undoInstallmentPayment(ids[0], { now: NOW }), 409);
    });
  });

  it("el resumen excluye anulados, cuenta lo cobrado del mes y deja fuera lo de la carga masiva", async () => {
    const client = await seedClient();
    await seedFinancing({
      clientId: client.id,
      installments: [
        { dueDate: "2026-10-01", amount: "10.00" },
        { dueDate: "2026-10-25", amount: "20.00" },
        { dueDate: "2026-12-01", amount: "40.00" },
        { dueDate: "2026-09-01", amount: "5.00", paid: { origin: "panel", paidOn: "2026-10-05", currency: "USD" } },
        { dueDate: "2026-09-02", amount: "7.00", paid: { origin: "carga_masiva" } },
        { dueDate: "2026-08-01", amount: "3.00", paid: { origin: "panel", paidOn: "2026-09-30", currency: "USD" } },
      ],
    });
    await seedFinancing({
      clientId: client.id,
      annulledAt: new Date("2026-10-02"),
      installments: [
        { dueDate: "2026-10-02", amount: "100.00" },
        { dueDate: "2026-09-02", amount: "50.00", paid: { origin: "panel", paidOn: "2026-10-03", currency: "USD" } },
      ],
    });
    const list = await getInstallmentList({}, { now: NOW, fetchImpl: downFetch });
    expect(list.summary).toMatchObject({
      receivableUsd: "70.00",
      overdueUsd: "10.00",
      next15DaysUsd: "20.00",
      collectedThisMonthUsd: "55.00",
      today: TODAY,
    });
    expect(list.rate).toBeNull();
    const overdue = await getInstallmentList({ status: "overdue" }, { now: NOW, fetchImpl: downFetch });
    expect(overdue.data.map((row) => row.amountUsd)).toEqual(["10.00", "100.00"]);
    expect(overdue.data[0]).toMatchObject({ state: "vencida", daysOverdue: 17, amountVesEquivalent: null });
    const paid = await getInstallmentList({ status: "paid" }, { now: NOW, fetchImpl: downFetch });
    expect(paid.data.at(-1)?.payment?.origin).toBe("carga_masiva");
  });

  it("calcula el equivalente en bolívares con la tasa oficial de hoy", async () => {
    await seedEuroRates([{ date: TODAY, value: "991.16" }]);
    const { } = await financingWith([["2026-10-25", "25.00"]]);
    const list = await getInstallmentList({}, { now: NOW, fetchImpl: downFetch });
    expect(list.rate).toEqual({ value: "991.16", rateDate: TODAY, source: "oficial" });
    expect(list.data[0].amountVesEquivalent).toBe("24779.00");
  });
});
