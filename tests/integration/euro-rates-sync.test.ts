import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { euroRates } from "../../src/db/schema";
import { ensureEuroRates, resetEuroRateSyncState, resolveEuroRate } from "../../src/server/financing/euro-rates";
import { hasTestDatabase, resetSections, seedEuroRates, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;
const NOW = new Date("2026-10-18T16:00:00Z");
const TODAY = "2026-10-18";

const item = (fecha: string, promedio: number) => ({ fuente: "oficial", compra: null, venta: null, promedio, fecha, moneda: "EUR" });
const json = (body: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" }, ...init });

run("sincronización de la tasa euro", () => {
  beforeAll(setupTestDatabase);
  beforeEach(async () => {
    await resetSections();
    resetEuroRateSyncState();
    vi.spyOn(console, "info").mockImplementation(() => {});
  });
  afterAll(teardownTestDatabase);

  const rows = () => getDb().select().from(euroRates);

  it("la primera sincronización inserta el histórico", async () => {
    const fetchImpl = vi.fn(async () => json([item("2026-10-15", 984.5), item("2026-10-16", 985.729808)]));
    const result = await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: NOW });
    expect(result).toMatchObject({ status: "ok", inserted: 2 });
    expect((await rows()).map((row) => [row.rateDate, row.value])).toEqual(
      expect.arrayContaining([["2026-10-16", "985.73"], ["2026-10-15", "984.50"]]),
    );
    const resolved = await resolveEuroRate("2026-10-18", { fetchImpl: fetchImpl as never, now: NOW });
    expect(resolved).toEqual({ status: "ok", rate: { value: "985.73", rateDate: "2026-10-16", source: "oficial" }, stale: false });
  });

  it.each([
    ["404", async () => new Response("no", { status: 404 })],
    ["tiempo agotado", async () => Promise.reject(new DOMException("timeout", "TimeoutError"))],
    ["JSON inválido", async () => new Response("<html>", { status: 200 })],
    ["cuerpo enorme", async () => new Response(new Blob([new Uint8Array(2 * 1024 * 1024 + 10)]), { status: 200 })],
  ])("%s: no escribe nada y devuelve la última tasa guardada como desactualizada", async (_name, fetchImpl) => {
    await seedEuroRates([{ date: "2026-10-16", value: "985.73" }]);
    const result = await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: NOW });
    expect(result).toMatchObject({ status: "failed", inserted: 0 });
    expect(await rows()).toHaveLength(1);
    const resolved = await resolveEuroRate("2026-10-18", { fetchImpl: fetchImpl as never, now: NOW });
    expect(resolved.rate?.value).toBe("985.73");
    expect(resolved.stale).toBe(true);
  });

  it("sin ninguna tasa guardada la respuesta es unavailable", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    const resolved = await resolveEuroRate("2026-10-18", { fetchImpl: fetchImpl as never, now: NOW });
    expect(resolved).toMatchObject({ status: "unavailable", rate: null });
  });

  it("una tasa existente no cambia aunque la fuente devuelva otro valor", async () => {
    await seedEuroRates([{ date: "2026-10-16", value: "985.73" }]);
    const fetchImpl = vi.fn(async () => json([item("2026-10-16", 999.99), item("2026-10-17", 986.1)]));
    const result = await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: NOW });
    expect(result.inserted).toBe(1);
    const stored = Object.fromEntries((await rows()).map((row) => [row.rateDate, row.value]));
    expect(stored["2026-10-16"]).toBe("985.73");
    expect(stored["2026-10-17"]).toBe("986.10");
  });

  it("dos llamadas seguidas no repiten la descarga antes de 30 minutos", async () => {
    const fetchImpl = vi.fn(async () => new Response("no", { status: 500 }));
    await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: NOW });
    const second = await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: new Date(NOW.getTime() + 10 * 60_000) });
    expect(second.status).toBe("skipped");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: new Date(NOW.getTime() + 31 * 60_000) });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("no descarga si ya hay la tasa de hoy", async () => {
    await seedEuroRates([{ date: TODAY, value: "990.00" }]);
    const fetchImpl = vi.fn(async () => json([]));
    expect((await ensureEuroRates(TODAY, { fetchImpl: fetchImpl as never, now: NOW })).status).toBe("skipped");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
