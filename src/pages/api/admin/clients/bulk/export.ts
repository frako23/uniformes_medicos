import { requireOwner } from "../../../../../server/auth/guards";
import { buildClientsExport } from "../../../../../server/clients/bulk/service";
import { bulkErrorResponse, downloadResponse } from "../../../../../server/bulk/http";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return downloadResponse(await buildClientsExport());
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
