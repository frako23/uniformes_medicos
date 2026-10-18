/**
 * Formato de montos del proyecto: símbolo `$` delante, punto como separador de
 * miles, coma como separador decimal y siempre 2 decimales (p. ej. `$1.234,50`).
 * No depende de ICU para que dé el mismo resultado en servidor y navegador.
 */
export function formatMoney(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "$0,00";
  const [integer, decimals] = Math.abs(amount).toFixed(2).split(".");
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = amount < 0 && Number(`${integer}.${decimals}`) !== 0 ? "-" : "";
  return `${sign}$${grouped},${decimals}`;
}

/** Monto en bolívares: `Bs 1.234,50`. */
export function formatBolivares(value: number | string | null | undefined): string {
  const amount = Number(value ?? 0);
  if (!Number.isFinite(amount)) return "Bs 0,00";
  return formatMoney(amount).replace("$", "Bs ");
}

/** Tasa euro: `Bs 985,73 por €`. */
export function formatEuroRate(value: number | string | null | undefined): string {
  return `${formatBolivares(value)} por €`;
}

/** Centavos enteros de un monto decimal con punto (`"25.5"` → 2550). */
export function toCents(amount: string): number {
  const negative = amount.startsWith("-");
  const [whole, fraction = ""] = amount.replace("-", "").split(".");
  const cents = Number(whole) * 100 + Number((fraction + "00").slice(0, 2));
  return negative ? -cents : cents;
}

/** Texto con dos decimales a partir de centavos enteros (2500 → `"25.00"`). */
export function fromCents(cents: number): string {
  const sign = cents < 0 ? "-" : "";
  const abs = Math.abs(cents);
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/** `round2(amountUsd × rate)` con centavos enteros y redondeo half-up; ambos valores son decimales con punto. */
export function usdToVes(amountUsd: string, rate: string): string {
  const product = BigInt(toCents(amountUsd)) * BigInt(toCents(rate));
  const cents = (product + 50n) / 100n;
  const text = cents.toString().padStart(3, "0");
  return `${text.slice(0, -2)}.${text.slice(-2)}`;
}
