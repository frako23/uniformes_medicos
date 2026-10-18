import { formatPhone } from "../../../utils/phone";
import { normalizeKey } from "../../../utils/text-keys";
import {
  headerCell,
  heading,
  ID_STYLE,
  inputMessage,
  listValidation,
  metadataRows,
  suggestionValidation,
  text,
  textColumn,
  textLengthValidation,
  writeWorkbook,
  type Cell,
} from "../../bulk/workbook-writer";
import { referenceOptions, type ReferenceIndex } from "../../reference/values";
import { SHEET_INSTRUCTIONS, SHEET_LISTS } from "../../inventory/workbook-format";
import { CLIENT_LIMITS } from "../../validation/clients";
import type { SnapshotClient } from "./changes";
import {
  CLIENTS_INSTRUCTIONS,
  CLIENTS_LABEL,
  CLIENTS_SHEET,
  CLIENTS_VALIDATION_ROWS,
  CLIENT_COLUMNS,
  CLIENT_LIST_COLUMNS,
} from "./format";

export interface BuildClientsWorkbookInput {
  kind: "plantilla" | "datos";
  clients: SnapshotClient[];
  reference: ReferenceIndex;
  generatedAt: Date;
}

function instructionsSheet(input: BuildClientsWorkbookInput): Cell[][] {
  const rows: Cell[][] = [
    [heading(CLIENTS_INSTRUCTIONS.title)],
    [],
    [heading("Cómo llenar este archivo")],
    ...CLIENTS_INSTRUCTIONS.steps.map((step): Cell[] => [text(step)]),
    [],
    [heading("Columnas")],
    ...CLIENTS_INSTRUCTIONS.columns.map(([name, description]): Cell[] => [text(name), text(description)]),
    [],
    [heading("Celdas vacías")],
    ...CLIENTS_INSTRUCTIONS.emptyCells.map((line): Cell[] => [text(line)]),
    [],
    [heading("Límites")],
    [text(CLIENTS_INSTRUCTIONS.limits)],
  ];
  rows.push(...metadataRows({ section: CLIENTS_LABEL, kind: input.kind, generatedAt: input.generatedAt }));
  return rows;
}

function dataRows(input: BuildClientsWorkbookInput): Cell[][] {
  const header: Cell[] = CLIENT_COLUMNS.map((column) => headerCell(column.header));
  if (input.kind === "plantilla") return [header];
  const sorted = [...input.clients].sort(
    (left, right) => normalizeKey(left.name).localeCompare(normalizeKey(right.name), "es") || left.ref - right.ref,
  );
  return [
    header,
    ...sorted.map((client): Cell[] => [
      textColumn(client.name),
      textColumn(formatPhone(client.phoneE164)),
      text(client.sex),
      textColumn(client.size),
      textColumn(client.city),
      textColumn(client.hospital),
      textColumn(client.clinic),
      textColumn(client.specialty),
      textColumn(client.notes),
      { value: client.ref, type: Number, ...ID_STYLE },
    ]),
  ];
}

function listsSheet(reference: ReferenceIndex) {
  const columns = CLIENT_LIST_COLUMNS.map((column) => ({
    title: column.title,
    values: referenceOptions(reference, column.field),
  }));
  const height = Math.max(0, ...columns.map((column) => column.values.length));
  const rows: Cell[][] = [columns.map((column) => heading(column.title))];
  for (let index = 0; index < height; index += 1) rows.push(columns.map((column) => text(column.values[index] ?? null)));
  return { rows, lengths: columns.map((column) => column.values.length) };
}

function validations(listLengths: number[]) {
  const rows = CLIENTS_VALIDATION_ROWS;
  const columnOf = (key: string) => CLIENT_COLUMNS.findIndex((column) => column.key === key) + 1;
  return [
    textLengthValidation(columnOf("name"), rows, CLIENT_LIMITS.name, "Nombre"),
    inputMessage(columnOf("phone"), rows, "Celular", "Ej.: 0414-123-4567. Otro país: +57 300 123 4567."),
    listValidation(columnOf("sex"), rows, ["Mujer", "Hombre"], "Usa Mujer u Hombre."),
    ...CLIENT_LIST_COLUMNS.map((column, index) =>
      suggestionValidation(column.column, rows, {
        sheet: SHEET_LISTS,
        listColumn: column.listColumn,
        length: listLengths[index],
        name: CLIENT_COLUMNS[column.column - 1].header,
      }),
    ),
    textLengthValidation(columnOf("notes"), rows, CLIENT_LIMITS.notes, "Notas"),
    inputMessage(columnOf("id"), rows, "Identificador", "No modifiques este valor; déjalo vacío para crear un registro nuevo."),
  ];
}

/** Genera la plantilla vacía o los clientes actuales como libro `.xlsx` en memoria. */
export async function buildClientsWorkbook(input: BuildClientsWorkbookInput): Promise<Buffer> {
  const lists = listsSheet(input.reference);
  return writeWorkbook([
    { data: instructionsSheet(input), sheet: SHEET_INSTRUCTIONS, columns: [{ width: 48 }, { width: 70 }] },
    {
      data: dataRows(input),
      sheet: CLIENTS_SHEET,
      columns: [
        { width: 28 },
        { width: 16 },
        { width: 10 },
        { width: 10 },
        { width: 18 },
        { width: 24 },
        { width: 18 },
        { width: 22 },
        { width: 30 },
        { width: 14 },
      ],
      stickyRowsCount: 1,
      dataValidation: validations(lists.lengths),
    },
    { data: lists.rows, sheet: SHEET_LISTS, columns: [{ width: 12 }, { width: 22 }, { width: 24 }, { width: 22 }, { width: 24 }] },
  ]);
}

