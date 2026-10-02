import { requireMutation } from "../../../../../../server/auth/guards";
import { errorResponse, HttpError } from "../../../../../../server/http/errors";
import { jsonOk } from "../../../../../../server/http/responses";
import { uploadImageForProduct } from "../../../../../../server/catalog/admin-images";

export const POST = async ({ request, params }: { request: Request; params: { publicId?: string } }) => {
  try {
    await requireMutation(request);
    if (!params.publicId) throw new HttpError(400, "VALIDATION_ERROR", "Falta el producto.");
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new HttpError(422, "VALIDATION_ERROR", "Debes seleccionar una imagen.");
    return jsonOk(
      { data: await uploadImageForProduct(params.publicId, file, { altText: form.get("altText"), caption: form.get("caption"), position: form.get("position") ?? 0 }) },
      { status: 201 },
    );
  } catch (error) {
    return errorResponse(error);
  }
};
