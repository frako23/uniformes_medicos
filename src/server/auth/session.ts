import { deriveCsrfToken, hashToken, randomToken } from "./crypto";
import {
  createSessionRecord,
  findSessionByTokenHash,
  revokeSession,
  touchSession,
} from "./repository";

export const SESSION_IDLE_MS = 30 * 60 * 1000;
export const SESSION_ABSOLUTE_MS = 8 * 60 * 60 * 1000;

function sessionCookieName() {
  return process.env.NODE_ENV === "production" ? "__Host-admin_session" : "admin_session";
}

function cookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return null;
}

export function getSessionToken(request: Request) {
  return cookieValue(request.headers.get("cookie"), sessionCookieName());
}

export function getCsrfToken(request: Request) {
  const token = getSessionToken(request);
  return token ? deriveCsrfToken(token) : null;
}

export async function createSession(userId: string) {
  const sessionToken = randomToken();
  const csrfToken = deriveCsrfToken(sessionToken);
  const expiresAt = new Date(Date.now() + SESSION_ABSOLUTE_MS);
  const session = await createSessionRecord({
    userId,
    tokenHash: hashToken(sessionToken),
    csrfTokenHash: hashToken(csrfToken),
    expiresAt,
  });
  return { session, sessionToken, csrfToken, expiresAt };
}

export async function getSession(request: Request) {
  const rawToken = getSessionToken(request);
  if (!rawToken) return null;

  const result = await findSessionByTokenHash(hashToken(rawToken));
  if (!result) return null;

  const now = Date.now();
  const idleExpired = now - result.session.lastSeenAt.getTime() > SESSION_IDLE_MS;
  const absoluteExpired = result.session.expiresAt.getTime() <= now;
  if (idleExpired || absoluteExpired) {
    await revokeSession(result.session.id);
    return null;
  }

  await touchSession(result.session.id);
  return { ...result, rawToken };
}

export async function validateCsrf(request: Request, providedToken?: string) {
  const sessionToken = getSessionToken(request);
  if (!sessionToken || !providedToken) return false;
  const session = await findSessionByTokenHash(hashToken(sessionToken));
  if (!session) return false;
  return hashToken(providedToken) === session.session.csrfTokenHash;
}

export async function logout(request: Request) {
  const rawToken = getSessionToken(request);
  if (!rawToken) return;
  const result = await findSessionByTokenHash(hashToken(rawToken));
  if (result) await revokeSession(result.session.id);
}

export function sessionCookie(token: string, maxAgeSeconds: number) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName()}=${encodeURIComponent(token)}; Max-Age=${maxAgeSeconds}; Path=/; HttpOnly; SameSite=Lax${secure}`;
}

export function clearSessionCookie() {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${sessionCookieName()}=; Max-Age=0; Path=/; HttpOnly; SameSite=Lax${secure}`;
}
