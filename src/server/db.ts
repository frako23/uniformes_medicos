import type { ExtractTablesWithRelations } from "drizzle-orm";
import type { PgTransaction } from "drizzle-orm/pg-core";
import type { PostgresJsQueryResultHKT } from "drizzle-orm/postgres-js";
import { getDb, type Database } from "../db/client";
import * as schema from "../db/schema";

export function db() {
  return getDb();
}

export type Transaction = PgTransaction<
  PostgresJsQueryResultHKT,
  typeof schema,
  ExtractTablesWithRelations<typeof schema>
>;

export async function withTransaction<T>(
  callback: (transaction: Transaction) => Promise<T>,
): Promise<T> {
  return db().transaction(callback);
}

export type DbOrTransaction = Database | Transaction;
