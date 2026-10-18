import { requireOwner } from "../../../../server/auth/guards";
import { downloadResponse, inventoryErrorResponse } from "../../../../server/inventory/http";
import { buildInventoryExport } from "../../../../server/inventory/service";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    return downloadResponse(await buildInventoryExport());
  } catch (error) {
    return inventoryErrorResponse(error);
  }
};
