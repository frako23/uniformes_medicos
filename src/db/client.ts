import postgres from "postgres";
import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";

type Database = PostgresJsDatabase<typeof schema>;

let client: ReturnType<typeof postgres> | undefined;
let database: Database | undefined;

function databaseUrl() {
  const url = process.env.DATABASE_URL ?? import.meta.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL no está configurada en el entorno del servidor");
  }
  return url;
}

export function getDb(): Database {
  if (!database) {
    client = postgres(databaseUrl(), {
      max: 5,
      prepare: false,
      connect_timeout: 10,
    });
    database = drizzle(client, { schema });
  }
  return database;
}

export async function closeDb() {
  if (client) {
    await client.end({ timeout: 5 });
    client = undefined;
    database = undefined;
  }
}

export type { Database };
