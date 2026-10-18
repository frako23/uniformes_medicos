import { requireMutation } from "../../../../server/auth/guards";
import { registerPayments } from "../../../../server/financing/payments";
import { readJsonBody } from "../../../../server/http/params";
import { apiErrorResponse, jsonOk } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    return jsonOk({ data: await registerPayments(await readJsonBody(request)) });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
