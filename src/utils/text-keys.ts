/** Clave de comparación: sin tildes, en minúsculas y con los espacios unidos y recortados. */
export function normalizeKey(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}
