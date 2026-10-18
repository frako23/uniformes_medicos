import { requireMutation } from "../../../../server/auth/guards";
import { getSessionToken } from "../../../../server/auth/session";
import { HttpError } from "../../../../server/http/errors";
import { inventoryErrorResponse, readUpload } from "../../../../server/inventory/http";
import { applyInventoryFile } from "../../../../server/inventory/service";
import { jsonOk } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    const upload = await readUpload(request);
    if (!upload.previewToken) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", {
        previewToken: "Valida el archivo antes de confirmar.",
      });
    }
    const response = await applyInventoryFile({
      fileName: upload.fileName,
      bytes: upload.bytes,
      previewToken: upload.previewToken,
      sessionToken: getSessionToken(request) ?? "",
    });
    return jsonOk(response);
  } catch (error) {
    return inventoryErrorResponse(error);
  }
};
