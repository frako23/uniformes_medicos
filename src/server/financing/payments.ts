import { and, eq, inArray } from "drizzle-orm";
import { installments } from "../../db/schema";
import { todayInCaracas } from "../../utils/dates";
import { toCents, usdToVes } from "../../utils/money";
import { pgErrorCode } from "../bulk/transaction";
import { withTransaction } from "../db";
import { HttpError } from "../http/errors";
import { paymentInputSchema } from "../validation/financing";
import { parseOrThrow } from "../validation/parse";
import { resolveEuroRate } from "./euro-rates";
import {
  listInstallmentsOfFinancings,
  lockFinancings,
  touchFinancing,
} from "./repository";
import { getFinancingDetail, type FinancingDetail } from "./service";
import { fromCents, installmentLabels } from "./summary";

export const NOT_PENDING_MESSAGE = "Algunas cuotas ya estaban pagadas o su financiamiento está anulado. Recarga la página.";
export const NO_RATE_MESSAGE = "No hay una tasa euro oficial para esa fecha; escríbela a mano.";

export interface PaymentResult {
  paid: Array<{ id: string; label: string; amountUsd: string; amountVes: string | null }>;
  created: Array<{ id: string; label: string; dueDate: string; amountUsd: string }>;
}

const conflict = (message: string, field: string) => new HttpError(409, "CONFLICT", message, { [field]: message });

export async function registerPayments(
  rawInput: unknown,
  options: { now?: Date; fetchImpl?: typeof fetch } = {},
): Promise<PaymentResult> {
  const input = parseOrThrow(paymentInputSchema, rawInput);
  const now = options.now ?? new Date();
  if (input.paidOn > todayInCaracas(now)) {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { paidOn: "La fecha de pago no puede ser posterior a hoy." });
  }

  // La tasa se resuelve en el servidor; nunca se usa un valor oficial enviado por el navegador.
  let rate: { value: string; rateDate: string | null; source: "oficial" | "manual" } | null = null;
  if (input.currency === "VES" && input.rate) {
    if (input.rate.source === "manual") {
      rate = { value: Number(input.rate.value).toFixed(2), rateDate: null, source: "manual" };
    } else {
      const resolved = await resolveEuroRate(input.paidOn, { now, fetchImpl: options.fetchImpl });
      if (!resolved.rate) throw conflict(NO_RATE_MESSAGE, "rate");
      rate = { value: resolved.rate.value, rateDate: resolved.rate.rateDate, source: "oficial" };
    }
  }

  const ids = [...new Set(input.installmentIds)];
  try {
    return await withTransaction(async (transaction) => {
      const found = await transaction.select().from(installments).where(inArray(installments.id, ids));
      if (found.length !== ids.length) throw conflict(NOT_PENDING_MESSAGE, "installments");
      const financingIds = [...new Set(found.map((row) => row.financingId))];
      const locked = await lockFinancings(transaction, financingIds);
      // Se vuelven a leer ya con los financiamientos bloqueados.
      const current = await transaction.select().from(installments).where(inArray(installments.id, ids));
      const annulled = new Set(locked.filter((row) => row.annulledAt).map((row) => row.id));
      if (current.some((row) => row.status !== "pendiente" || annulled.has(row.financingId))) {
        throw conflict(NOT_PENDING_MESSAGE, "installments");
      }

      let partialCents: number | null = null;
      if (input.partialAmountUsd !== undefined) {
        partialCents = toCents(input.partialAmountUsd);
        if (partialCents <= 0 || partialCents >= toCents(current[0].amountUsd)) {
          throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", {
            partialAmountUsd: "El monto recibido debe ser mayor que 0 y menor que el de la cuota.",
          });
        }
      }

      const created: Array<{ id: string; financingId: string }> = [];
      const paidIds: string[] = [];
      for (const row of current) {
        const amountUsd = partialCents !== null ? fromCents(partialCents) : row.amountUsd;
        await transaction
          .update(installments)
          .set({
            amountUsd,
            status: "pagada",
            paidOn: input.paidOn,
            paymentCurrency: input.currency,
            euroRate: rate?.value ?? null,
            euroRateDate: rate?.rateDate ?? null,
            euroRateSource: rate?.source ?? null,
            amountVes: rate ? usdToVes(amountUsd, rate.value) : null,
            paymentReference: input.reference,
            paymentOrigin: "panel",
            paidRecordedAt: now,
            updatedAt: now,
          })
          .where(and(eq(installments.id, row.id), eq(installments.status, "pendiente")));
        paidIds.push(row.id);
        if (partialCents !== null) {
          const [remainder] = await transaction
            .insert(installments)
            .values({
              financingId: row.financingId,
              isInitial: false,
              dueDate: row.dueDate,
              amountUsd: fromCents(toCents(row.amountUsd) - partialCents),
            })
            .returning({ id: installments.id });
          created.push({ id: remainder.id, financingId: row.financingId });
        }
      }
      for (const financingId of financingIds) await touchFinancing(transaction, financingId, now);

      const all = await listInstallmentsOfFinancings(transaction, financingIds);
      const labels = new Map<string, string>();
      for (const financingId of financingIds) {
        const own = all.filter((row) => row.financingId === financingId);
        for (const item of installmentLabels(own)) labels.set(item.id, item.label);
      }
      const byId = new Map(all.map((row) => [row.id, row]));
      return {
        paid: paidIds.map((id) => ({
          id,
          label: labels.get(id) ?? "",
          amountUsd: byId.get(id)!.amountUsd,
          amountVes: byId.get(id)!.amountVes,
        })),
        created: created.map(({ id }) => ({
          id,
          label: labels.get(id) ?? "",
          dueDate: byId.get(id)!.dueDate,
          amountUsd: byId.get(id)!.amountUsd,
        })),
      };
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error("financing.payments failed", { code: pgErrorCode(error) ?? "unknown" });
    throw new HttpError(500, "DATABASE_ERROR", "No se registró ningún pago. Inténtalo de nuevo.");
  }
}

/** Devuelve la cuota a pendiente y borra sus datos de pago. */
export async function undoInstallmentPayment(id: string, options: { now?: Date } = {}): Promise<FinancingDetail> {
  const now = options.now ?? new Date();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError(404, "NOT_FOUND", "Cuota no encontrada.");
  const ref = await withTransaction(async (transaction) => {
    const [row] = await transaction.select().from(installments).where(eq(installments.id, id));
    if (!row) throw new HttpError(404, "NOT_FOUND", "Cuota no encontrada.");
    const [financing] = await lockFinancings(transaction, [row.financingId]);
    const [current] = await transaction.select().from(installments).where(eq(installments.id, id));
    if (current.status !== "pagada") throw conflict("La cuota no está pagada.", "installments");
    await transaction
      .update(installments)
      .set({
        status: "pendiente",
        paidOn: null,
        paymentCurrency: null,
        euroRate: null,
        euroRateDate: null,
        euroRateSource: null,
        amountVes: null,
        paymentReference: null,
        paymentOrigin: null,
        paidRecordedAt: null,
        updatedAt: now,
      })
      .where(eq(installments.id, id));
    await touchFinancing(transaction, financing.id, now);
    return financing.ref;
  });
  return getFinancingDetail(ref, now);
}

