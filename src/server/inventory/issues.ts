export type IssueSeverity = "error" | "warning" | "notice";

export type FileRejectionCode =
  | "FILE_REQUIRED"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_XLSX"
  | "FILE_PROTECTED_OR_XLS"
  | "FILE_HAS_MACROS"
  | "FILE_UNREADABLE";

export type IssueCode =
  | "SHEET_NOT_FOUND"
  | "MISSING_COLUMNS"
  | "DUPLICATE_COLUMN"
  | "INVALID_SIZE_COLUMN"
  | "NO_PRODUCTS"
  | "TOO_MANY_PRODUCTS"
  | "INVALID_ID"
  | "UNKNOWN_ID"
  | "DUPLICATE_ID"
  | "REQUIRED"
  | "TOO_LONG"
  | "INVALID_TYPE"
  | "INVALID_GENDER"
  | "INVALID_PRICE"
  | "PRICE_DECIMALS"
  | "PRICE_TOO_HIGH"
  | "INVALID_YES_NO"
  | "INVALID_QUANTITY"
  | "EXISTING_SIZE_BLANK"
  | "AMBIGUOUS_SIZES"
  | "SKU_IN_USE"
  | "SKU_REPEATED"
  | "NEW_VALUE"
  | "NEW_SIZE"
  | "POSSIBLE_DUPLICATE"
  | "PUBLISHED_WITHOUT_IMAGES"
  | "PUBLISHED_WITHOUT_STOCK"
  | "BECOMES_AVAILABLE"
  | "BECOMES_UNAVAILABLE"
  | "MODIFIED_AFTER_DOWNLOAD"
  | "IGNORED_COLUMNS"
  | "MISSING_METADATA";

/** Incidencia agrupada, tal como viaja en la vista previa. */
export interface ValidationIssue {
  severity: IssueSeverity;
  code: IssueCode;
  column: string | null;
  message: string;
  rows: string[];
  count: number;
}

/** Incidencia individual, antes de agrupar. `row` es la fila de Excel. */
export interface RawIssue {
  severity: IssueSeverity;
  code: IssueCode;
  column: string | null;
  message: string;
  row: number | null;
}

export const FILE_REJECTION_MESSAGES: Record<FileRejectionCode, string> = {
  FILE_REQUIRED: "Selecciona un archivo de Excel (.xlsx).",
  FILE_TOO_LARGE: "El archivo supera 4 MB. Divide el inventario en varios archivos.",
  FILE_NOT_XLSX: "El archivo debe ser un Excel .xlsx basado en la plantilla.",
  FILE_PROTECTED_OR_XLS:
    "El archivo está protegido con contraseña o usa el formato antiguo .xls. Guárdalo como Excel (.xlsx) sin contraseña.",
  FILE_HAS_MACROS: "El archivo contiene macros. Guárdalo como Excel (.xlsx) sin macros.",
  FILE_UNREADABLE: "No se pudo leer el archivo. Ábrelo y guárdalo de nuevo como .xlsx.",
};

export class InventoryFileError extends Error {
  constructor(public readonly code: FileRejectionCode) {
    super(FILE_REJECTION_MESSAGES[code]);
    this.name = "InventoryFileError";
  }
}

const SEVERITY: Record<IssueCode, IssueSeverity> = {
  SHEET_NOT_FOUND: "error",
  MISSING_COLUMNS: "error",
  DUPLICATE_COLUMN: "error",
  INVALID_SIZE_COLUMN: "error",
  NO_PRODUCTS: "error",
  TOO_MANY_PRODUCTS: "error",
  INVALID_ID: "error",
  UNKNOWN_ID: "error",
  DUPLICATE_ID: "error",
  REQUIRED: "error",
  TOO_LONG: "error",
  INVALID_TYPE: "error",
  INVALID_GENDER: "error",
  INVALID_PRICE: "error",
  PRICE_DECIMALS: "error",
  PRICE_TOO_HIGH: "error",
  INVALID_YES_NO: "error",
  INVALID_QUANTITY: "error",
  EXISTING_SIZE_BLANK: "error",
  AMBIGUOUS_SIZES: "error",
  SKU_IN_USE: "error",
  SKU_REPEATED: "error",
  NEW_VALUE: "warning",
  NEW_SIZE: "warning",
  POSSIBLE_DUPLICATE: "warning",
  PUBLISHED_WITHOUT_IMAGES: "warning",
  PUBLISHED_WITHOUT_STOCK: "warning",
  BECOMES_AVAILABLE: "warning",
  BECOMES_UNAVAILABLE: "warning",
  MODIFIED_AFTER_DOWNLOAD: "warning",
  IGNORED_COLUMNS: "notice",
  MISSING_METADATA: "notice",
};

export interface IssueParams {
  /** Encabezado afectado; también rellena {columna} en las plantillas. */
  column?: string | null;
  row?: number | null;
  list?: string[];
  n?: number;
  id?: number;
  value?: string;
  /** Referencia legible para POSSIBLE_DUPLICATE: “ID 12” o “la fila 4”. */
  reference?: string;
}

function messageFor(code: IssueCode, params: IssueParams): string {
  const column = params.column ?? "";
  const list = (params.list ?? []).join(", ");
  switch (code) {
    case "SHEET_NOT_FOUND":
      return `No se encontró la hoja “Inventario”. Hojas del archivo: ${list}.`;
    case "MISSING_COLUMNS":
      return `Faltan columnas obligatorias: ${list}.`;
    case "DUPLICATE_COLUMN":
      return `La columna “${column}” aparece más de una vez.`;
    case "INVALID_SIZE_COLUMN":
      return `La columna “${column}” debe tener la forma “Talla M”, con una etiqueta de hasta 40 caracteres.`;
    case "NO_PRODUCTS":
      return "El archivo no contiene productos para procesar.";
    case "TOO_MANY_PRODUCTS":
      return `El archivo tiene ${formatCount(params.n ?? 0)} productos; el máximo es 5.000. Divídelo en varios archivos.`;
    case "INVALID_ID":
      return "El ID debe ser el número que trae el inventario descargado.";
    case "UNKNOWN_ID":
      return "No existe un producto con este ID. No modifiques la columna ID; déjala vacía para crear un producto nuevo.";
    case "DUPLICATE_ID":
      return "Este ID aparece en más de una fila.";
    case "REQUIRED":
      return `${column} es obligatorio. La celda está vacía o tiene un error de fórmula.`;
    case "TOO_LONG":
      return `${column} admite como máximo ${params.n ?? 160} caracteres.`;
    case "INVALID_TYPE":
      return `La celda contiene una fecha u otro tipo de dato no válido para ${column}.`;
    case "INVALID_GENDER":
      return "Usa Dama, Caballero o Unisex.";
    case "INVALID_PRICE":
      return "El precio debe ser un número mayor o igual a 0, sin símbolos ni texto.";
    case "PRICE_DECIMALS":
      return "El precio admite como máximo dos decimales.";
    case "PRICE_TOO_HIGH":
      return "El precio supera el máximo permitido (99.999.999,99).";
    case "INVALID_YES_NO":
      return "Usa Sí o No.";
    case "INVALID_QUANTITY":
      return "La cantidad debe ser un número entero mayor o igual a 0.";
    case "EXISTING_SIZE_BLANK":
      return "El producto ya tiene esta talla: escribe 0 para dejarla sin existencias. La carga masiva no elimina tallas.";
    case "AMBIGUOUS_SIZES":
      return `El producto tiene tallas duplicadas (${list}); unifícalas desde la edición del producto.`;
    case "SKU_IN_USE":
      return `El SKU ya pertenece al producto con ID ${params.id ?? ""}.`;
    case "SKU_REPEATED":
      return "El SKU se repite en varias filas del archivo.";
    case "NEW_VALUE":
      return `Se creará un valor nuevo de ${column}: “${params.value ?? ""}”. Revisa que no sea un error de escritura.`;
    case "NEW_SIZE":
      return `Se creará la talla nueva “${params.value ?? ""}”.`;
    case "POSSIBLE_DUPLICATE":
      return `Este producto nuevo se parece a ${params.reference ?? ""}.`;
    case "PUBLISHED_WITHOUT_IMAGES":
      return "Quedará publicado sin fotografías; agrégalas desde la edición del producto.";
    case "PUBLISHED_WITHOUT_STOCK":
      return "Quedará publicado sin existencias y se verá como no disponible.";
    case "BECOMES_AVAILABLE":
      return "Pasará a estar disponible en la vitrina.";
    case "BECOMES_UNAVAILABLE":
      return "Dejará de estar disponible en la vitrina.";
    case "MODIFIED_AFTER_DOWNLOAD":
      return "Este producto cambió después de descargar el archivo; se sobrescribirán sus valores actuales.";
    case "IGNORED_COLUMNS":
      return `Se ignoraron columnas no reconocidas: ${list}.`;
    case "MISSING_METADATA":
      return "No se encontró la fecha de generación; no se comprobará si hubo cambios después de la descarga.";
  }
}

function formatCount(value: number) {
  return value.toLocaleString("es-ES");
}

export function createIssue(code: IssueCode, params: IssueParams = {}): RawIssue {
  return {
    severity: SEVERITY[code],
    code,
    column: params.column ?? null,
    message: messageFor(code, params),
    row: params.row ?? null,
  };
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, notice: 2 };

function compactRows(rows: number[]): string[] {
  const sorted = [...new Set(rows)].sort((left, right) => left - right);
  const ranges: string[] = [];
  let start: number | undefined;
  let previous: number | undefined;
  const flush = () => {
    if (start === undefined || previous === undefined) return;
    ranges.push(start === previous ? String(start) : `${start}-${previous}`);
  };
  for (const row of sorted) {
    if (previous !== undefined && row === previous + 1) {
      previous = row;
      continue;
    }
    flush();
    start = row;
    previous = row;
  }
  flush();
  return ranges;
}

/** Agrupa por gravedad, código, columna y mensaje, compactando las filas en rangos. */
export function groupIssues(issues: RawIssue[]): ValidationIssue[] {
  const groups = new Map<string, { issue: RawIssue; rows: number[]; count: number }>();
  for (const issue of issues) {
    const key = JSON.stringify([issue.severity, issue.code, issue.column, issue.message]);
    const group = groups.get(key) ?? { issue, rows: [], count: 0 };
    group.count += 1;
    if (issue.row !== null) group.rows.push(issue.row);
    groups.set(key, group);
  }
  return [...groups.values()]
    .map(({ issue, rows, count }) => ({
      severity: issue.severity,
      code: issue.code,
      column: issue.column,
      message: issue.message,
      rows: compactRows(rows),
      count,
    }))
    .sort((left, right) => SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity]);
}

export function countIssues(issues: Array<Pick<ValidationIssue, "severity" | "count">>) {
  let errors = 0;
  let warnings = 0;
  for (const issue of issues) {
    if (issue.severity === "error") errors += issue.count;
    else if (issue.severity === "warning") warnings += issue.count;
  }
  return { errors, warnings };
}
