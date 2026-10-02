import { getPublicProductsByLegacyIds } from "../../server/catalog/public-products";
import { errorResponse, HttpError } from "../../server/http/errors";
import { jsonOk } from "../../server/http/responses";
import { publicCartSchema } from "../../server/validation/catalog";

export const POST = async ({ request }: { request: Request }) => {
  try {
    const body = await request.json().catch(() => null);
    const parsed = publicCartSchema.safeParse(body);
    if (!parsed.success) {
      throw new HttpError(422, "VALIDATION_ERROR", "La selección de productos no es válida.");
    }
    return jsonOk(await getPublicProductsByLegacyIds(parsed.data.ids));
  } catch (error) {
    return errorResponse(error);
  }
};
