import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { deleteClient, getClientDetail, updateClient } from "../../../../server/clients/service";
import { parseRefParam, readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

type Context = { request: Request; params: { ref?: string } };

const clientRef = (params: Context["params"]) => parseRefParam(params.ref, "Cliente no encontrado.");

export const GET = async ({ request, params }: Context) => {
  try {
    await requireOwner(request);
    return jsonOk({ data: await getClientDetail(clientRef(params)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const PATCH = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    const ref = clientRef(params);
    return jsonOk({ data: await updateClient(ref, await readJsonBody(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const DELETE = async ({ request, params }: Context) => {
  try {
    await requireMutation(request);
    await deleteClient(clientRef(params));
    return new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
