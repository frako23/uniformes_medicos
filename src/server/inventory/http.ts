import { HttpError, errorResponse } from "../http/errors";
import { downloadResponse, readUpload as readBulkUpload, type UploadedFile } from "../bulk/http";
import { InventoryFileError } from "./issues";

export { downloadResponse };

const FILE_TOO_LARGE_MESSAGE = "El archivo supera 4 MB. Divide el inventario en varios archivos.";

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Convierte cualquier error en la respuesta JSON estándar, sin guardar en caché. */
export function inventoryErrorResponse(error: unknown) {
  if (error instanceof InventoryFileError) {
    return withNoStore(
      errorResponse(new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { file: error.message })),
    );
  }
  return withNoStore(errorResponse(error));
}

export type UploadedInventoryFile = UploadedFile;

export function readUpload(request: Request): Promise<UploadedInventoryFile> {
  return readBulkUpload(request, { tooLargeMessage: FILE_TOO_LARGE_MESSAGE });
}
