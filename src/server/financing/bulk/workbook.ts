import { formatPhone } from "../../../utils/phone";
import {
  dateValidation,
  decimalValidation,
  headerCell,
  heading,
  inputMessage,
  integerValidation,
  listValidation,
  metadataRows,
  text,
  textColumn,
  textLengthValidation,
  writeWorkbook,
  type Cell,
} from "../../bulk/workbook-writer";
import { SHEET_INSTRUCTIONS, SHEET_LISTS } from "../../inventory/workbook-format";
import { FINANCING_LIMITS } from "../../validation/financing";
import {
  FINANCING_COLUMNS,
  FINANCINGS_INSTRUCTIONS,
  FINANCINGS_LABEL,
  FINANCINGS_SHEET,
  FINANCINGS_VALIDATION_ROWS,
} from "./format";

export interface FinancingWorkbookClient {
  name: string;
  phoneE164: string;
}

function instructionsSheet(generatedAt: Date): Cell[][] {
  return [
    [heading(FINANCINGS_INSTRUCTIONS.title)],
    [],
    [heading("Cómo llenar este archivo")],
    ...FINANCINGS_INSTRUCTIONS.steps.map((step): Cell[] => [text(step)]),
    [],
    [heading("Columnas")],
    ...FINANCINGS_INSTRUCTIONS.columns.map(([name, description]): Cell[] => [text(name), text(description)]),
    [],
    [heading("Límites")],
    [text(FINANCINGS_INSTRUCTIONS.limits)],
    ...metadataRows({ section: FINANCINGS_LABEL, kind: "plantilla", generatedAt }),
  ];
}

function validations() {
  const rows = FINANCINGS_VALIDATION_ROWS;
  const column = (key: string) => FINANCING_COLUMNS.findIndex((candidate) => candidate.key === key) + 1;
  return [
    inputMessage(column("phone"), rows, "Celular del cliente", "Ej.: 0414-123-4567. Debe pertenecer a un cliente registrado."),
    textLengthValidation(column("description"), rows, FINANCING_LIMITS.description, "Descripción"),
    dateValidation(column("purchaseDate"), rows),
    decimalValidation(column("total"), rows, "El monto debe ser un número mayor o igual a 0."),
    decimalValidation(column("initial"), rows, "La inicial debe ser un número mayor o igual a 0."),
    integerValidation(column("count"), rows, { min: 1, max: 48, error: "Escribe un entero entre 1 y 48." }),
    listValidation(column("frequency"), rows, ["Semanal", "Quincenal", "Mensual"], "Usa Semanal, Quincenal o Mensual."),
    dateValidation(column("firstDue"), rows),
    integerValidation(column("paid"), rows, { min: 0, error: "Escribe un entero mayor o igual a 0." }),
  ];
}

/** Plantilla vacía de financiamientos; “Listas” incluye los clientes registrados con su celular. */
export async function buildFinancingsTemplate(input: { clients: FinancingWorkbookClient[]; generatedAt: Date }): Promise<Buffer> {
  const sorted = [...input.clients].sort((left, right) => left.name.localeCompare(right.name, "es"));
  return writeWorkbook([
    { data: instructionsSheet(input.generatedAt), sheet: SHEET_INSTRUCTIONS, columns: [{ width: 48 }, { width: 70 }] },
    {
      data: [FINANCING_COLUMNS.map((column) => headerCell(column.header))],
      sheet: FINANCINGS_SHEET,
      columns: [{ width: 20 }, { width: 24 }, { width: 32 }, { width: 16 }, { width: 14 }, { width: 12 }, { width: 18 }, { width: 14 }, { width: 24 }, { width: 14 }],
      stickyRowsCount: 1,
      dataValidation: validations(),
    },
    {
      data: [
        [heading("Cliente"), heading("Celular")],
        ...sorted.map((client): Cell[] => [text(client.name), textColumn(formatPhone(client.phoneE164))]),
      ],
      sheet: SHEET_LISTS,
      columns: [{ width: 32 }, { width: 18 }],
    },
  ]);
}
