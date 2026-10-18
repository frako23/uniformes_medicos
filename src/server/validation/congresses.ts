import { z } from "zod";
import { isValidIsoDate } from "../../utils/dates";

export const CONGRESS_LIMITS = { name: 160, venue: 160, specialty: 160, notes: 1000 } as const;

export const END_BEFORE_START_MESSAGE = "La fecha de fin no puede ser anterior a la de inicio.";

const optionalText = (max: number, label: string) =>
  z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() || null : value),
      z.string().max(max, `${label} admite como máximo ${max} caracteres.`).nullable(),
    )
    .optional()
    .transform((value) => value ?? null);

const date = (message: string) => z.string({ error: message }).refine(isValidIsoDate, message);

const shape = {
  name: z
    .string({ error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(CONGRESS_LIMITS.name, `El nombre admite como máximo ${CONGRESS_LIMITS.name} caracteres.`),
  startDate: date("Escribe una fecha de inicio válida."),
  endDate: date("Escribe una fecha de fin válida."),
  venue: optionalText(CONGRESS_LIMITS.venue, "El lugar"),
  specialty: optionalText(CONGRESS_LIMITS.specialty, "La especialidad"),
  notes: optionalText(CONGRESS_LIMITS.notes, "Las notas"),
};

const expectedUpdatedAt = z
  .string({ error: "Falta la versión del congreso." })
  .datetime({ error: "La versión del congreso no es válida." });

const orderedDates = (value: { startDate: string; endDate: string }, ctx: z.RefinementCtx) => {
  if (isValidIsoDate(value.startDate) && isValidIsoDate(value.endDate) && value.endDate < value.startDate) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: END_BEFORE_START_MESSAGE });
  }
};

export const congressInputSchema = z.object(shape).superRefine(orderedDates);
export const congressUpdateSchema = z.object({ ...shape, expectedUpdatedAt }).superRefine(orderedDates);
export const congressDeleteSchema = z.object({ expectedUpdatedAt });

const optionalDate = z
  .preprocess((value) => (value === "" ? undefined : value), z.string().refine(isValidIsoDate).optional())
  .catch(undefined);
export const congressRangeQuerySchema = z.object({ from: optionalDate, to: optionalDate });

export type CongressInput = z.output<typeof congressInputSchema>;
export type CongressUpdateInput = z.output<typeof congressUpdateSchema>;
