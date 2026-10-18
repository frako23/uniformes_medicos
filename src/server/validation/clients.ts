import { z } from "zod";
import { normalizePhone } from "../../utils/phone";

export const CLIENT_LIMITS = {
  name: 160,
  size: 40,
  city: 160,
  hospital: 160,
  clinic: 160,
  specialty: 160,
  notes: 1000,
} as const;

export const INVALID_PHONE_MESSAGE =
  "El celular debe tener 10 dígitos sin el 0 inicial (por ejemplo, 0414-123-4567) o empezar por + y el código de país.";

/** Texto opcional: recortado y, si queda vacío, `null`. */
const optionalText = (max: number, label: string) =>
  z
    .preprocess((value) => (typeof value === "string" ? value.trim() || null : value), z.string().max(max, `${label} admite como máximo ${max} caracteres.`).nullable())
    .optional()
    .transform((value) => value ?? null);

const sexSchema = z
  .preprocess((value) => (value === "" ? null : value), z.enum(["Mujer", "Hombre"], { error: "Usa Mujer u Hombre." }).nullable())
  .optional()
  .transform((value) => value ?? null);

const clientShape = {
  name: z
    .string({ error: "El nombre es obligatorio." })
    .trim()
    .min(1, "El nombre es obligatorio.")
    .max(CLIENT_LIMITS.name, `El nombre admite como máximo ${CLIENT_LIMITS.name} caracteres.`),
  phone: z.union([z.string(), z.number()], { error: "El celular es obligatorio." }).transform((value, ctx) => {
    const result = normalizePhone(value);
    if (!result.ok) {
      ctx.addIssue({ code: "custom", message: typeof value === "string" && !value.trim() ? "El celular es obligatorio." : INVALID_PHONE_MESSAGE });
      return z.NEVER;
    }
    return result.e164;
  }),
  sex: sexSchema,
  size: optionalText(CLIENT_LIMITS.size, "La talla"),
  city: optionalText(CLIENT_LIMITS.city, "La ciudad"),
  hospital: optionalText(CLIENT_LIMITS.hospital, "El hospital"),
  clinic: optionalText(CLIENT_LIMITS.clinic, "La clínica"),
  specialty: optionalText(CLIENT_LIMITS.specialty, "La especialidad"),
  notes: optionalText(CLIENT_LIMITS.notes, "Las notas"),
};

const renamePhone = <T extends { phone: string }>({ phone, ...rest }: T) => ({ ...rest, phoneE164: phone });

export const clientInputSchema = z.object(clientShape).transform(renamePhone);

export const clientUpdateSchema = z
  .object({
    ...clientShape,
    expectedUpdatedAt: z.string({ error: "Falta la versión del cliente." }).datetime({ error: "La versión del cliente no es válida." }),
  })
  .transform(renamePhone);

export type ClientInput = z.output<typeof clientInputSchema>;
export type ClientUpdateInput = z.output<typeof clientUpdateSchema>;

export const CLIENT_PAGE_SIZES = [20, 50, 100] as const;

const filterText = z
  .string()
  .optional()
  .catch(undefined)
  .transform((value) => value?.trim().slice(0, 160) || undefined);

export const clientListQuerySchema = z.object({
  search: filterText,
  specialty: filterText,
  city: filterText,
  hospital: filterText,
  clinic: filterText,
  size: filterText,
  sex: z.enum(["Mujer", "Hombre"]).optional().catch(undefined),
  balance: z.enum(["pending", "overdue"]).optional().catch(undefined),
  page: z.preprocess((value) => Number(value ?? 1), z.number().int().min(1)).catch(1),
  pageSize: z
    .preprocess((value) => Number(value ?? 20), z.union([z.literal(20), z.literal(50), z.literal(100)]))
    .catch(20),
});

export type ClientListQuery = z.output<typeof clientListQuerySchema>;
