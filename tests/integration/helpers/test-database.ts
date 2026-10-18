import { migrate } from "drizzle-orm/postgres-js/migrator";
import { sql } from "drizzle-orm";
import { closeDb, getDb } from "../../../src/db/client";
import {
  clients,
  congresses,
  euroRates,
  financings,
  installments,
  productImages,
  productVariants,
  products,
} from "../../../src/db/schema";
import { normalizePhone } from "../../../src/utils/phone";
import { normalizeKey } from "../../../src/utils/text-keys";

export function hasTestDatabase() {
  return Boolean(process.env.TEST_DATABASE_URL);
}

function assertSafeDatabase(url: string) {
  const name = new URL(url).pathname.replace(/^\//, "");
  if (!name.endsWith("_test")) {
    throw new Error(`TEST_DATABASE_URL debe apuntar a una base cuyo nombre termine en _test (recibido: ${name}).`);
  }
}

export async function setupTestDatabase() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error("TEST_DATABASE_URL no está configurada.");
  assertSafeDatabase(url);
  process.env.DATABASE_URL = url;
  await migrate(getDb(), { migrationsFolder: "drizzle" });
}

export async function resetCatalog() {
  assertSafeDatabase(process.env.TEST_DATABASE_URL ?? "");
  await getDb().execute(sql`TRUNCATE product_images, product_variants, products RESTART IDENTITY CASCADE`);
}

export interface SeedProductInput {
  legacyId?: number;
  type?: string;
  manufacturer?: string;
  brand?: string;
  gender?: "Dama" | "Caballero" | "Unisex";
  price?: string;
  sku?: string | null;
  color?: string;
  isPublished?: boolean;
  isActive?: boolean;
  categoryId?: string | null;
  variants?: Array<{ sizeLabel: string; quantity: number }>;
  images?: number;
  deletedImages?: number;
  updatedAt?: Date;
}

let seedCounter = 0;

export async function seedProduct(input: SeedProductInput = {}) {
  const db = getDb();
  seedCounter += 1;
  const [product] = await db
    .insert(products)
    .values({
      ...(input.legacyId ? { legacyId: input.legacyId } : {}),
      legacyDocumentId: crypto.randomUUID(),
      legacyTypeLabel: input.type ?? "Bata",
      manufacturer: input.manufacturer ?? "Fab A",
      brand: input.brand ?? "Marca A",
      gender: input.gender ?? "Dama",
      price: input.price ?? "50.00",
      sku: input.sku ?? null,
      color: input.color ?? "Blanca",
      isPublished: input.isPublished ?? true,
      isActive: input.isActive ?? true,
      categoryId: input.categoryId ?? null,
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    })
    .returning();
  if (input.variants?.length) {
    await db.insert(productVariants).values(input.variants.map((variant) => ({ productId: product.id, ...variant })));
  }
  const imageRows = [
    ...Array.from({ length: input.images ?? 0 }, (_, position) => ({ position, deleted: false })),
    ...Array.from({ length: input.deletedImages ?? 0 }, (_, position) => ({ position: 100 + position, deleted: true })),
  ];
  if (imageRows.length) {
    await db.insert(productImages).values(
      imageRows.map((image) => ({
        productId: product.id,
        legacyUrl: `legacy-${seedCounter}-${image.position}`,
        storagePathname: `test/${seedCounter}-${image.position}.jpg`,
        storageUrl: `https://example.test/${seedCounter}-${image.position}.jpg`,
        mimeType: "image/jpeg",
        byteSize: 1,
        position: image.position,
        deletedAt: image.deleted ? new Date() : null,
      })),
    );
  }
  return product;
}

export async function teardownTestDatabase() {
  await closeDb();
}

/* Secciones de la 004 ------------------------------------------------- */

export async function resetSections() {
  assertSafeDatabase(process.env.TEST_DATABASE_URL ?? "");
  await getDb().execute(
    sql`TRUNCATE installments, financings, clients, congresses, euro_rates RESTART IDENTITY CASCADE`,
  );
}

export interface SeedClientInput {
  name?: string;
  phone?: string | number;
  sex?: "Mujer" | "Hombre" | null;
  size?: string | null;
  city?: string | null;
  hospital?: string | null;
  clinic?: string | null;
  specialty?: string | null;
  notes?: string | null;
  updatedAt?: Date;
}

let clientCounter = 0;

function clientValues(input: SeedClientInput) {
  clientCounter += 1;
  const name = input.name ?? `Cliente ${clientCounter}`;
  const phone = normalizePhone(input.phone ?? `0414${String(1_000_000 + clientCounter).slice(-7)}`);
  if (!phone.ok) throw new Error(`Celular de prueba inválido: ${String(input.phone)}`);
  return {
    name,
    phoneE164: phone.e164,
    sex: input.sex ?? null,
    size: input.size ?? null,
    city: input.city ?? null,
    hospital: input.hospital ?? null,
    clinic: input.clinic ?? null,
    specialty: input.specialty ?? null,
    notes: input.notes ?? null,
    searchText: normalizeKey(name),
    ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
  };
}

export async function seedClient(input: SeedClientInput = {}) {
  const [client] = await getDb().insert(clients).values(clientValues(input)).returning();
  return client;
}

/** Inserta muchos clientes en lotes (pruebas de rendimiento). */
export async function seedClients(inputs: SeedClientInput[]) {
  const db = getDb();
  const rows = inputs.map(clientValues);
  for (let index = 0; index < rows.length; index += 1_000) {
    await db.insert(clients).values(rows.slice(index, index + 1_000));
  }
}

export interface SeedInstallmentInput {
  dueDate: string;
  amount: string;
  isInitial?: boolean;
  /** Pendiente por defecto. */
  paid?:
    | { origin: "carga_masiva" }
    | { origin: "panel"; paidOn: string; currency: "USD" }
    | { origin: "panel"; paidOn: string; currency: "VES"; euroRate: string; amountVes: string; rateDate?: string };
  createdAt?: Date;
}

export interface SeedFinancingInput {
  clientId: string;
  description?: string;
  purchaseDate?: string;
  frequency?: "semanal" | "quincenal" | "mensual";
  origin?: "panel" | "carga_masiva";
  annulledAt?: Date | null;
  annulmentReason?: string | null;
  installments?: SeedInstallmentInput[];
  updatedAt?: Date;
}

export async function seedFinancing(input: SeedFinancingInput) {
  const db = getDb();
  const [financing] = await db
    .insert(financings)
    .values({
      clientId: input.clientId,
      description: input.description ?? "Uniformes quirúrgicos",
      purchaseDate: input.purchaseDate ?? "2026-09-01",
      frequency: input.frequency ?? "quincenal",
      origin: input.origin ?? "panel",
      annulledAt: input.annulledAt ?? null,
      annulmentReason: input.annulmentReason ?? null,
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    })
    .returning();
  const rows = (input.installments ?? [{ dueDate: "2026-09-15", amount: "50.00" }]).map((item) => {
    const paid = item.paid;
    const panel = paid && paid.origin === "panel" ? paid : null;
    const ves = panel && panel.currency === "VES" ? panel : null;
    return {
      financingId: financing.id,
      isInitial: item.isInitial ?? false,
      dueDate: item.dueDate,
      amountUsd: item.amount,
      status: paid ? ("pagada" as const) : ("pendiente" as const),
      paymentOrigin: paid?.origin ?? null,
      paidOn: panel?.paidOn ?? null,
      paymentCurrency: panel?.currency ?? null,
      euroRate: ves?.euroRate ?? null,
      euroRateDate: ves ? (ves.rateDate ?? ves.paidOn) : null,
      euroRateSource: ves ? ("oficial" as const) : null,
      amountVes: ves?.amountVes ?? null,
      paidRecordedAt: panel ? new Date() : null,
      ...(item.createdAt ? { createdAt: item.createdAt } : {}),
    };
  });
  const created = await db.insert(installments).values(rows).returning();
  return { ...financing, installments: created };
}

export interface SeedCongressInput {
  name?: string;
  startDate?: string;
  endDate?: string;
  venue?: string | null;
  specialty?: string | null;
  notes?: string | null;
  updatedAt?: Date;
}

let congressCounter = 0;

export async function seedCongress(input: SeedCongressInput = {}) {
  congressCounter += 1;
  const [congress] = await getDb()
    .insert(congresses)
    .values({
      name: input.name ?? `Congreso ${congressCounter}`,
      startDate: input.startDate ?? "2026-10-30",
      endDate: input.endDate ?? input.startDate ?? "2026-11-01",
      venue: input.venue ?? null,
      specialty: input.specialty ?? null,
      notes: input.notes ?? null,
      ...(input.updatedAt ? { updatedAt: input.updatedAt } : {}),
    })
    .returning();
  return congress;
}

export async function seedEuroRates(entries: Array<{ date: string; value: string; sourceValue?: string }>) {
  await getDb()
    .insert(euroRates)
    .values(
      entries.map((entry) => ({
        rateDate: entry.date,
        value: entry.value,
        sourceValue: entry.sourceValue ?? entry.value,
        fetchedAt: new Date(),
      })),
    );
}
