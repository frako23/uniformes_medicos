import { requireMutation } from "../../../../../server/auth/guards";
import { getSessionToken } from "../../../../../server/auth/session";
import { bulkErrorResponse, readUpload } from "../../../../../server/bulk/http";
import { previewClientsFile } from "../../../../../server/clients/bulk/service";
import { jsonOk } from "../../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    const upload = await readUpload(request);
    return jsonOk(
      await previewClientsFile({
        fileName: upload.fileName,
        bytes: upload.bytes,
        sessionToken: getSessionToken(request) ?? "",
      }),
    );
  } catch (error) {
    return bulkErrorResponse(error);
  }
};
