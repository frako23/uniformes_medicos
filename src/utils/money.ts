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
