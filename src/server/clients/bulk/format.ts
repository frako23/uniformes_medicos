import {
  COMMON_ISSUES,
  defineIssueCatalog,
  type CommonIssueCode,
  type IssueDefinition,
  type RawIssue,
} from "../../bulk/issues";
import { BULK_LOCK_KEYS } from "../../bulk/transaction";
import { bulkPurpose } from "../../bulk/preview-token";
import type { SectionColumnDef } from "../../bulk/sheet";
import { MAX_FILE_BYTES } from "../../inventory/workbook-format";

export const CLIENTS_SECTION = "clientes" as const;
export const CLIENTS_LABEL = "Clientes";
export const CLIENTS_SHEET = "Clientes";
export const CLIENTS_MAX_ROWS = 10_000;
export const CLIENTS_LOCK_KEY = BULK_LOCK_KEYS.clientes;
export const CLIENTS_PURPOSE = bulkPurpose(CLIENTS_SECTION);
export const CLIENTS_TEMPLATE_FILE = "plantilla-clientes.xlsx";
export const clientsExportFileName = (today: string) => `clientes-${today}.xlsx`;

/** Primera y última fila con validaciones de datos (la fila 1 es el encabezado). */
export const CLIENTS_VALIDATION_ROWS = { firstRow: 2, lastRow: CLIENTS_MAX_ROWS + 1 } as const;

export type ClientColumnKey =
  | "name"
  | "phone"
  | "sex"
  | "size"
  | "city"
  | "hospital"
  | "clinic"
  | "specialty"
  | "notes"
  | "id";

/** Columnas en el orden de los archivos generados. Las ocho primeras coinciden con la pestaña “Medicos”. */
export const CLIENT_COLUMNS: SectionColumnDef<ClientColumnKey>[] = [
  { key: "name", header: "Nombre", required: true },
  { key: "phone", header: "Celular", required: true },
  { key: "sex", header: "Sexo" },
  { key: "size", header: "Talla" },
  { key: "city", header: "Ciudad" },
  { key: "hospital", header: "Hospital" },
  { key: "clinic", header: "Clínica" },
  { key: "specialty", header: "Especialidad" },
  { key: "notes", header: "Notas" },
  { key: "id", header: "Identificador" },
];

export const CLIENT_HEADERS = CLIENT_COLUMNS.map((column) => column.header);
export const headerOf = (key: ClientColumnKey) => CLIENT_COLUMNS.find((column) => column.key === key)!.header;

/** Opciones cerradas de Sexo, por clave normalizada. */
export const SEX_OPTIONS = { mujer: "Mujer", hombre: "Hombre" } as const;

/** Campos de referencia con escritura canónica y su columna en la hoja Listas. */
export const CLIENT_LIST_COLUMNS = [
  { key: "size", field: "size", title: "Tallas", listColumn: "A", column: 4 },
  { key: "city", field: "city", title: "Ciudades", listColumn: "B", column: 5 },
  { key: "hospital", field: "hospital", title: "Hospitales", listColumn: "C", column: 6 },
  { key: "clinic", field: "clinic", title: "Clínicas", listColumn: "D", column: 7 },
  { key: "specialty", field: "specialty", title: "Especialidades", listColumn: "E", column: 8 },
] as const;

const CLIENT_ISSUES = {
  INVALID_PHONE: {
    severity: "error",
    message: () => "El celular debe tener 10 dígitos sin el 0 inicial (por ejemplo, 0414-123-4567) o empezar por + y el código de país.",
  },
  PHONE_REPEATED: { severity: "error", message: () => "Este celular aparece en más de una fila." },
  PHONE_IN_USE: { severity: "error", message: (p) => `Este celular ya pertenece al cliente #${p.id ?? ""}.` },
  DUPLICATE_TARGET: {
    severity: "error",
    message: (p) => `Esta fila y la fila ${p.n ?? ""} modifican al mismo cliente.`,
  },
  INVALID_SEX: { severity: "error", message: () => "Usa Mujer u Hombre." },
  SAME_NAME: {
    severity: "warning",
    message: (p) => `Hay otro cliente con el mismo nombre (${p.reference ?? ""}). Revisa que no sea un duplicado.`,
  },
} as const satisfies Record<string, IssueDefinition>;

export type ClientIssueCode = CommonIssueCode | keyof typeof CLIENT_ISSUES;
export type ClientRawIssue = RawIssue<ClientIssueCode>;

export const createClientIssue = defineIssueCatalog<ClientIssueCode>({ ...COMMON_ISSUES, ...CLIENT_ISSUES });

export const CLIENTS_INSTRUCTIONS = {
  title: "Carga masiva de clientes",
  steps: [
    "1. Trabaja solo en la hoja “Clientes”: una fila por cliente. También puedes pegar las filas de tu hoja de médicos con las columnas Nombre, Celular, Sexo, Talla, Ciudad, Hospital, Clínica y Especialidad.",
    "2. Una fila con Identificador edita ese cliente. Una fila sin Identificador se reconoce por su celular: si ya existe, actualiza a ese cliente; si no, crea uno nuevo. No modifiques la columna Identificador.",
    "3. Guarda el archivo como Excel (.xlsx), súbelo en el panel y revisa la vista previa antes de confirmar.",
  ],
  columns: [
    ["Nombre", "Obligatorio. Texto de 1 a 160 caracteres."],
    ["Celular", "Obligatorio. Venezolano: 10 dígitos sin el 0 inicial u 11 con él, con o sin 58 o +58 (se aceptan espacios, guiones, puntos y paréntesis). De otro país: + y de 8 a 15 dígitos."],
    ["Sexo", "Mujer u Hombre."],
    ["Talla", "Texto de hasta 40 caracteres."],
    ["Ciudad, Hospital, Clínica, Especialidad", "Texto de hasta 160 caracteres. Si solo difiere de uno ya registrado en mayúsculas, tildes o espacios, se guarda con la escritura registrada."],
    ["Notas", "Texto de hasta 1.000 caracteres."],
    ["Identificador", "Número del cliente en el archivo descargado. Vacío = cliente nuevo o reconocido por su celular."],
  ] as Array<[string, string]>,
  emptyCells: [
    "En una fila con Identificador, una celda vacía en una columna presente borra el dato guardado.",
    "En una fila sin Identificador cuyo celular ya existe, las celdas vacías conservan lo guardado; solo cambian las celdas con valor.",
    "Si una columna no está en el archivo, ese dato no cambia.",
  ],
  limits: `Archivo .xlsx de hasta ${MAX_FILE_BYTES / 1024 / 1024} MB y ${CLIENTS_MAX_ROWS.toLocaleString("es-ES")} clientes. Sin macros ni contraseña. La carga es de todo o nada y nunca elimina clientes.`,
};
