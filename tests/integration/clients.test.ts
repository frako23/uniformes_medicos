import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb } from "../../src/db/client";
import { financings } from "../../src/db/schema";
import { createClient, deleteClient, getClientDetail, listClientsPage, updateClient } from "../../src/server/clients/service";
import * as repository from "../../src/server/clients/repository";
import { HttpError } from "../../src/server/http/errors";
import {
  hasTestDatabase,
  resetSections,
  seedClient,
  seedClients,
  seedFinancing,
  setupTestDatabase,
  teardownTestDatabase,
} from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;
const NOW = new Date("2026-10-18T16:00:00Z");

async function expectHttp(promise: Promise<unknown>, status: number) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).toBeInstanceOf(HttpError);
  expect((error as HttpError).status).toBe(status);
  return error as HttpError;
}

run("clientes con PostgreSQL", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetSections);
  afterAll(teardownTestDatabase);

  describe("alta", () => {
    it("asigna ref, calcula search_text y usa la escritura canónica", async () => {
      await seedClient({ name: "Otro", hospital: "Los Magallanes", specialty: "Pediatría" });
      const created = await createClient(
        { name: "Álvarez Ruiz", phone: "0414-111-2222", hospital: "los magallanes", specialty: "pediatria", size: " tz9 " },
        NOW,
      );
      expect(created.ref).toBeGreaterThan(0);
      expect(created.hospital).toBe("Los Magallanes");
      expect(created.specialty).toBe("Pediatría");
      expect(created.size).toBe("tz9");
      expect(created.phone).toBe("0414-111-2222");
      const rows = await getDb().query.clients.findFirst({ where: (c, { eq }) => eq(c.ref, created.ref) });
      expect(rows?.searchText).toBe("alvarez ruiz");
    });

    it("conserva recortado un valor nuevo", async () => {
      const created = await createClient({ name: "Ana", phone: "0414-111-2222", city: "  Maracaibo " }, NOW);
      expect(created.city).toBe("Maracaibo");
    });
  });

  describe("celular repetido", () => {
    it("responde 409 con el dueño en alta y en edición", async () => {
      const owner = await seedClient({ name: "Luz Mora", phone: "0414 123 4567" });
      const other = await seedClient({ name: "Pedro", phone: "0424 000 1111" });

      const onCreate = await expectHttp(createClient({ name: "Nuevo", phone: "+58 414-1234567" }, NOW), 409);
      expect(onCreate.fields?.phone).toBe(`Este celular ya pertenece a Luz Mora (#${owner.ref}).`);
      expect(onCreate.fields?.phoneOwnerRef).toBe(String(owner.ref));

      const onUpdate = await expectHttp(
        updateClient(other.ref, { name: "Pedro", phone: "+58 414-1234567", expectedUpdatedAt: other.updatedAt.toISOString() }, NOW),
        409,
      );
      expect(onUpdate.fields?.phoneOwnerRef).toBe(String(owner.ref));
    });

    it("permite conservar el propio celular al editar", async () => {
      const client = await seedClient({ name: "Ana", phone: "0414 123 4567" });
      const updated = await updateClient(
        client.ref,
        { name: "Ana María", phone: "04141234567", expectedUpdatedAt: client.updatedAt.toISOString() },
        NOW,
      );
      expect(updated.name).toBe("Ana María");
    });
  });

  describe("edición concurrente", () => {
    it("rechaza un expectedUpdatedAt antiguo", async () => {
      const client = await seedClient({ name: "Ana", phone: "0414 123 4567" });
      const stale = client.updatedAt.toISOString();
      await updateClient(client.ref, { name: "Ana B", phone: "0414 123 4567", expectedUpdatedAt: stale }, NOW);
      const error = await expectHttp(
        updateClient(client.ref, { name: "Ana C", phone: "0414 123 4567", expectedUpdatedAt: stale }, NOW),
        409,
      );
      expect(error.fields?.expectedUpdatedAt).toBe("El cliente cambió mientras lo editabas. Recarga la página.");
    });

    it("responde 404 si el cliente no existe", async () => {
      await expectHttp(
        updateClient(999, { name: "X", phone: "0414 123 4567", expectedUpdatedAt: NOW.toISOString() }, NOW),
        404,
      );
    });
  });

  describe("búsqueda y filtros", () => {
    beforeEach(async () => {
      await seedClient({ name: "Álvarez Gómez", phone: "0414-123-4567", specialty: "Pediatría", city: "Caracas", sex: "Hombre", size: "L" });
      await seedClient({ name: "María Pérez", phone: "0424-765-4321", specialty: "Pediatría", city: "Valencia", sex: "Mujer", size: "M" });
      await seedClient({ name: "Luis Ruiz", phone: "0412-555-0000", specialty: "Cirugía", city: "Caracas", sex: "Hombre", size: "M" });
    });

    const names = async (query: Record<string, unknown>) => (await listClientsPage(query, NOW)).data.map((row) => row.name);

    it("ignora tildes y mayúsculas", async () => {
      expect(await names({ search: "alvarez" })).toEqual(["Álvarez Gómez"]);
      expect(await names({ search: "perez" })).toEqual(["María Pérez"]);
    });

    it("busca por dígitos del celular", async () => {
      expect(await names({ search: "4123" })).toEqual(["Álvarez Gómez"]);
      expect(await names({ search: "0424-765" })).toEqual(["María Pérez"]);
    });

    it("combina filtros", async () => {
      expect(await names({ specialty: "Pediatría", city: "Caracas" })).toEqual(["Álvarez Gómez"]);
      expect(await names({ size: "M", sex: "Mujer" })).toEqual(["María Pérez"]);
    });

    it("ordena por nombre normalizado y ref, y cuenta los totales", async () => {
      const page = await listClientsPage({ pageSize: "20" }, NOW);
      expect(page.data.map((row) => row.name)).toEqual(["Álvarez Gómez", "Luis Ruiz", "María Pérez"]);
      expect(page).toMatchObject({ total: 3, totalClients: 3, totalPages: 1, page: 1 });
      const filtered = await listClientsPage({ city: "Caracas" }, NOW);
      expect(filtered).toMatchObject({ total: 2, totalClients: 3 });
    });

    it("filtra por saldo pendiente y vencido, sin contar financiamientos anulados", async () => {
      const [alvarez, maria, luis] = await Promise.all(
        ["Álvarez Gómez", "María Pérez", "Luis Ruiz"].map(async (name) => (await listClientsPage({ search: name }, NOW)).data[0]),
      );
      const ids = async (ref: number) => (await getDb().query.clients.findFirst({ where: (c, { eq }) => eq(c.ref, ref) }))!.id;
      await seedFinancing({ clientId: await ids(alvarez.ref), installments: [{ dueDate: "2026-10-01", amount: "30.00" }] });
      await seedFinancing({ clientId: await ids(maria.ref), installments: [{ dueDate: "2026-11-01", amount: "20.00" }] });
      await seedFinancing({
        clientId: await ids(luis.ref),
        annulledAt: new Date("2026-10-10T00:00:00Z"),
        installments: [{ dueDate: "2026-09-01", amount: "99.00" }],
      });

      expect(await names({ balance: "pending" })).toEqual(["Álvarez Gómez", "María Pérez"]);
      expect(await names({ balance: "overdue" })).toEqual(["Álvarez Gómez"]);
      const page = await listClientsPage({}, NOW);
      const byName = Object.fromEntries(page.data.map((row) => [row.name, row]));
      expect(byName["Álvarez Gómez"]).toMatchObject({ balanceUsd: "30.00", hasOverdue: true });
      expect(byName["María Pérez"]).toMatchObject({ balanceUsd: "20.00", hasOverdue: false });
      expect(byName["Luis Ruiz"]).toMatchObject({ balanceUsd: "0.00", hasOverdue: false });
    });
  });

  it("la ficha incluye los financiamientos con total, pagado, saldo y estado", async () => {
    const client = await seedClient({ name: "Ana", phone: "0414 123 4567" });
    await seedFinancing({
      clientId: client.id,
      description: "Dos conjuntos",
      purchaseDate: "2026-09-01",
      installments: [
        { dueDate: "2026-09-01", amount: "40.00", isInitial: true, paid: { origin: "panel", paidOn: "2026-09-01", currency: "USD" } },
        { dueDate: "2026-10-01", amount: "30.00" },
        { dueDate: "2026-11-01", amount: "30.00" },
      ],
    });
    const detail = await getClientDetail(client.ref, NOW);
    expect(detail.financings).toEqual([
      {
        ref: expect.any(Number),
        description: "Dos conjuntos",
        purchaseDate: "2026-09-01",
        totalUsd: "100.00",
        paidUsd: "40.00",
        balanceUsd: "60.00",
        status: "con_vencidas",
      },
    ]);
    expect(detail).toMatchObject({ balanceUsd: "60.00", hasOverdue: true, whatsappUrl: "https://wa.me/584141234567" });
  });

  describe("eliminación", () => {
    it("elimina un cliente sin financiamientos", async () => {
      const client = await seedClient();
      await deleteClient(client.ref);
      await expectHttp(getClientDetail(client.ref, NOW), 404);
    });

    it("rechaza eliminar un cliente con financiamientos", async () => {
      const client = await seedClient();
      await seedFinancing({ clientId: client.id });
      const error = await expectHttp(deleteClient(client.ref), 409);
      expect(error.fields?.client).toBe("El cliente tiene financiamientos y no puede eliminarse.");
    });

    it("traduce el RESTRICT de un financiamiento creado después de la comprobación", async () => {
      const client = await seedClient();
      vi.spyOn(repository, "clientHasFinancings").mockImplementation(async () => {
        await getDb().insert(financings).values({ clientId: client.id, description: "x", purchaseDate: "2026-10-01" });
        return false;
      });
      const error = await expectHttp(deleteClient(client.ref), 409);
      expect(error.fields?.client).toBe("El cliente tiene financiamientos y no puede eliminarse.");
    });
  });

  it("busca y filtra entre 10.000 clientes en menos de 2 s", async () => {
    await seedClients(
      Array.from({ length: 10_000 }, (_, index) => ({
        name: `Cliente ${String(index).padStart(5, "0")}`,
        phone: `+58412${String(1_000_000 + index).slice(-7)}`,
        specialty: index % 2 ? "Pediatría" : "Cirugía",
        city: index % 3 ? "Caracas" : "Valencia",
      })),
    );
    const started = performance.now();
    const searched = await listClientsPage({ search: "09999" }, NOW);
    const filtered = await listClientsPage({ specialty: "Pediatría", city: "Caracas", pageSize: "100" }, NOW);
    const elapsed = performance.now() - started;
    expect(searched.total).toBe(1);
    expect(filtered.total).toBeGreaterThan(1000);
    expect(elapsed).toBeLessThan(2000);
  });
});
