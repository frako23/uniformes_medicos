import { requireMutation } from "../../../../server/auth/guards";
import { createFinancing } from "../../../../server/financing/service";
import { readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    return jsonOk({ data: await createFinancing(await readJsonBody(request)) }, { status: 201 });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
