import { inArray, sql } from "drizzle-orm";
import { congresses } from "../../../db/schema";
import { chunk, withBulkLock } from "../../bulk/transaction";
import type { DbOrTransaction, Transaction } from "../../db";
import { loadReferenceValues } from "../../reference/values";
import {
  createCongressSnapshot,
  type CongressCreateWrite,
  type CongressSnapshot,
  type CongressUpdateWrite,
} from "./changes";
import { CONGRESSES_LOCK_KEY } from "./format";

export async function loadCongressSnapshot(source: DbOrTransaction): Promise<CongressSnapshot> {
  const [rows, reference] = await Promise.all([source.select().from(congresses), loadReferenceValues(source)]);
  return createCongressSnapshot(
    rows.map((row) => ({
      id: row.id,
      ref: row.ref,
      name: row.name,
      startDate: row.startDate,
      endDate: row.endDate,
      venue: row.venue,
      specialty: row.specialty,
      notes: row.notes,
      updatedAt: row.updatedAt,
    })),
    reference,
  );
}

/** Transacción con el bloqueo de la carga masiva y los congresos referenciados bloqueados (`FOR UPDATE`). */
export async function withCongressesBulkLock<T>(
  options: { refs: number[]; lockTimeoutMs?: number },
  callback: (transaction: Transaction, snapshot: CongressSnapshot) => Promise<T>,
): Promise<T> {
  return withBulkLock({ lockKey: CONGRESSES_LOCK_KEY, lockTimeoutMs: options.lockTimeoutMs }, async (transaction) => {
    if (options.refs.length) {
      await transaction.select({ id: congresses.id }).from(congresses).where(inArray(congresses.ref, options.refs)).for("update");
    }
    return callback(transaction, await loadCongressSnapshot(transaction));
  });
}

export async function insertCongresses(transaction: Transaction, creates: CongressCreateWrite[], now: Date) {
  const created: Array<{ ref: number; label: string }> = [];
  for (const batch of chunk(creates)) {
    const rows = await transaction
      .insert(congresses)
      .values(batch.map(({ values }) => ({ ...values, createdAt: now, updatedAt: now })))
      .returning({ ref: congresses.ref });
    batch.forEach((write, index) => created.push({ ref: rows[index].ref, label: write.label }));
  }
  return created;
}

/** Actualiza por lotes con `UPDATE … FROM (VALUES …)`; nunca elimina filas. */
export async function updateCongresses(transaction: Transaction, updates: CongressUpdateWrite[], now: Date) {
  const stamp = now.toISOString();
  for (const batch of chunk(updates)) {
    const tuples = batch.map(
      ({ id, values: v }) =>
        sql`(${id}::uuid, ${v.name}::text, ${v.startDate}::date, ${v.endDate}::date, ${v.venue}::text, ${v.specialty}::text, ${v.notes}::text)`,
    );
    await transaction.execute(sql`
      UPDATE congresses AS c SET name = v.name, start_date = v.start_date, end_date = v.end_date, venue = v.venue,
        specialty = v.specialty, notes = v.notes, updated_at = ${stamp}::timestamptz
      FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, name, start_date, end_date, venue, specialty, notes)
      WHERE c.id = v.id
    `);
  }
}
