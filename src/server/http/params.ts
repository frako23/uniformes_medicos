import { HttpError } from "./errors";

/** `:ref` de una ruta administrativa: entero positivo o `404 NOT_FOUND`. */
export function parseRefParam(value: string | undefined, notFoundMessage = "Registro no encontrado."): number {
  if (!value || !/^[1-9]\d{0,9}$/.test(value)) throw new HttpError(404, "NOT_FOUND", notFoundMessage);
  const ref = Number(value);
  if (ref > 2_147_483_647) throw new HttpError(404, "NOT_FOUND", notFoundMessage);
  return ref;
}

/** Cuerpo JSON de una petición; un cuerpo ausente o inválido se valida como objeto vacío. */
export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return {};
  }
}
