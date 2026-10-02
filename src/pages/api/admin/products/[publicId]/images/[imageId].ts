import { requireMutation } from "../../../../../../server/auth/guards";
import { errorResponse, HttpError } from "../../../../../../server/http/errors";
import { jsonOk } from "../../../../../../server/http/responses";
import { deleteImageFromProduct, updateImageMetadata } from "../../../../../../server/catalog/admin-images";

export const PATCH = async ({ request, params }: { request: Request; params: { publicId?: string; imageId?: string } }) => {
  try {
    await requireMutation(request);
    if (!params.publicId || !params.imageId) throw new HttpError(400, "VALIDATION_ERROR", "Falta la imagen.");
    return jsonOk({ data: await updateImageMetadata(params.publicId, params.imageId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE = async ({ request, params }: { request: Request; params: { publicId?: string; imageId?: string } }) => {
  try {
    await requireMutation(request);
    if (!params.publicId || !params.imageId) throw new HttpError(400, "VALIDATION_ERROR", "Falta la imagen.");
    return jsonOk({ data: await deleteImageFromProduct(params.publicId, params.imageId) });
  } catch (error) {
    return errorResponse(error);
  }
};
