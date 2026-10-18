import { requireMutation } from "../../../../server/auth/guards";
import { getSessionToken } from "../../../../server/auth/session";
import { inventoryErrorResponse, readUpload } from "../../../../server/inventory/http";
import { previewInventoryFile } from "../../../../server/inventory/service";
import { jsonOk } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    const upload = await readUpload(request);
    const response = await previewInventoryFile({
      fileName: upload.fileName,
      bytes: upload.bytes,
      sessionToken: getSessionToken(request) ?? "",
    });
    return jsonOk(response);
  } catch (error) {
    return inventoryErrorResponse(error);
  }
};
