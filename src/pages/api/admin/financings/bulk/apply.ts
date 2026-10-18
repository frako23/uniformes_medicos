import { requireMutation } from "../../../../../server/auth/guards";
import { getSessionToken } from "../../../../../server/auth/session";
import { bulkErrorResponse, readUpload } from "../../../../../server/bulk/http";
import { applyFinancingsFile } from "../../../../../server/financing/bulk/service";
import { HttpError } from "../../../../../server/http/errors";
import { jsonOk } from "../../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    const upload = await readUpload(request);
    if (!upload.previewToken) {
      throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", {
        previewToken: "Valida el archivo antes de confirmar.",
      });
    }
    return jsonOk(
      await applyFinancingsFile({
        fileName: upload.fileName,
        bytes: upload.bytes,
        previewToken: upload.previewToken,
        sessionToken: getSessionToken(request) ?? "",
      }),
    );
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
