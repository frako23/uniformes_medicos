export type PhoneResult = { ok: true; e164: string } | { ok: false };

const INVALID: PhoneResult = { ok: false };

/** Normaliza un celular venezolano o internacional a E.164 (`+584142467789`). */
export function normalizePhone(input: string | number): PhoneResult {
  const raw = typeof input === "number" ? (Number.isFinite(input) ? String(Math.trunc(input)) : "") : input.trim();
  if (!raw) return INVALID;
  const plus = raw.startsWith("+");
  const body = plus ? raw.slice(1) : raw;
  if (/[^\d\s\-.()]/.test(body)) return INVALID;
  const digits = body.replace(/\D/g, "");
  if (!digits) return INVALID;

  if (plus) {
    if (digits.startsWith("58")) {
      return /^58[1-9]\d{9}$/.test(digits) ? { ok: true, e164: `+${digits}` } : INVALID;
    }
    if (digits.startsWith("0") || digits.length < 8 || digits.length > 15) return INVALID;
    return { ok: true, e164: `+${digits}` };
  }
  if (/^0\d{10}$/.test(digits)) return { ok: true, e164: `+58${digits.slice(1)}` };
  if (/^[1-9]\d{9}$/.test(digits)) return { ok: true, e164: `+58${digits}` };
  if (/^58[1-9]\d{9}$/.test(digits)) return { ok: true, e164: `+${digits}` };
  return INVALID;
}

export function formatPhone(e164: string): string {
  const match = /^\+58([1-9]\d{2})(\d{3})(\d{4})$/.exec(e164);
  return match ? `0${match[1]}-${match[2]}-${match[3]}` : e164;
}

/** Dígitos para buscar dentro de `phone_e164`; `null` si hay menos de 3. */
export function phoneSearchDigits(query: string): string | null {
  let digits = query.replace(/\D/g, "");
  if (digits.startsWith("58") && digits.length >= 12) digits = digits.slice(2);
  else if (query.trim().startsWith("+58")) digits = digits.slice(2);
  digits = digits.replace(/^0+/, "");
  return digits.length >= 3 ? digits : null;
}
