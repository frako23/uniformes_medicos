import { requireMutation } from "../../../../../../server/auth/guards";
import { errorResponse } from "../../../../../../server/http/errors";
import { jsonOk } from "../../../../../../server/http/responses";
import { updateVariantQuantity } from "../../../../../../server/catalog/admin-variants";
import { getProductByPublicId } from "../../../../../../server/catalog/admin-products";

export const PATCH = async ({ request, params }: { request: Request; params: { publicId?: string; variantId?: string } }) => {
  try {
    await requireMutation(request);
    const product = params.publicId ? await getProductByPublicId(params.publicId) : null;
    if (!product || !params.variantId) return Response.json({ error: { code: "NOT_FOUND", message: "Talla no encontrada." } }, { status: 404 });
    const target = product.variants.find(
      (variant) => variant.id === params.variantId || String(variant.legacyId) === params.variantId,
    );
    if (!target) return Response.json({ error: { code: "NOT_FOUND", message: "Talla no encontrada." } }, { status: 404 });
    return jsonOk({ data: await updateVariantQuantity(product.id, target.id, await request.json()) });
  } catch (error) {
    return errorResponse(error);
  }
};
