export type IssueSeverity = "error" | "warning" | "notice";

export type FileRejectionCode =
  | "FILE_REQUIRED"
  | "FILE_TOO_LARGE"
  | "FILE_NOT_XLSX"
  | "FILE_PROTECTED_OR_XLS"
  | "FILE_HAS_MACROS"
  | "FILE_UNREADABLE";

/** Incidencia agrupada, tal como viaja en la vista previa. */
export interface ValidationIssue<C extends string = string> {
  severity: IssueSeverity;
  code: C;
  column: string | null;
  message: string;
  rows: string[];
  count: number;
}

/** Incidencia individual, antes de agrupar. `row` es la fila de Excel. */
export interface RawIssue<C extends string = string> {
  severity: IssueSeverity;
  code: C;
  column: string | null;
  message: string;
  row: number | null;
}

export interface IssueParams {
  /** Encabezado afectado; también rellena {columna} en las plantillas. */
  column?: string | null;
  row?: number | null;
  list?: string[];
  n?: number;
  limit?: number;
  id?: number;
  value?: string;
  /** Referencia legible: “#12”, “la fila 4”, etc. */
  reference?: string;
  /** Nombre de sección declarada (WRONG_SECTION). */
  declared?: string;
  /** Nombre de la sección actual (WRONG_SECTION). */
  section?: string;
  /** Texto libre adicional para plantillas específicas de una sección. */
  extra?: string;
}

export interface IssueDefinition {
  severity: IssueSeverity;
  message: (params: IssueParams) => string;
}

export function formatCount(value: number) {
  return value.toLocaleString("es-ES");
}

/** Asocia a cada código su gravedad y su plantilla, y devuelve un `createIssue` tipado. */
export function defineIssueCatalog<C extends string>(catalog: Record<C, IssueDefinition>) {
  return (code: C, params: IssueParams = {}): RawIssue<C> => ({
    severity: catalog[code].severity,
    code,
    column: params.column ?? null,
    message: catalog[code].message(params),
    row: params.row ?? null,
  });
}

const list = (params: IssueParams) => (params.list ?? []).join(", ");

/** Catálogo común del archivo y de cualquier sección (contracts/admin-api.md). */
export const COMMON_ISSUES = {
  WRONG_SECTION: {
    severity: "error",
    message: (p) =>
      `Este archivo es de la sección ${p.declared ?? ""}. Súbelo en esa sección o usa la plantilla de ${p.section ?? ""}.`,
  },
  MISSING_COLUMNS: { severity: "error", message: (p) => `Faltan columnas obligatorias: ${list(p)}.` },
  DUPLICATE_COLUMN: { severity: "error", message: (p) => `La columna “${p.column ?? ""}” aparece más de una vez.` },
  NO_ROWS: { severity: "error", message: () => "El archivo no contiene filas para procesar." },
  TOO_MANY_ROWS: {
    severity: "error",
    message: (p) =>
      `El archivo tiene ${formatCount(p.n ?? 0)} filas; el máximo es ${formatCount(p.limit ?? 0)}. Divídelo en varios archivos.`,
  },
  IGNORED_COLUMNS: { severity: "notice", message: (p) => `Se ignoraron columnas no reconocidas: ${list(p)}.` },
  MISSING_METADATA: {
    severity: "notice",
    message: () => "No se encontró la fecha de generación; no se comprobará si hubo cambios después de la descarga.",
  },
  REQUIRED: {
    severity: "error",
    message: (p) => `${p.column ?? ""} es obligatorio. La celda está vacía o tiene un error de fórmula.`,
  },
  TOO_LONG: {
    severity: "error",
    message: (p) => `${p.column ?? ""} admite como máximo ${p.n ?? 160} caracteres.`,
  },
  INVALID_TYPE: {
    severity: "error",
    message: (p) => `La celda contiene un tipo de dato no válido para ${p.column ?? ""}.`,
  },
  INVALID_DATE: { severity: "error", message: () => "Escribe una fecha válida como dd/mm/aaaa." },
  INVALID_ID: {
    severity: "error",
    message: () => "El Identificador debe ser el número que trae el archivo descargado.",
  },
  UNKNOWN_ID: {
    severity: "error",
    message: () => "No existe un registro con este Identificador. No lo modifiques; déjalo vacío para crear uno nuevo.",
  },
  DUPLICATE_ID: { severity: "error", message: () => "Este Identificador aparece en más de una fila." },
  MODIFIED_AFTER_DOWNLOAD: {
    severity: "warning",
    message: () => "Este registro cambió después de descargar el archivo; se sobrescribirán sus valores actuales.",
  },
  NEW_VALUE: {
    severity: "warning",
    message: (p) =>
      `Se creará un valor nuevo de ${p.column ?? ""}: “${p.value ?? ""}”. Revisa que no sea un error de escritura.`,
  },
} as const satisfies Record<string, IssueDefinition>;

export type CommonIssueCode = keyof typeof COMMON_ISSUES;

export const createCommonIssue = defineIssueCatalog<CommonIssueCode>(COMMON_ISSUES);

export const FILE_REJECTION_MESSAGES: Record<FileRejectionCode, string> = {
  FILE_REQUIRED: "Selecciona un archivo de Excel (.xlsx).",
  FILE_TOO_LARGE: "El archivo supera 4 MB. Divide el archivo en varios.",
  FILE_NOT_XLSX: "El archivo debe ser un Excel .xlsx basado en la plantilla.",
  FILE_PROTECTED_OR_XLS:
    "El archivo está protegido con contraseña o usa el formato antiguo .xls. Guárdalo como Excel (.xlsx) sin contraseña.",
  FILE_HAS_MACROS: "El archivo contiene macros. Guárdalo como Excel (.xlsx) sin macros.",
  FILE_UNREADABLE: "No se pudo leer el archivo. Ábrelo y guárdalo de nuevo como .xlsx.",
};

export class BulkFileError extends Error {
  constructor(public readonly code: FileRejectionCode) {
    super(FILE_REJECTION_MESSAGES[code]);
    this.name = "BulkFileError";
  }
}

const SEVERITY_ORDER: Record<IssueSeverity, number> = { error: 0, warning: 1, notice: 2 };

export function compactRows(rows: number[]): string[] {
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
export function groupIssues<C extends string>(issues: RawIssue<C>[]): ValidationIssue<C>[] {
  const groups = new Map<string, { issue: RawIssue<C>; rows: number[]; count: number }>();
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
