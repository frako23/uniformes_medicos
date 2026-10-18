import type { Client } from "../../db/schema";
import { todayInCaracas } from "../../utils/dates";
import { formatPhone } from "../../utils/phone";
import { normalizeKey } from "../../utils/text-keys";
import { whatsappUrl } from "../../utils/whatsapp";
import { pgErrorCode } from "../bulk/transaction";
import { fromCents, toCents } from "../financing/summary";
import { db } from "../db";
import { HttpError } from "../http/errors";
import { canonicalize, loadReferenceValues, type ReferenceField, type ReferenceIndex } from "../reference/values";
import { parseOrThrow } from "../validation/parse";
import {
  clientInputSchema,
  clientListQuerySchema,
  clientUpdateSchema,
  type ClientInput,
} from "../validation/clients";
import {
  clientHasFinancings,
  deleteClientByRef,
  findClientByPhone,
  getClientByRef,
  insertClient,
  listClientFinancings,
  listClients,
  updateClientIfUnchanged,
  type ClientFinancingRow,
  type ClientListRow,
  type ClientValues,
} from "./repository";

export interface ClientSummary {
  ref: number;
  name: string;
  phone: string;
  phoneE164: string;
  sex: "Mujer" | "Hombre" | null;
  size: string | null;
  city: string | null;
  hospital: string | null;
  clinic: string | null;
  specialty: string | null;
  balanceUsd: string;
  hasOverdue: boolean;
}

export interface ClientListResponse {
  data: ClientSummary[];
  page: number;
  pageSize: number;
  total: number;
  totalClients: number;
  totalPages: number;
}

export interface ClientDetail extends ClientSummary {
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  whatsappUrl: string;
  financings: ClientFinancingRow[];
}

const NOT_FOUND = () => new HttpError(404, "NOT_FOUND", "Cliente no encontrado.");
const HAS_FINANCINGS = () =>
  new HttpError(409, "CONFLICT", "El cliente tiene financiamientos y no puede eliminarse.", {
    client: "El cliente tiene financiamientos y no puede eliminarse.",
  });

const toSummary = (row: ClientListRow): ClientSummary => ({ ...row, phone: formatPhone(row.phoneE164) });

export async function listClientsPage(rawQuery: Record<string, unknown>, now: Date = new Date()): Promise<ClientListResponse> {
  const query = clientListQuerySchema.parse(rawQuery);
  const result = await listClients(db(), query, todayInCaracas(now));
  return {
    data: result.data.map(toSummary),
    page: query.page,
    pageSize: query.pageSize,
    total: result.total,
    totalClients: result.totalClients,
    totalPages: Math.max(1, Math.ceil(result.total / query.pageSize)),
  };
}

async function detailFor(client: Client, now: Date): Promise<ClientDetail> {
  const today = todayInCaracas(now);
  const financings = await listClientFinancings(db(), client.id, today);
  const open = financings.filter((financing) => financing.status !== "anulado");
  const balanceCents = open.reduce((sum, financing) => sum + toCents(financing.balanceUsd), 0);
  return {
    ref: client.ref,
    name: client.name,
    phone: formatPhone(client.phoneE164),
    phoneE164: client.phoneE164,
    sex: client.sex,
    size: client.size,
    city: client.city,
    hospital: client.hospital,
    clinic: client.clinic,
    specialty: client.specialty,
    balanceUsd: fromCents(balanceCents),
    hasOverdue: open.some((financing) => financing.status === "con_vencidas"),
    notes: client.notes,
    createdAt: client.createdAt.toISOString(),
    updatedAt: client.updatedAt.toISOString(),
    whatsappUrl: whatsappUrl(client.phoneE164),
    financings,
  };
}

export async function getClientDetail(ref: number, now: Date = new Date()): Promise<ClientDetail> {
  const client = await getClientByRef(db(), ref);
  if (!client) throw NOT_FOUND();
  return detailFor(client, now);
}

const CANONICAL_FIELDS: ReferenceField[] = ["size", "city", "hospital", "clinic", "specialty"];

function toValues(input: ClientInput, index: ReferenceIndex): ClientValues {
  const values: ClientValues = {
    name: input.name,
    phoneE164: input.phoneE164,
    sex: input.sex,
    size: input.size,
    city: input.city,
    hospital: input.hospital,
    clinic: input.clinic,
    specialty: input.specialty,
    notes: input.notes,
    searchText: normalizeKey(input.name),
  };
  for (const field of CANONICAL_FIELDS) {
    const current = values[field];
    if (current) values[field] = canonicalize(index, field, current).value;
  }
  return values;
}

function phoneConflict(owner: Pick<Client, "name" | "ref">) {
  const message = `Este celular ya pertenece a ${owner.name} (#${owner.ref}).`;
  return new HttpError(409, "CONFLICT", message, { phone: message, phoneOwnerRef: String(owner.ref) });
}

async function assertPhoneFree(phoneE164: string, ownRef?: number) {
  const owner = await findClientByPhone(db(), phoneE164);
  if (owner && owner.ref !== ownRef) throw phoneConflict(owner);
}

async function translatePhoneRace(error: unknown, phoneE164: string, ownRef?: number): Promise<never> {
  if (error instanceof HttpError) throw error;
  if (pgErrorCode(error) === "23505") {
    const owner = await findClientByPhone(db(), phoneE164);
    if (owner && owner.ref !== ownRef) throw phoneConflict(owner);
  }
  console.error("clients.write failed", { code: pgErrorCode(error) ?? "unknown" });
  throw new HttpError(500, "DATABASE_ERROR", "No se pudo guardar el cliente. Inténtalo de nuevo.");
}

export async function createClient(rawInput: unknown, now: Date = new Date()): Promise<ClientDetail> {
  const input = parseOrThrow(clientInputSchema, rawInput);
  await assertPhoneFree(input.phoneE164);
  const values = toValues(input, await loadReferenceValues(db()));
  try {
    return await detailFor(await insertClient(db(), values), now);
  } catch (error) {
    return translatePhoneRace(error, input.phoneE164);
  }
}

export async function updateClient(ref: number, rawInput: unknown, now: Date = new Date()): Promise<ClientDetail> {
  const input = parseOrThrow(clientUpdateSchema, rawInput);
  const existing = await getClientByRef(db(), ref);
  if (!existing) throw NOT_FOUND();
  await assertPhoneFree(input.phoneE164, ref);
  const values = toValues(input, await loadReferenceValues(db()));
  try {
    const updated = await updateClientIfUnchanged(db(), ref, values, input.expectedUpdatedAt);
    if (!updated) {
      const message = "El cliente cambió mientras lo editabas. Recarga la página.";
      throw new HttpError(409, "CONFLICT", message, { expectedUpdatedAt: message });
    }
    return await detailFor(updated, now);
  } catch (error) {
    return translatePhoneRace(error, input.phoneE164, ref);
  }
}

export async function deleteClient(ref: number): Promise<void> {
  const existing = await getClientByRef(db(), ref);
  if (!existing) throw NOT_FOUND();
  if (await clientHasFinancings(db(), existing.id)) throw HAS_FINANCINGS();
  try {
    await deleteClientByRef(db(), ref);
  } catch (error) {
    if (pgErrorCode(error) === "23503") throw HAS_FINANCINGS();
    console.error("clients.delete failed", { code: pgErrorCode(error) ?? "unknown" });
    throw new HttpError(500, "DATABASE_ERROR", "No se pudo eliminar el cliente. Inténtalo de nuevo.");
  }
}
