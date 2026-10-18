import { requireMutation } from "../../../../../server/auth/guards";
import { restoreFinancing } from "../../../../../server/financing/service";
import { parseRefParam, readJsonBody } from "../../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../../server/http/responses";

export const POST = async ({ request, params }: { request: Request; params: { ref?: string } }) => {
  try {
    await requireMutation(request);
    const ref = parseRefParam(params.ref, "Financiamiento no encontrado.");
    return jsonOk({ data: await restoreFinancing(ref, await readJsonBody(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
