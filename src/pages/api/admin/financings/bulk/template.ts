import { requireOwner } from "../../../../../server/auth/guards";
import { bulkErrorResponse, downloadResponse } from "../../../../../server/bulk/http";
import { buildFinancingsTemplate } from "../../../../../server/financing/bulk/service";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return downloadResponse(await buildFinancingsTemplate());
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
