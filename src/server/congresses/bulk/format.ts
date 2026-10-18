import {
  COMMON_ISSUES,
  defineIssueCatalog,
  type CommonIssueCode,
  type IssueDefinition,
  type RawIssue,
} from "../../bulk/issues";
import { bulkPurpose } from "../../bulk/preview-token";
import type { SectionColumnDef } from "../../bulk/sheet";
import { BULK_LOCK_KEYS } from "../../bulk/transaction";
import { MAX_FILE_BYTES } from "../../inventory/workbook-format";

export const CONGRESSES_SECTION = "congresos" as const;
export const CONGRESSES_LABEL = "Congresos";
export const CONGRESSES_SHEET = "Congresos";
export const CONGRESSES_MAX_ROWS = 10_000;
export const CONGRESSES_LOCK_KEY = BULK_LOCK_KEYS.congresos;
export const CONGRESSES_PURPOSE = bulkPurpose(CONGRESSES_SECTION);
export const CONGRESSES_TEMPLATE_FILE = "plantilla-congresos.xlsx";
export const congressesExportFileName = (today: string) => `congresos-${today}.xlsx`;
export const CONGRESSES_VALIDATION_ROWS = { firstRow: 2, lastRow: CONGRESSES_MAX_ROWS + 1 } as const;
export const LONG_EVENT_DAYS = 31;

export type CongressColumnKey = "from" | "to" | "specialty" | "venue" | "name" | "notes" | "id";

/** Las cinco primeras columnas coinciden con la pestaña “Eventos” de la hoja de la propietaria. */
export const CONGRESS_COLUMNS: SectionColumnDef<CongressColumnKey>[] = [
  { key: "from", header: "Desde", required: true },
  { key: "to", header: "Hasta", required: true },
  { key: "specialty", header: "Especialidad" },
  { key: "venue", header: "Lugar" },
  { key: "name", header: "Nombre", required: true },
  { key: "notes", header: "Notas" },
  { key: "id", header: "Identificador" },
];

const CONGRESS_ISSUES = {
  END_BEFORE_START: { severity: "error", message: () => "La fecha Hasta no puede ser anterior a Desde." },
  POSSIBLE_DUPLICATE: {
    severity: "warning",
    message: (p) => `Parece repetido: mismo nombre y fecha de inicio que ${p.reference ?? ""}.`,
  },
  LONG_EVENT: { severity: "warning", message: (p) => `El congreso dura ${p.n ?? ""} días. Revisa las fechas.` },
  ALREADY_ENDED: { severity: "warning", message: () => "Este congreso ya terminó." },
} as const satisfies Record<string, IssueDefinition>;

export type CongressIssueCode = CommonIssueCode | keyof typeof CONGRESS_ISSUES;
export type CongressRawIssue = RawIssue<CongressIssueCode>;

export const createCongressIssue = defineIssueCatalog<CongressIssueCode>({ ...COMMON_ISSUES, ...CONGRESS_ISSUES });

/** Columnas de referencia de la hoja Listas. */
export const CONGRESS_LIST_COLUMN = { title: "Especialidades", listColumn: "A", column: 3 } as const;

export const CONGRESSES_INSTRUCTIONS = {
  title: "Carga masiva de congresos",
  steps: [
    "1. Trabaja solo en la hoja “Congresos”: una fila por congreso. También puedes pegar las filas de tu pestaña “Eventos”, que tiene las columnas Desde, Hasta, Especialidad, Lugar y Nombre.",
    "2. Una fila con Identificador edita ese congreso. Una fila sin Identificador crea un congreso nuevo. No modifiques la columna Identificador.",
    "3. Guarda el archivo como Excel (.xlsx), súbelo en el panel y revisa la vista previa antes de confirmar.",
  ],
  columns: [
    ["Desde, Hasta", "Obligatorias. dd/mm/aaaa; Hasta no puede ser anterior a Desde."],
    ["Especialidad", "Opcional. Texto de hasta 160 caracteres; se guarda con la escritura ya registrada."],
    ["Lugar", "Opcional. Texto de hasta 160 caracteres."],
    ["Nombre", "Obligatorio. Texto de 1 a 160 caracteres."],
    ["Notas", "Opcional. Texto de hasta 1.000 caracteres."],
    ["Identificador", "Número del congreso en el archivo descargado. Vacío = congreso nuevo."],
  ] as Array<[string, string]>,
  emptyCells: ["En una fila con Identificador, una celda vacía en una columna presente borra el dato guardado.", "Si una columna no está en el archivo, ese dato no cambia."],
  limits: `Archivo .xlsx de hasta ${MAX_FILE_BYTES / 1024 / 1024} MB y ${CONGRESSES_MAX_ROWS.toLocaleString("es-ES")} congresos. Sin macros ni contraseña. La carga es de todo o nada y nunca elimina congresos.`,
};
