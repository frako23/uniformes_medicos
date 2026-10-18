import { isValidIsoDate } from "../../../utils/dates";
import { defaultFirstDueDate, MAX_INSTALLMENTS, type Frequency } from "../../../utils/financing-schedule";
import {
  isBlank,
  parseDateCell,
  parseDecimalCell,
  parseIntegerCell,
  parseOptionCell,
  parseOptionalText,
  parsePhoneCell,
  parseRequiredText,
  type CellValue,
} from "../../bulk/cells";
import type { SheetColumn } from "../../bulk/sheet";
import { FINANCING_LIMITS } from "../../validation/financing";
import {
  FREQUENCY_OPTIONS,
  MONEY_CODES,
  createFinancingIssue,
  type FinancingColumnKey,
  type FinancingIssueCode,
  type FinancingRawIssue,
} from "./format";

export interface ParsedFinancingRow {
  excelRow: number;
  clientPhoneE164: string | null;
  clientNameWritten: string | null;
  description: string | null;
  purchaseDate: string | null;
  totalCents: number | null;
  initialCents: number;
  count: number | null;
  frequency: Frequency;
  firstDueDate: string | null;
  paidCount: number;
  issues: FinancingRawIssue[];
}

/** Interpreta una fila de la hoja Financiamientos. `today` es hoy en Caracas. */
export function parseFinancingRow(
  cells: CellValue[],
  columns: SheetColumn<FinancingColumnKey>[],
  excelRow: number,
  today: string,
): ParsedFinancingRow {
  const issues: FinancingRawIssue[] = [];
  const entry = (key: FinancingColumnKey) => {
    const column = columns.find((candidate) => candidate.key === key);
    return column ? { cell: cells[column.index], header: column.header } : { cell: undefined as CellValue, header: key };
  };
  const report = (header: string, code: string, n?: number) => {
    issues.push(createFinancingIssue(code as FinancingIssueCode, { column: header, row: excelRow, n }));
  };

  const phoneEntry = entry("phone");
  const phone = parsePhoneCell(phoneEntry.cell);
  if (!phone.ok) report(phoneEntry.header, phone.code);

  const nameEntry = entry("clientName");
  const name = parseOptionalText(nameEntry.cell, 160);
  if (!name.ok) report(nameEntry.header, name.code, name.n);

  const descriptionEntry = entry("description");
  const description = parseRequiredText(descriptionEntry.cell, FINANCING_LIMITS.description);
  if (!description.ok) report(descriptionEntry.header, description.code, description.n);

  const purchaseEntry = entry("purchaseDate");
  let purchaseDate: string | null = null;
  if (isBlank(purchaseEntry.cell)) report(purchaseEntry.header, "REQUIRED");
  else {
    const parsed = parseDateCell(purchaseEntry.cell);
    if (!parsed.ok) report(purchaseEntry.header, parsed.code);
    else if (parsed.value && parsed.value > today) report(purchaseEntry.header, "FUTURE_PURCHASE_DATE");
    else purchaseDate = parsed.value;
  }

  const moneyOptions = { allowZero: false, maxIntegerDigits: 10, codes: MONEY_CODES } as const;
  const totalEntry = entry("total");
  let totalCents: number | null = null;
  if (isBlank(totalEntry.cell)) report(totalEntry.header, "REQUIRED");
  else {
    const parsed = parseDecimalCell(totalEntry.cell, moneyOptions);
    if (!parsed.ok) report(totalEntry.header, parsed.code);
    else totalCents = parsed.cents ?? null;
  }

  const initialEntry = entry("initial");
  let initialCents = 0;
  if (!isBlank(initialEntry.cell)) {
    const parsed = parseDecimalCell(initialEntry.cell, { ...moneyOptions, allowZero: true });
    if (!parsed.ok) report(initialEntry.header, parsed.code);
    else {
      initialCents = parsed.cents ?? 0;
      if (totalCents !== null && initialCents >= totalCents) {
        report(initialEntry.header, "INITIAL_TOO_HIGH");
        initialCents = 0;
      }
    }
  }

  const countEntry = entry("count");
  let count: number | null = null;
  if (isBlank(countEntry.cell)) report(countEntry.header, "REQUIRED");
  else {
    const parsed = parseIntegerCell(countEntry.cell, { min: 1, max: MAX_INSTALLMENTS, code: "INVALID_INSTALLMENT_COUNT" });
    if (!parsed.ok) report(countEntry.header, parsed.code);
    else count = parsed.value;
  }

  const frequencyEntry = entry("frequency");
  let frequency: Frequency = "quincenal";
  const parsedFrequency = parseOptionCell(frequencyEntry.cell, FREQUENCY_OPTIONS, "INVALID_FREQUENCY");
  if (!parsedFrequency.ok) report(frequencyEntry.header, parsedFrequency.code);
  else if (parsedFrequency.value) frequency = parsedFrequency.value;

  const firstEntry = entry("firstDue");
  let firstDueDate: string | null = null;
  if (!isBlank(firstEntry.cell)) {
    const parsed = parseDateCell(firstEntry.cell);
    if (!parsed.ok) report(firstEntry.header, parsed.code);
    else if (parsed.value && purchaseDate && parsed.value < purchaseDate) report(firstEntry.header, "FIRST_DUE_BEFORE_PURCHASE");
    else firstDueDate = parsed.value;
  } else if (purchaseDate && isValidIsoDate(purchaseDate)) {
    firstDueDate = defaultFirstDueDate(purchaseDate, frequency);
  }

  const paidEntry = entry("paid");
  let paidCount = 0;
  if (!isBlank(paidEntry.cell)) {
    const parsed = parseIntegerCell(paidEntry.cell, { min: 0, max: 100, code: "INVALID_PAID_COUNT" });
    if (!parsed.ok) report(paidEntry.header, parsed.code);
    else {
      paidCount = parsed.value ?? 0;
      if (count !== null && paidCount > count + (initialCents > 0 ? 1 : 0)) report(paidEntry.header, "PAID_COUNT_TOO_HIGH");
    }
  }

  return {
    excelRow,
    clientPhoneE164: phone.ok ? phone.value : null,
    clientNameWritten: name.ok ? name.value : null,
    description: description.ok ? description.value : null,
    purchaseDate,
    totalCents,
    initialCents,
    count,
    frequency,
    firstDueDate,
    paidCount,
    issues,
  };
}
