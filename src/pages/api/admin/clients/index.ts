import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { createClient, listClientsPage } from "../../../../server/clients/service";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";
import { readJsonBody } from "../../../../server/http/params";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return jsonOk(await listClientsPage(Object.fromEntries(new URL(request.url).searchParams)));
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    return jsonOk({ data: await createClient(await readJsonBody(request)) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
