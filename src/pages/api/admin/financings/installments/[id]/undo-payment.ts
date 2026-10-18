import { requireMutation } from "../../../../../../server/auth/guards";
import { undoInstallmentPayment } from "../../../../../../server/financing/payments";
import { apiErrorResponse, jsonOk } from "../../../../../../server/http/responses";

export const POST = async ({ request, params }: { request: Request; params: { id?: string } }) => {
  try {
    await requireMutation(request);
    return jsonOk({ data: await undoInstallmentPayment(params.id ?? "") });
  } catch (error) {
    return apiErrorResponse(error);
  }
};
