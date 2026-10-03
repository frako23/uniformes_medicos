import "dotenv/config";
import { closeDb } from "../src/db/client";
import { hashPassword } from "../src/server/auth/crypto";
import {
  findOwnerByEmail,
  revokeAllOwnerSessions,
  updateOwnerPassword,
} from "../src/server/auth/repository";

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  throw new Error("ADMIN_EMAIL y ADMIN_PASSWORD son obligatorios para restablecer la cuenta propietaria.");
}

try {
  const owner = await findOwnerByEmail(email);
  if (!owner) {
    throw new Error("No existe una cuenta propietaria con el ADMIN_EMAIL indicado.");
  }

  await updateOwnerPassword(owner.id, await hashPassword(password));
  await revokeAllOwnerSessions(owner.id);
  console.log("Contraseña propietaria actualizada y sesiones anteriores revocadas.");
} finally {
  await closeDb();
}
