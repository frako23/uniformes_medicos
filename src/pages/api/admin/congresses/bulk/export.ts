import { requireOwner } from "../../../../../server/auth/guards";
import { bulkErrorResponse, downloadResponse } from "../../../../../server/bulk/http";
import { buildCongressesExport } from "../../../../../server/congresses/bulk/service";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return downloadResponse(await buildCongressesExport());
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
