import type { Congress } from "../../db/schema";
import { daysBetween, todayInCaracas } from "../../utils/dates";
import { db } from "../db";
import { HttpError } from "../http/errors";
import { canonicalize, loadReferenceValues } from "../reference/values";
import {
  congressDeleteSchema,
  congressInputSchema,
  congressRangeQuerySchema,
  congressUpdateSchema,
  type CongressInput,
} from "../validation/congresses";
import { parseOrThrow } from "../validation/parse";
import {
  deleteCongressIfUnchanged,
  findNextCongressAfter,
  getCongressByRef,
  insertCongress,
  listCongressesInRange,
  listPast,
  listUpcoming,
  updateCongressIfUnchanged,
  type CongressValues,
} from "./repository";

export interface CongressDetail {
  ref: number;
  name: string;
  startDate: string;
  endDate: string;
  /** Incluye ambos extremos. */
  days: number;
  venue: string | null;
  specialty: string | null;
  notes: string | null;
  updatedAt: string;
}

export const toCongressDetail = (row: Congress): CongressDetail => ({
  ref: row.ref,
  name: row.name,
  startDate: row.startDate,
  endDate: row.endDate,
  days: daysBetween(row.startDate, row.endDate) + 1,
  venue: row.venue,
  specialty: row.specialty,
  notes: row.notes,
  updatedAt: row.updatedAt.toISOString(),
});

const notFound = () => new HttpError(404, "NOT_FOUND", "Congreso no encontrado.");
const changed = () => {
  const message = "El congreso cambió mientras lo editabas. Recarga la página.";
  return new HttpError(409, "CONFLICT", message, { expectedUpdatedAt: message });
};

async function toValues(input: CongressInput): Promise<CongressValues> {
  const values: CongressValues = {
    name: input.name,
    startDate: input.startDate,
    endDate: input.endDate,
    venue: input.venue,
    specialty: input.specialty,
    notes: input.notes,
  };
  if (values.specialty) {
    values.specialty = canonicalize(await loadReferenceValues(db()), "specialty", values.specialty).value;
  }
  return values;
}

/** Congresos que se superponen con el rango, por inicio y nombre. */
export async function listCongresses(rawQuery: Record<string, unknown>): Promise<CongressDetail[]> {
  const { from, to } = congressRangeQuerySchema.parse(rawQuery);
  const rows = await listCongressesInRange(db(), from ?? "0001-01-01", to ?? "9999-12-31");
  return rows.map(toCongressDetail);
}

export async function listUpcomingCongresses(now: Date = new Date()) {
  return (await listUpcoming(db(), todayInCaracas(now))).map(toCongressDetail);
}

export async function listPastCongresses(now: Date = new Date()) {
  return (await listPast(db(), todayInCaracas(now))).map(toCongressDetail);
}

export async function findNextCongress(afterDate: string) {
  const row = await findNextCongressAfter(db(), afterDate);
  return row ? toCongressDetail(row) : null;
}

export async function getCongressDetail(ref: number): Promise<CongressDetail> {
  const row = await getCongressByRef(db(), ref);
  if (!row) throw notFound();
  return toCongressDetail(row);
}

export async function createCongress(rawInput: unknown): Promise<CongressDetail> {
  const input = parseOrThrow(congressInputSchema, rawInput);
  return toCongressDetail(await insertCongress(db(), await toValues(input)));
}

export async function updateCongress(ref: number, rawInput: unknown): Promise<CongressDetail> {
  const input = parseOrThrow(congressUpdateSchema, rawInput);
  if (!(await getCongressByRef(db(), ref))) throw notFound();
  const updated = await updateCongressIfUnchanged(db(), ref, await toValues(input), input.expectedUpdatedAt);
  if (!updated) throw changed();
  return toCongressDetail(updated);
}

export async function deleteCongress(ref: number, rawInput: unknown): Promise<void> {
  const input = parseOrThrow(congressDeleteSchema, rawInput);
  if (!(await getCongressByRef(db(), ref))) throw notFound();
  if (!(await deleteCongressIfUnchanged(db(), ref, input.expectedUpdatedAt))) throw changed();
}
