import { sql } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { getDb } from "../../src/db/client";
import { hasTestDatabase, resetSections, setupTestDatabase, teardownTestDatabase } from "./helpers/test-database";

const run = hasTestDatabase() ? describe : describe.skip;

async function pgCode(promise: Promise<unknown>) {
  const error = await promise.then(() => null, (reason: unknown) => reason);
  expect(error).not.toBeNull();
  let current = error as { code?: string; cause?: unknown } | null;
  while (current && !current.code && current.cause) current = current.cause as typeof current;
  return current?.code;
}

const db = () => getDb();

async function insertClient(phone = "+584141234567", name = "Ana") {
  const rows = await db().execute(
    sql`INSERT INTO clients (name, phone_e164, search_text) VALUES (${name}, ${phone}, ${name.toLowerCase()}) RETURNING id`,
  );
  return (rows as unknown as Array<{ id: string }>)[0].id;
}

async function insertFinancing(clientId: string) {
  const rows = await db().execute(
    sql`INSERT INTO financings (client_id, description, purchase_date) VALUES (${clientId}, 'Uniformes', '2026-09-01') RETURNING id`,
  );
  return (rows as unknown as Array<{ id: string }>)[0].id;
}

async function insertInstallment(financingId: string, columns: Record<string, unknown> = {}) {
  const base = { financing_id: financingId, due_date: "2026-09-15", amount_usd: "10.00", ...columns };
  const names = Object.keys(base).map((name) => sql.identifier(name));
  const values = Object.values(base).map((value) => sql`${value}`);
  return db().execute(sql`INSERT INTO installments (${sql.join(names, sql`, `)}) VALUES (${sql.join(values, sql`, `)})`);
}

run("esquema 0003", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetSections);
  afterAll(teardownTestDatabase);

  it("crea las cinco tablas y deja el celular diferible", async () => {
    const tables = (await db().execute(
      sql`SELECT table_name FROM information_schema.tables WHERE table_name IN ('clients','financings','installments','euro_rates','congresses')`,
    )) as unknown as unknown[];
    expect(tables).toHaveLength(5);
    const rows = (await db().execute(
      sql`SELECT condeferrable FROM pg_constraint WHERE conname = 'clients_phone_unique'`,
    )) as unknown as Array<{ condeferrable: boolean }>;
    expect(rows[0].condeferrable).toBe(true);
  });

  it("no admite un ref explícito (identidad GENERATED ALWAYS)", async () => {
    const code = await pgCode(
      db().execute(sql`INSERT INTO clients (ref, name, phone_e164, search_text) VALUES (5, 'A', '+584141234567', 'a')`),
    );
    expect(code).toBe("428C9");
  });

  describe("celular", () => {
    it("rechaza un formato inválido", async () => {
      expect(await pgCode(insertClient("04141234567"))).toBe("23514");
    });
    it("rechaza un celular repetido", async () => {
      await insertClient("+584141234567", "Ana");
      expect(await pgCode(insertClient("+584141234567", "Luz"))).toBe("23505");
    });
    it("permite intercambiar celulares con la restricción diferida", async () => {
      const a = await insertClient("+584141111111", "Ana");
      const b = await insertClient("+584142222222", "Luz");
      await db().transaction(async (tx) => {
        await tx.execute(sql`SET CONSTRAINTS clients_phone_unique DEFERRED`);
        await tx.execute(sql`UPDATE clients SET phone_e164 = '+584142222222' WHERE id = ${a}`);
        await tx.execute(sql`UPDATE clients SET phone_e164 = '+584141111111' WHERE id = ${b}`);
      });
      const rows = (await db().execute(sql`SELECT phone_e164 FROM clients WHERE id = ${a}`)) as unknown as Array<{
        phone_e164: string;
      }>;
      expect(rows[0].phone_e164).toBe("+584142222222");
    });
  });

  describe("textos y relaciones", () => {
    it("rechaza un texto opcional vacío", async () => {
      expect(
        await pgCode(
          db().execute(sql`INSERT INTO clients (name, phone_e164, search_text, city) VALUES ('A', '+584141234567', 'a', '')`),
        ),
      ).toBe("23514");
    });
    it("no elimina un cliente con financiamientos", async () => {
      const clientId = await insertClient();
      await insertFinancing(clientId);
      expect(await pgCode(db().execute(sql`DELETE FROM clients WHERE id = ${clientId}`))).toBe("23503");
    });
    it("elimina las cuotas junto con el financiamiento", async () => {
      const financingId = await insertFinancing(await insertClient());
      await insertInstallment(financingId);
      await db().execute(sql`DELETE FROM financings WHERE id = ${financingId}`);
      const rows = (await db().execute(sql`SELECT count(*)::int AS n FROM installments`)) as unknown as Array<{ n: number }>;
      expect(rows[0].n).toBe(0);
    });
  });

  describe("coherencia de installments", () => {
    let financingId: string;
    beforeEach(async () => {
      financingId = await insertFinancing(await insertClient());
    });

    it.each([
      ["pendiente con paid_on", { paid_on: "2026-09-10" }],
      [
        "pagada sin payment_origin",
        { status: "pagada", paid_on: "2026-09-10", payment_currency: "USD", paid_recorded_at: "2026-09-10" },
      ],
      [
        "pagada del panel sin paid_on",
        { status: "pagada", payment_origin: "panel", payment_currency: "USD", paid_recorded_at: "2026-09-10" },
      ],
      [
        "pagada por carga masiva con payment_currency",
        { status: "pagada", payment_origin: "carga_masiva", payment_currency: "USD" },
      ],
      [
        "pago VES sin euro_rate",
        {
          status: "pagada",
          payment_origin: "panel",
          paid_on: "2026-09-10",
          payment_currency: "VES",
          paid_recorded_at: "2026-09-10",
          euro_rate_source: "manual",
          amount_ves: "100.00",
        },
      ],
      [
        "pago VES oficial sin euro_rate_date",
        {
          status: "pagada",
          payment_origin: "panel",
          paid_on: "2026-09-10",
          payment_currency: "VES",
          paid_recorded_at: "2026-09-10",
          euro_rate: "10.00",
          euro_rate_source: "oficial",
          amount_ves: "100.00",
        },
      ],
      [
        "pago USD con amount_ves",
        {
          status: "pagada",
          payment_origin: "panel",
          paid_on: "2026-09-10",
          payment_currency: "USD",
          paid_recorded_at: "2026-09-10",
          amount_ves: "100.00",
        },
      ],
      ["monto cero", { amount_usd: "0" }],
    ])("rechaza %s", async (_label, columns) => {
      expect(await pgCode(insertInstallment(financingId, columns))).toBe("23514");
    });

    it("acepta un pago en bolívares completo", async () => {
      await insertInstallment(financingId, {
        status: "pagada",
        payment_origin: "panel",
        paid_on: "2026-09-10",
        payment_currency: "VES",
        paid_recorded_at: "2026-09-10",
        euro_rate: "10.00",
        euro_rate_date: "2026-09-10",
        euro_rate_source: "oficial",
        amount_ves: "100.00",
      });
    });

    it("rechaza una segunda cuota inicial", async () => {
      await insertInstallment(financingId, { is_initial: true });
      expect(await pgCode(insertInstallment(financingId, { is_initial: true }))).toBe("23505");
    });
  });

  it("rechaza un congreso que termina antes de empezar", async () => {
    expect(
      await pgCode(db().execute(sql`INSERT INTO congresses (name, start_date, end_date) VALUES ('C', '2026-10-10', '2026-10-09')`)),
    ).toBe("23514");
  });

  it("rechaza una tasa en cero", async () => {
    expect(
      await pgCode(
        db().execute(sql`INSERT INTO euro_rates (rate_date, value, source_value, fetched_at) VALUES ('2026-10-01', 0, 1, now())`),
      ),
    ).toBe("23514");
  });
});
