import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const SCRYPT_OPTIONS = { N: 16_384, r: 8, p: 1, maxmem: 32 * 1024 * 1024 } as const;

export async function hashPassword(password: string) {
  const salt = randomBytes(16);
  const derived = await scrypt(password, salt, 64, SCRYPT_OPTIONS);
  return `scrypt$${SCRYPT_OPTIONS.N}$${SCRYPT_OPTIONS.r}$${SCRYPT_OPTIONS.p}$${salt.toString("base64url")}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [algorithm, n, r, p, encodedSalt, encodedHash] = storedHash.split("$");
  if (algorithm !== "scrypt" || !n || !r || !p || !encodedSalt || !encodedHash) {
    return false;
  }

  try {
    const salt = Buffer.from(encodedSalt, "base64url");
    const expected = Buffer.from(encodedHash, "base64url");
    const actual = await scrypt(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: 32 * 1024 * 1024,
    });
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function deriveCsrfToken(sessionToken: string) {
  return createHash("sha256").update(`${sessionToken}|csrf`).digest("base64url");
}
