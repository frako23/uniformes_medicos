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

export const FINANCINGS_SECTION = "financiamientos" as const;
export const FINANCINGS_LABEL = "Financiamientos";
export const FINANCINGS_SHEET = "Financiamientos";
export const FINANCINGS_MAX_ROWS = 2_000;
export const FINANCINGS_LOCK_KEY = BULK_LOCK_KEYS.financiamientos;
export const FINANCINGS_PURPOSE = bulkPurpose(FINANCINGS_SECTION);
export const FINANCINGS_TEMPLATE_FILE = "plantilla-financiamientos.xlsx";
export const FINANCINGS_VALIDATION_ROWS = { firstRow: 2, lastRow: FINANCINGS_MAX_ROWS + 1 } as const;

export type FinancingColumnKey =
  | "phone"
  | "clientName"
  | "description"
  | "purchaseDate"
  | "total"
  | "initial"
  | "count"
  | "frequency"
  | "firstDue"
  | "paid";

export const FINANCING_COLUMNS: SectionColumnDef<FinancingColumnKey>[] = [
  { key: "phone", header: "Celular del cliente", aliases: ["Celular"], required: true },
  { key: "clientName", header: "Cliente" },
  { key: "description", header: "Descripción", required: true },
  { key: "purchaseDate", header: "Fecha de compra", required: true },
  { key: "total", header: "Monto total", required: true },
  { key: "initial", header: "Inicial" },
  { key: "count", header: "Número de cuotas", required: true },
  { key: "frequency", header: "Frecuencia" },
  { key: "firstDue", header: "Fecha de la primera cuota" },
  { key: "paid", header: "Cuotas pagadas" },
];

export const FREQUENCY_OPTIONS = { semanal: "semanal", quincenal: "quincenal", mensual: "mensual" } as const;
export const FREQUENCY_LABELS = { semanal: "Semanal", quincenal: "Quincenal", mensual: "Mensual" } as const;

export const MONEY_CODES = { invalid: "INVALID_AMOUNT", decimals: "AMOUNT_DECIMALS", tooHigh: "AMOUNT_TOO_HIGH" } as const;

const FINANCING_ISSUES = {
  CLIENT_NOT_FOUND: {
    severity: "error",
    message: () => "No hay ningún cliente con este celular. Regístralo en Clientes o inclúyelo en su carga masiva primero.",
  },
  INVALID_PHONE: {
    severity: "error",
    message: () => "El celular debe tener 10 dígitos sin el 0 inicial (por ejemplo, 0414-123-4567) o empezar por + y el código de país.",
  },
  INVALID_AMOUNT: { severity: "error", message: () => "Escribe un monto en dólares mayor que 0, sin símbolos ni texto." },
  AMOUNT_DECIMALS: { severity: "error", message: () => "El monto admite como máximo dos decimales." },
  AMOUNT_TOO_HIGH: { severity: "error", message: () => "El monto supera el máximo permitido." },
  INITIAL_TOO_HIGH: { severity: "error", message: () => "La inicial debe ser menor que el monto total." },
  INVALID_INSTALLMENT_COUNT: { severity: "error", message: () => "El número de cuotas debe ser un entero entre 1 y 48." },
  INVALID_FREQUENCY: { severity: "error", message: () => "Usa Semanal, Quincenal o Mensual." },
  FUTURE_PURCHASE_DATE: { severity: "error", message: () => "La fecha de compra no puede ser posterior a hoy." },
  FIRST_DUE_BEFORE_PURCHASE: { severity: "error", message: () => "La primera cuota no puede vencer antes de la fecha de compra." },
  INVALID_PAID_COUNT: { severity: "error", message: () => "Cuotas pagadas debe ser un número entero mayor o igual a 0." },
  PAID_COUNT_TOO_HIGH: {
    severity: "error",
    message: () => "Cuotas pagadas no puede superar el número de cuotas (más la inicial, si la hay).",
  },
  CLIENT_NAME_MISMATCH: {
    severity: "warning",
    message: (p) => `El celular pertenece a “${p.value ?? ""}”, no a “${p.extra ?? ""}”. Revisa que el celular sea correcto.`,
  },
  POSSIBLE_DUPLICATE: {
    severity: "warning",
    message: (p) => `Parece repetido: mismo cliente, fecha de compra y monto total que ${p.reference ?? ""}.`,
  },
} as const satisfies Record<string, IssueDefinition>;

export type FinancingIssueCode = CommonIssueCode | keyof typeof FINANCING_ISSUES;
export type FinancingRawIssue = RawIssue<FinancingIssueCode>;

export const createFinancingIssue = defineIssueCatalog<FinancingIssueCode>({ ...COMMON_ISSUES, ...FINANCING_ISSUES });

export const FINANCINGS_INSTRUCTIONS = {
  title: "Carga masiva de financiamientos",
  steps: [
    "1. Trabaja solo en la hoja “Financiamientos”: una fila por financiamiento. Esta carga solo crea financiamientos nuevos; nunca edita los existentes ni registra pagos de cuotas pendientes.",
    "2. El cliente se identifica por su celular y debe estar registrado. En la hoja “Listas” tienes los clientes registrados con su celular.",
    "3. El calendario se genera solo: la inicial (si la hay) vence en la fecha de compra y el resto se reparte en cuotas iguales según la frecuencia.",
    "4. Para financiamientos en curso, escribe en “Cuotas pagadas” cuántas cuotas ya se pagaron, en orden (si hay inicial, es la primera).",
    "5. Guarda el archivo como Excel (.xlsx), súbelo en el panel y revisa la vista previa antes de confirmar.",
  ],
  columns: [
    ["Celular del cliente", "Obligatorio. Debe pertenecer a un cliente registrado."],
    ["Cliente", "Opcional. Nombre del cliente, solo para comprobar que el celular es el correcto."],
    ["Descripción", "Obligatorio. Texto de 1 a 500 caracteres."],
    ["Fecha de compra", "Obligatoria. dd/mm/aaaa, no posterior a hoy."],
    ["Monto total", "Obligatorio. Dólares, mayor que 0, con máximo dos decimales. Incluye la inicial."],
    ["Inicial", "Opcional. Dólares, menor que el monto total. Vacío = sin inicial."],
    ["Número de cuotas", "Obligatorio. Entero de 1 a 48, sin contar la inicial."],
    ["Frecuencia", "Semanal, Quincenal o Mensual. Vacío = Quincenal."],
    ["Fecha de la primera cuota", "Opcional. No puede ser anterior a la compra. Vacía = la que corresponde a la frecuencia."],
    ["Cuotas pagadas", "Opcional. Entero mayor o igual a 0. Vacío = 0."],
  ] as Array<[string, string]>,
  limits: `Archivo .xlsx de hasta ${MAX_FILE_BYTES / 1024 / 1024} MB y ${FINANCINGS_MAX_ROWS.toLocaleString("es-ES")} financiamientos. Sin macros ni contraseña. La carga es de todo o nada.`,
};
