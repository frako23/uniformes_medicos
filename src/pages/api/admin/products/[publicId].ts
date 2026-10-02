import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { errorResponse, HttpError } from "../../../../server/http/errors";
import { jsonOk } from "../../../../server/http/responses";
import { getProductByPublicId, updateProduct } from "../../../../server/catalog/admin-products";

export const GET = async ({ request, params }: { request: Request; params: { publicId?: string } }) => {
  try {
    await requireOwner(request);
    if (!params.publicId) throw new HttpError(400, "VALIDATION_ERROR", "Falta el identificador del producto.");
    const product = await getProductByPublicId(params.publicId);
    if (!product) throw new HttpError(404, "NOT_FOUND", "Producto no encontrado.");
    return jsonOk({ data: product });
  } catch (error) {
    return errorResponse(error);
  }
};

export const PATCH = async ({ request, params }: { request: Request; params: { publicId?: string } }) => {
  try {
    await requireMutation(request);
    if (!params.publicId) throw new HttpError(400, "VALIDATION_ERROR", "Falta el identificador del producto.");
    return jsonOk({ data: await updateProduct(params.publicId, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
};
