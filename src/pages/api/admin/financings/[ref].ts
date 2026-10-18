import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { deleteFinancing, getFinancingDetail, updateFinancing } from "../../../../server/financing/service";
import { parseRefParam, readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

type Context = { request: Request; params: { ref?: string } };

const financingRef = (params: Context["params"]) => parseRefParam(params.ref, "Financiamiento no encontrado.");

export const GET = async ({ request, params }: Context) => {
  try {
    await requireOwner(request);
    return jsonOk({ data: await getFinancingDetail(financingRef(params)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const PATCH = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    const ref = financingRef(params);
    return jsonOk({ data: await updateFinancing(ref, await readJsonBody(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const DELETE = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    const ref = financingRef(params);
    const body = (await readJsonBody(request)) as { expectedUpdatedAt?: unknown };
    const expectedUpdatedAt = body?.expectedUpdatedAt ?? new URL(request.url).searchParams.get("expectedUpdatedAt") ?? undefined;
    await deleteFinancing(ref, { expectedUpdatedAt });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
