import { z } from "zod";
import { isValidIsoDate } from "../../utils/dates";
import { MAX_INSTALLMENTS } from "../../utils/financing-schedule";

export const FINANCING_LIMITS = {
  description: 500,
  reason: 500,
  reference: 160,
  maxInstallments: MAX_INSTALLMENTS,
  maxAmountUsd: 9_999_999_999.99,
} as const;

export const amountUsdSchema = z
  .string({ error: "Escribe un monto en dólares." })
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "Escribe un monto en dólares mayor que 0, con como máximo dos decimales.")
  .refine((value) => Number(value) > 0, "El monto debe ser mayor que 0.")
  .refine((value) => Number(value) <= FINANCING_LIMITS.maxAmountUsd, "El monto supera el máximo permitido.");

export const isoDateSchema = (message = "Escribe una fecha válida.") =>
  z.string({ error: message }).refine(isValidIsoDate, message);

const expectedUpdatedAt = z
  .string({ error: "Falta la versión del financiamiento." })
  .datetime({ error: "La versión del financiamiento no es válida." });

const description = z
  .string({ error: "La descripción es obligatoria." })
  .trim()
  .min(1, "La descripción es obligatoria.")
  .max(FINANCING_LIMITS.description, `La descripción admite como máximo ${FINANCING_LIMITS.description} caracteres.`);

const installmentInput = z.object({
  isInitial: z.boolean().default(false),
  dueDate: isoDateSchema("Escribe una fecha de vencimiento válida."),
  amountUsd: amountUsdSchema,
});

export const financingCreateSchema = z
  .object({
    clientRef: z.coerce.number({ error: "Elige un cliente." }).int("Elige un cliente.").positive("Elige un cliente."),
    description,
    purchaseDate: isoDateSchema("Escribe una fecha de compra válida."),
    frequency: z.enum(["semanal", "quincenal", "mensual"], { error: "Elige la frecuencia." }),
    installments: z
      .array(installmentInput)
      .min(1, "Agrega al menos una cuota.")
      .max(FINANCING_LIMITS.maxInstallments + 1, `Máximo ${FINANCING_LIMITS.maxInstallments} cuotas, más la inicial.`),
  })
  .superRefine((value, ctx) => {
    const initials = value.installments.filter((item) => item.isInitial);
    if (initials.length > 1) ctx.addIssue({ code: "custom", path: ["installments"], message: "Solo puede haber una cuota inicial." });
    if (value.installments.length - initials.length > FINANCING_LIMITS.maxInstallments) {
      ctx.addIssue({ code: "custom", path: ["installments"], message: `Máximo ${FINANCING_LIMITS.maxInstallments} cuotas, más la inicial.` });
    }
    value.installments.forEach((item, index) => {
      if (item.isInitial && item.dueDate !== value.purchaseDate) {
        ctx.addIssue({ code: "custom", path: ["installments", index, "dueDate"], message: "La inicial vence en la fecha de compra." });
      }
    });
  });

export const financingUpdateSchema = z.object({
  description,
  pendingInstallments: z
    .array(
      z.object({
        id: z.string().uuid("La cuota no es válida.").optional(),
        dueDate: isoDateSchema("Escribe una fecha de vencimiento válida."),
        amountUsd: amountUsdSchema,
      }),
    )
    .max(FINANCING_LIMITS.maxInstallments + 1),
  expectedUpdatedAt,
});

export const annulSchema = z.object({
  reason: z
    .preprocess(
      (value) => (typeof value === "string" ? value.trim() || null : value),
      z.string().max(FINANCING_LIMITS.reason, `El motivo admite como máximo ${FINANCING_LIMITS.reason} caracteres.`).nullable(),
    )
    .optional()
    .transform((value) => value ?? null),
  expectedUpdatedAt,
});

export const restoreSchema = z.object({ expectedUpdatedAt });
export const deleteSchema = z.object({ expectedUpdatedAt });

export type FinancingCreateInput = z.output<typeof financingCreateSchema>;
export type FinancingUpdateInput = z.output<typeof financingUpdateSchema>;

/* Pagos ---------------------------------------------------------------- */

const rateValueSchema = z
  .string({ error: "Escribe la tasa." })
  .trim()
  .regex(/^\d+(\.\d{1,2})?$/, "La tasa debe ser un número mayor que 0 con como máximo dos decimales.")
  .refine((value) => Number(value) > 0, "La tasa debe ser mayor que 0.")
  .refine((value) => Number(value) < 1e12, "La tasa es demasiado alta.");

export const paymentInputSchema = z
  .object({
    installmentIds: z
      .array(z.string().uuid("La cuota no es válida."))
      .min(1, "Elige al menos una cuota.")
      .max(100, "Elige como máximo 100 cuotas."),
    paidOn: isoDateSchema("Escribe una fecha de pago válida."),
    currency: z.enum(["USD", "VES"], { error: "Elige la moneda." }),
    rate: z
      .object({
        source: z.enum(["oficial", "manual"], { error: "Elige el origen de la tasa." }),
        value: rateValueSchema.optional(),
      })
      .optional(),
    reference: z
      .preprocess(
        (value) => (typeof value === "string" ? value.trim() || null : value),
        z.string().max(FINANCING_LIMITS.reference, `La referencia admite como máximo ${FINANCING_LIMITS.reference} caracteres.`).nullable(),
      )
      .optional()
      .transform((value) => value ?? null),
    partialAmountUsd: amountUsdSchema.optional(),
  })
  .superRefine((value, ctx) => {
    if (value.currency === "VES") {
      if (!value.rate) ctx.addIssue({ code: "custom", path: ["rate"], message: "Indica la tasa para pagar en bolívares." });
      else if (value.rate.source === "manual" && !value.rate.value) {
        ctx.addIssue({ code: "custom", path: ["rate", "value"], message: "Escribe la tasa." });
      }
    }
    if (value.partialAmountUsd !== undefined && value.installmentIds.length !== 1) {
      ctx.addIssue({ code: "custom", path: ["partialAmountUsd"], message: "El pago parcial solo aplica a una cuota." });
    }
  });

export type PaymentInput = z.output<typeof paymentInputSchema>;

const optionalRef = z.preprocess((value) => (value === "" || value === undefined ? undefined : value), z.coerce.number().int().positive().optional()).catch(undefined);
const optionalDate = z.preprocess((value) => (value === "" ? undefined : value), isoDateSchema().optional()).catch(undefined);

export const installmentsQuerySchema = z.object({
  status: z.enum(["overdue", "upcoming", "pending", "paid"]).default("pending").catch("pending"),
  client: optionalRef,
  from: optionalDate,
  to: optionalDate,
  page: z.preprocess((value) => Number(value ?? 1), z.number().int().min(1)).catch(1),
  pageSize: z
    .preprocess((value) => Number(value ?? 20), z.union([z.literal(20), z.literal(50), z.literal(100)]))
    .catch(20),
});

export type InstallmentsQuery = z.output<typeof installmentsQuerySchema>;

export const euroRateQuerySchema = z.object({ date: isoDateSchema("Escribe una fecha válida.").optional() });
