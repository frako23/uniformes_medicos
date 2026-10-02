import { requireMutation, requireOwner } from "../../../../server/auth/guards";
import { errorResponse } from "../../../../server/http/errors";
import { jsonOk } from "../../../../server/http/responses";
import { createProduct, listAdminProducts } from "../../../../server/catalog/admin-products";

export const GET = async ({ request }: { request: Request }) => {
  try {
    await requireOwner(request);
    const url = new URL(request.url);
    const parseBoolean = (value: string | null) =>
      value === null ? undefined : value === "true" ? true : value === "false" ? false : undefined;
    return jsonOk(
      await listAdminProducts({
        page: Number(url.searchParams.get("page") ?? 1),
        pageSize: Number(url.searchParams.get("pageSize") ?? 25),
        search: url.searchParams.get("search") ?? undefined,
        isPublished: parseBoolean(url.searchParams.get("isPublished")),
        isActive: parseBoolean(url.searchParams.get("isActive")),
        gender: ["Dama", "Caballero", "Unisex"].includes(url.searchParams.get("gender") ?? "")
          ? url.searchParams.get("gender") as "Dama" | "Caballero" | "Unisex"
          : undefined,
        type: url.searchParams.get("type") ?? undefined,
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
};

export const POST = async ({ request }: { request: Request }) => {
  try {
    await requireMutation(request);
    return Response.json({ data: await createProduct(await request.json()) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
};
