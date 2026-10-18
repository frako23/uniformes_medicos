import { HttpError, errorResponse } from "../http/errors";
import { MAX_REQUEST_BYTES, XLSX_MIME_TYPE } from "../inventory/workbook-format";
import { BulkFileError } from "./issues";

function withNoStore(response: Response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

/** Convierte cualquier error en la respuesta JSON estándar, sin guardar en caché. */
export function bulkErrorResponse(error: unknown) {
  if (error instanceof BulkFileError) {
    return withNoStore(
      errorResponse(new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { file: error.message })),
    );
  }
  return withNoStore(errorResponse(error));
}

/** Descarga binaria de un libro `.xlsx`. */
export function downloadResponse(file: { fileName: string; bytes: Uint8Array }) {
  return new Response(file.bytes as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": XLSX_MIME_TYPE,
      "Content-Disposition": `attachment; filename="${file.fileName}"`,
      "Content-Length": String(file.bytes.byteLength),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

/** Rechaza antes de leer el cuerpo cuando la petición declara más de 4,5 MB. */
export function assertRequestSize(request: Request, tooLargeMessage: string) {
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_REQUEST_BYTES) {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { file: tooLargeMessage });
  }
}

export interface UploadedFile {
  fileName: string;
  bytes: Uint8Array;
  previewToken: string | null;
}

export async function readUpload(
  request: Request,
  options: { tooLargeMessage?: string } = {},
): Promise<UploadedFile> {
  assertRequestSize(request, options.tooLargeMessage ?? "El archivo supera 4 MB. Divide el archivo en varios.");
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { file: "Selecciona un archivo de Excel (.xlsx)." });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", { file: "Selecciona un archivo de Excel (.xlsx)." });
  }
  const token = form.get("previewToken");
  return {
    fileName: file.name,
    bytes: new Uint8Array(await file.arrayBuffer()),
    previewToken: typeof token === "string" && token ? token : null,
  };
}
