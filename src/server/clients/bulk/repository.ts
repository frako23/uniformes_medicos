import { inArray, or, sql } from "drizzle-orm";
import { clients } from "../../../db/schema";
import { chunk, withBulkLock } from "../../bulk/transaction";
import type { DbOrTransaction, Transaction } from "../../db";
import { loadReferenceValues } from "../../reference/values";
import {
  createClientSnapshot,
  type ClientCreateWrite,
  type ClientSnapshot,
  type ClientUpdateWrite,
} from "./changes";
import { CLIENTS_LOCK_KEY } from "./format";

export async function loadClientSnapshot(source: DbOrTransaction): Promise<ClientSnapshot> {
  const [rows, reference] = await Promise.all([source.select().from(clients), loadReferenceValues(source)]);
  return createClientSnapshot(
    rows.map((row) => ({
      id: row.id,
      ref: row.ref,
      name: row.name,
      phoneE164: row.phoneE164,
      sex: row.sex,
      size: row.size,
      city: row.city,
      hospital: row.hospital,
      clinic: row.clinic,
      specialty: row.specialty,
      notes: row.notes,
      updatedAt: row.updatedAt,
    })),
    reference,
  );
}

/**
 * Ejecuta `callback` en una transacción con el bloqueo de la carga masiva de clientes tomado, la unicidad del
 * celular diferida hasta el commit, los clientes referenciados bloqueados y la instantánea ya cargada.
 */
export async function withClientsBulkLock<T>(
  options: { refs: number[]; phones: string[]; lockTimeoutMs?: number },
  callback: (transaction: Transaction, snapshot: ClientSnapshot) => Promise<T>,
): Promise<T> {
  return withBulkLock({ lockKey: CLIENTS_LOCK_KEY, lockTimeoutMs: options.lockTimeoutMs }, async (transaction) => {
    await transaction.execute(sql`SET CONSTRAINTS clients_phone_unique DEFERRED`);
    const conditions = [
      ...(options.refs.length ? [inArray(clients.ref, options.refs)] : []),
      ...(options.phones.length ? [inArray(clients.phoneE164, options.phones)] : []),
    ];
    if (conditions.length) {
      await transaction.select({ id: clients.id }).from(clients).where(or(...conditions)).for("update");
    }
    return callback(transaction, await loadClientSnapshot(transaction));
  });
}

/** Inserta los clientes nuevos por lotes y devuelve su `ref` por celular. */
export async function insertClients(
  transaction: Transaction,
  creates: ClientCreateWrite[],
  now: Date,
): Promise<Map<string, number>> {
  const refs = new Map<string, number>();
  for (const batch of chunk(creates)) {
    const inserted = await transaction
      .insert(clients)
      .values(batch.map(({ values }) => ({ ...values, createdAt: now, updatedAt: now })))
      .returning({ ref: clients.ref, phoneE164: clients.phoneE164 });
    for (const row of inserted) refs.set(row.phoneE164, row.ref);
  }
  return refs;
}

/** Actualiza los clientes por lotes con `UPDATE … FROM (VALUES …)`; nunca elimina filas. */
export async function updateClients(transaction: Transaction, updates: ClientUpdateWrite[], now: Date): Promise<void> {
  const stamp = now.toISOString();
  for (const batch of chunk(updates)) {
    const tuples = batch.map(
      ({ id, values: v }) =>
        sql`(${id}::uuid, ${v.name}::text, ${v.phoneE164}::text, ${v.sex}::client_sex, ${v.size}::text, ${v.city}::text, ${v.hospital}::text, ${v.clinic}::text, ${v.specialty}::text, ${v.notes}::text, ${v.searchText}::text)`,
    );
    await transaction.execute(sql`
      UPDATE clients AS c SET
        name = v.name, phone_e164 = v.phone_e164, sex = v.sex, size = v.size, city = v.city,
        hospital = v.hospital, clinic = v.clinic, specialty = v.specialty, notes = v.notes,
        search_text = v.search_text, updated_at = ${stamp}::timestamptz
      FROM (VALUES ${sql.join(tuples, sql`, `)}) AS v(id, name, phone_e164, sex, size, city, hospital, clinic, specialty, notes, search_text)
      WHERE c.id = v.id
    `);
  }
}
