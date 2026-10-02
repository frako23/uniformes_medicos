import { createSession, sessionCookie } from "../../../../server/auth/session";
import { findOwnerByEmail, updateLastLogin } from "../../../../server/auth/repository";
import { verifyPassword } from "../../../../server/auth/crypto";
import { errorResponse, HttpError } from "../../../../server/http/errors";
import { redirectTo } from "../../../../server/http/responses";

export const POST = async ({ request }: { request: Request }) => {
  const isJson = request.headers.get("content-type")?.includes("application/json") ?? false;
  try {
    const payload = await readPayload(request);
    const email = String(payload.email ?? "").trim().toLowerCase();
    const password = String(payload.password ?? "");
    const owner = email ? await findOwnerByEmail(email) : null;
    const valid = owner ? await verifyPassword(password, owner.passwordHash) : false;
    if (!owner || !valid || !owner.isActive) {
      throw new HttpError(401, "UNAUTHENTICATED", "El correo o la contraseña no son válidos.");
    }

    const session = await createSession(owner.id);
    await updateLastLogin(owner.id);
    const headers = { "Set-Cookie": sessionCookie(session.sessionToken, 8 * 60 * 60) };
    if (isJson) {
      return Response.json({ ok: true, csrfToken: session.csrfToken }, { headers });
    }
    return redirectTo(request, "/admin", 303, headers);
  } catch (error) {
    if (!isJson) return redirectTo(request, "/admin/login?error=1", 303);
    return errorResponse(error);
  }
};

async function readPayload(request: Request) {
  if (request.headers.get("content-type")?.includes("application/json")) {
    return (await request.json()) as Record<string, unknown>;
  }
  const form = await request.formData();
  return Object.fromEntries(form.entries());
}
