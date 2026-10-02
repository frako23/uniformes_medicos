import { HttpError } from "../http/errors";
import { getSession, validateCsrf } from "./session";

export async function requireOwner(request: Request) {
  const session = await getSession(request);
  if (!session) {
    throw new HttpError(401, "UNAUTHENTICATED", "Debes iniciar sesión para continuar.");
  }
  return session;
}

export async function requireMutation(request: Request, csrfToken?: string) {
  const session = await requireOwner(request);
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) {
    throw new HttpError(403, "FORBIDDEN", "La solicitud no es válida.");
  }
  const validCsrf = await validateCsrf(
    request,
    csrfToken ?? request.headers.get("x-csrf-token") ?? undefined,
  );
  if (!validCsrf) {
    throw new HttpError(403, "FORBIDDEN", "La solicitud no es válida.");
  }
  return session;
}
