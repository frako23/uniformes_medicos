import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { createCongress, listCongresses } from "../../../../server/congresses/service";
import { readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return jsonOk({ data: await listCongresses(Object.fromEntries(new URL(request.url).searchParams)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    return jsonOk({ data: await createCongress(await readJsonBody(request)) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
