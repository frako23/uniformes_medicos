import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { deleteCongress, getCongressDetail, updateCongress } from "../../../../server/congresses/service";
import { parseRefParam, readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

type Context = { request: Request; params: { ref?: string } };

const congressRef = (params: Context["params"]) => parseRefParam(params.ref, "Congreso no encontrado.");

export const GET = async ({ request, params }: Context) => {
  try {
    await requireOwner(request);
    return jsonOk({ data: await getCongressDetail(congressRef(params)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const PATCH = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    const ref = congressRef(params);
    return jsonOk({ data: await updateCongress(ref, await readJsonBody(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const DELETE = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    const ref = congressRef(params);
    const body = (await readJsonBody(request)) as { expectedUpdatedAt?: unknown };
    const expectedUpdatedAt = body?.expectedUpdatedAt ?? new URL(request.url).searchParams.get("expectedUpdatedAt") ?? undefined;
    await deleteCongress(ref, { expectedUpdatedAt });
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
