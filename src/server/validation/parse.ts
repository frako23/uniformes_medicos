import type { ZodType, z } from "zod";
import { HttpError } from "../http/errors";

/** Primer mensaje por campo, para la respuesta `422 VALIDATION_ERROR`. */
export function fieldErrors(error: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.map(String).join(".") : "form";
    if (!(key in fields)) fields[key] = issue.message;
  }
  return fields;
}

export function parseOrThrow<S extends ZodType>(schema: S, input: unknown): z.output<S> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new HttpError(422, "VALIDATION_ERROR", "Revisa los campos indicados.", fieldErrors(parsed.error));
  }
  return parsed.data;
}
