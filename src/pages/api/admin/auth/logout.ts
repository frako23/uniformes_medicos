import { clearSessionCookie, logout } from "../../../../server/auth/session";
import { requireMutation } from "../../../../server/auth/guards";
import { errorResponse } from "../../../../server/http/errors";
import { redirectTo } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  try {
    const csrfToken = request.headers.get("x-csrf-token") ?? undefined;
    await requireMutation(request, csrfToken);
    await logout(request);
    const headers = { "Set-Cookie": clearSessionCookie() };
    if (request.headers.get("content-type")?.includes("application/json")) {
      return Response.json({ ok: true }, { headers });
    }
    return redirectTo(request, "/admin/login", 303, headers);
  } catch (error) {
    return errorResponse(error);
  }
};
