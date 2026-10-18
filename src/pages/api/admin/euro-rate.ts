import { requireOwner } from "../../../server/auth/guards";
import { resolveEuroRate } from "../../../server/financing/euro-rates";
import { HttpError } from "../../../server/http/errors";
import { apiErrorResponse, jsonOk } from "../../../server/http/responses";
import { euroRateQuerySchema } from "../../../server/validation/financing";
import { todayInCaracas } from "../../../utils/dates";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    const parsed = euroRateQuerySchema.safeParse({ date: new URL(request.url).searchParams.get("date") ?? undefined });
    if (!parsed.success) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { date: "Escribe una fecha válida." });
    const today = todayInCaracas();
    const date = parsed.data.date ?? today;
    if (date > today) throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { date: "La fecha no puede ser posterior a hoy." });
    return jsonOk(await resolveEuroRate(date));
  } catch (error) {
    return apiErrorResponse(error);
  }
};
