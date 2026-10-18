import { requireOwner } from "../../../../../server/auth/guards";
import { getInstallmentList } from "../../../../../server/financing/service";
import { apiErrorResponse, jsonOk } from "../../../../../server/http/responses";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    const { query: _query, ...response } = await getInstallmentList(Object.fromEntries(new URL(request.url).searchParams));
    return jsonOk(response);
  } catch (error) {
    return apiErrorResponse(error);
  }
};
