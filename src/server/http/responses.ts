import { errorResponse } from "./errors";

export function jsonOk<T>(data: T, init: ResponseInit = {}) {
  return Response.json(data, { ...init, headers: { "Cache-Control": "no-store", ...init.headers } });
}

export function redirectTo(
  request: Request,
  location: string,
  status = 303,
  extraHeaders: HeadersInit = {},
) {
  const url = new URL(location, request.url);
  return new Response(null, {
    status,
    headers: { Location: url.toString(), ...extraHeaders },
  });
}

/** Igual que `errorResponse`, pero sin guardar en caché; para los endpoints JSON de las secciones. */
export function apiErrorResponse(error: unknown) {
  const response = errorResponse(error);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
