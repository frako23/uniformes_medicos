import { normalizeKey } from "../../../utils/text-keys";
import {
  dateValidation,
  headerCell,
  heading,
  ID_STYLE,
  inputMessage,
  metadataRows,
  suggestionValidation,
  text,
  textColumn,
  textLengthValidation,
  writeWorkbook,
  type Cell,
} from "../../bulk/workbook-writer";
import { SHEET_INSTRUCTIONS, SHEET_LISTS } from "../../inventory/workbook-format";
import { referenceOptions, type ReferenceIndex } from "../../reference/values";
import { CONGRESS_LIMITS } from "../../validation/congresses";
import type { SnapshotCongress } from "./changes";
import {
  CONGRESSES_INSTRUCTIONS,
  CONGRESSES_LABEL,
  CONGRESSES_SHEET,
  CONGRESSES_VALIDATION_ROWS,
  CONGRESS_COLUMNS,
  CONGRESS_LIST_COLUMN,
} from "./format";

export interface BuildCongressesWorkbookInput {
  kind: "plantilla" | "datos";
  congresses: SnapshotCongress[];
  reference: ReferenceIndex;
  generatedAt: Date;
}

/** Fecha de Excel a las 00:00 UTC, como las entrega `read-excel-file`. */
const excelDate = (iso: string): Cell => ({ value: new Date(`${iso}T00:00:00Z`), type: Date, format: "dd/mm/yyyy" });

export async function buildCongressesWorkbook(input: BuildCongressesWorkbookInput): Promise<Buffer> {
  const rows = CONGRESSES_VALIDATION_ROWS;
  const specialties = referenceOptions(input.reference, "specialty");
  const column = (key: string) => CONGRESS_COLUMNS.findIndex((candidate) => candidate.key === key) + 1;

  const instructions: Cell[][] = [
    [heading(CONGRESSES_INSTRUCTIONS.title)],
    [],
    [heading("Cómo llenar este archivo")],
    ...CONGRESSES_INSTRUCTIONS.steps.map((step): Cell[] => [text(step)]),
    [],
    [heading("Columnas")],
    ...CONGRESSES_INSTRUCTIONS.columns.map(([name, description]): Cell[] => [text(name), text(description)]),
    [],
    [heading("Celdas vacías")],
    ...CONGRESSES_INSTRUCTIONS.emptyCells.map((line): Cell[] => [text(line)]),
    [],
    [heading("Límites")],
    [text(CONGRESSES_INSTRUCTIONS.limits)],
    ...metadataRows({ section: CONGRESSES_LABEL, kind: input.kind, generatedAt: input.generatedAt }),
  ];

  const sorted = [...input.congresses].sort(
    (left, right) =>
      left.startDate.localeCompare(right.startDate) ||
      normalizeKey(left.name).localeCompare(normalizeKey(right.name), "es") ||
      left.ref - right.ref,
  );
  const data: Cell[][] = [
    CONGRESS_COLUMNS.map((item) => headerCell(item.header)),
    ...(input.kind === "plantilla"
      ? []
      : sorted.map((item): Cell[] => [
          excelDate(item.startDate),
          excelDate(item.endDate),
          textColumn(item.specialty),
          textColumn(item.venue),
          textColumn(item.name),
          textColumn(item.notes),
          { value: item.ref, type: Number, ...ID_STYLE },
        ])),
  ];

  return writeWorkbook([
    { data: instructions, sheet: SHEET_INSTRUCTIONS, columns: [{ width: 48 }, { width: 70 }] },
    {
      data,
      sheet: CONGRESSES_SHEET,
      columns: [{ width: 14 }, { width: 14 }, { width: 22 }, { width: 28 }, { width: 36 }, { width: 30 }, { width: 14 }],
      stickyRowsCount: 1,
      dataValidation: [
        dateValidation(column("from"), rows),
        dateValidation(column("to"), rows),
        suggestionValidation(CONGRESS_LIST_COLUMN.column, rows, {
          sheet: SHEET_LISTS,
          listColumn: CONGRESS_LIST_COLUMN.listColumn,
          length: specialties.length,
          name: "Especialidad",
        }),
        textLengthValidation(column("venue"), rows, CONGRESS_LIMITS.venue, "Lugar"),
        textLengthValidation(column("name"), rows, CONGRESS_LIMITS.name, "Nombre"),
        inputMessage(column("id"), rows, "Identificador", "No modifiques este valor; déjalo vacío para crear un registro nuevo."),
      ],
    },
    {
      data: [[heading(CONGRESS_LIST_COLUMN.title)], ...specialties.map((value): Cell[] => [text(value)])],
      sheet: SHEET_LISTS,
      columns: [{ width: 28 }],
    },
  ]);
}
