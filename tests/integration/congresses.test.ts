import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  createCongress,
  deleteCongress,
  findNextCongress,
  getCongressDetail,
  listCongresses,
  listPastCongresses,
  listUpcomingCongresses,
  updateCongress,
} from "../../src/server/congresses/service";
import { HttpError } from "../../src/server/http/errors";
import { hasTestDatabase, resetSections, seedClient, seedCongress, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;
const NOW = new Date("2026-10-18T16:00:00Z");

async function expectHttp(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  return error as HttpError;
}

run("congresos con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetSections);
  afterAll(teardownTestDatabase);

  it("el alta guarda la especialidad con su escritura canónica", async () => {
    await seedClient({ specialty: "Mastología" });
    const created = await createCongress({ name: "Congreso", startDate: "2026-10-30", endDate: "2026-11-01", specialty: "mastologia" });
    expect(created).toMatchObject({ specialty: "Mastología", days: 3 });
    const fresh = await createCongress({ name: "Otro", startDate: "2026-12-01", endDate: "2026-12-01", specialty: "  Nueva  " });
    expect(fresh).toMatchObject({ specialty: "Nueva", days: 1 });
  });

  it("la consulta por rango devuelve los que se superponen, ordenados, con days", async () => {
    await seedCongress({ name: "B", startDate: "2026-10-30", endDate: "2026-11-01" });
    await seedCongress({ name: "A", startDate: "2026-10-30", endDate: "2026-10-30" });
    await seedCongress({ name: "Antes", startDate: "2026-09-01", endDate: "2026-09-30" });
    await seedCongress({ name: "Después", startDate: "2026-11-02", endDate: "2026-11-03" });
    await seedCongress({ name: "Cubre", startDate: "2026-09-15", endDate: "2026-11-15" });
    const october = await listCongresses({ from: "2026-10-01", to: "2026-10-31" });
    expect(october.map((item) => item.name)).toEqual(["Cubre", "A", "B"]);
    expect(october.find((item) => item.name === "B")?.days).toBe(3);
    const november = await listCongresses({ from: "2026-11-01", to: "2026-11-30" });
    expect(november.map((item) => item.name)).toEqual(["Cubre", "B", "Después"]);
  });

  it("editar o eliminar con una versión antigua da 409", async () => {
    const created = await createCongress({ name: "Congreso", startDate: "2026-10-30", endDate: "2026-11-01" });
    const stale = created.updatedAt;
    const updated = await updateCongress(created.ref, { name: "Nuevo nombre", startDate: "2026-10-30", endDate: "2026-11-02", expectedUpdatedAt: stale });
    expect(updated).toMatchObject({ name: "Nuevo nombre", days: 4 });
    const error = await expectHttp(
      updateCongress(created.ref, { name: "Otra vez", startDate: "2026-10-30", endDate: "2026-11-02", expectedUpdatedAt: stale }),
      409,
    );
    expect(error.fields).toHaveProperty("expectedUpdatedAt");
    await expectHttp(deleteCongress(created.ref, { expectedUpdatedAt: stale }), 409);
    await deleteCongress(created.ref, { expectedUpdatedAt: updated.updatedAt });
    await expectHttp(getCongressDetail(created.ref), 404);
  });

  it("un ref inexistente da 404", async () => {
    await expectHttp(getCongressDetail(999), 404);
    await expectHttp(updateCongress(999, { name: "x", startDate: "2026-10-30", endDate: "2026-10-30", expectedUpdatedAt: NOW.toISOString() }), 404);
    await expectHttp(deleteCongress(999, { expectedUpdatedAt: NOW.toISOString() }), 404);
  });

  it("la fecha de fin anterior da 422 en endDate", async () => {
    const error = await expectHttp(createCongress({ name: "x", startDate: "2026-10-30", endDate: "2026-10-29" }), 422);
    expect(error.fields?.endDate).toBe("La fecha de fin no puede ser anterior a la de inicio.");
  });

  it("separa próximos y pasados, y encuentra el próximo congreso después de una fecha", async () => {
    await seedCongress({ name: "Pasado viejo", startDate: "2026-01-10", endDate: "2026-01-12" });
    await seedCongress({ name: "Pasado reciente", startDate: "2026-09-10", endDate: "2026-09-12" });
    await seedCongress({ name: "En curso", startDate: "2026-10-17", endDate: "2026-10-19" });
    await seedCongress({ name: "Futuro lejano", startDate: "2027-03-01", endDate: "2027-03-02" });
    await seedCongress({ name: "Futuro cercano", startDate: "2026-11-05", endDate: "2026-11-06" });
    expect((await listUpcomingCongresses(NOW)).map((item) => item.name)).toEqual(["En curso", "Futuro cercano", "Futuro lejano"]);
    expect((await listPastCongresses(NOW)).map((item) => item.name)).toEqual(["Pasado reciente", "Pasado viejo"]);
    expect((await findNextCongress("2026-10-18"))?.name).toBe("Futuro cercano");
    expect(await findNextCongress("2028-01-01")).toBeNull();
  });
});
