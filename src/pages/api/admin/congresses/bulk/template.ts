import { requireOwner } from "../../../../../server/auth/guards";
import { bulkErrorResponse, downloadResponse } from "../../../../../server/bulk/http";
import { buildCongressesTemplate } from "../../../../../server/congresses/bulk/service";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return downloadResponse(await buildCongressesTemplate());
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
