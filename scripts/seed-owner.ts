import "dotenv/config";
import { eq } from "drizzle-orm";
import { adminUsers } from "../src/db/schema";
import { getDb, closeDb } from "../src/db/client";
import { hashPassword } from "../src/server/auth/crypto";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("ADMIN_EMAIL y ADMIN_PASSWORD son obligatorios para crear la cuenta propietaria.");
}

try {
  const [existing] = await getDb().select({ id: adminUsers.id }).from(adminUsers).where(eq(adminUsers.email, email)).limit(1);
  if (existing) {
    throw new Error("La cuenta propietaria ya existe; no se sobrescribirá.");
  }

  await getDb().insert(adminUsers).values({
    email,
    passwordHash: await hashPassword(password),
    role: "owner",
    isActive: true,
  });
  console.log("Cuenta propietaria creada.");
} finally {
  await closeDb();
}
