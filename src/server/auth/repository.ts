import { and, eq, isNull } from "drizzle-orm";
import { adminSessions, adminUsers } from "../../db/schema";
import { db } from "../db";
import { hashToken } from "./crypto";

export async function findOwnerByEmail(email: string) {
  const normalized = email.trim().toLowerCase();
  const [owner] = await db()
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.email, normalized), eq(adminUsers.role, "owner")))
    .limit(1);
  return owner ?? null;
}

export async function updateLastLogin(userId: string) {
  await db()
    .update(adminUsers)
    .set({ lastLoginAt: new Date(), updatedAt: new Date() })
    .where(eq(adminUsers.id, userId));
}

export async function updateOwnerPassword(userId: string, passwordHash: string) {
  await db()
    .update(adminUsers)
    .set({ passwordHash, updatedAt: new Date() })
    .where(and(eq(adminUsers.id, userId), eq(adminUsers.role, "owner")));
}

export async function createSessionRecord(input: {
  userId: string;
  tokenHash: string;
  csrfTokenHash: string;
  expiresAt: Date;
}) {
  const [session] = await db()
    .insert(adminSessions)
    .values({
      adminUserId: input.userId,
      tokenHash: input.tokenHash,
      csrfTokenHash: input.csrfTokenHash,
      expiresAt: input.expiresAt,
    })
    .returning();
  return session;
}

export async function findSessionByTokenHash(tokenHash: string) {
  const [result] = await db()
    .select({ session: adminSessions, user: adminUsers })
    .from(adminSessions)
    .innerJoin(adminUsers, eq(adminSessions.adminUserId, adminUsers.id))
    .where(
      and(
        eq(adminSessions.tokenHash, tokenHash),
        isNull(adminSessions.revokedAt),
        eq(adminUsers.isActive, true),
      ),
    )
    .limit(1);
  return result ?? null;
}

export async function touchSession(sessionId: string) {
  await db()
    .update(adminSessions)
    .set({ lastSeenAt: new Date() })
    .where(eq(adminSessions.id, sessionId));
}

export async function revokeSession(sessionId: string) {
  await db()
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.id, sessionId), isNull(adminSessions.revokedAt)));
}

export async function revokeAllOwnerSessions(userId: string) {
  await db()
    .update(adminSessions)
    .set({ revokedAt: new Date() })
    .where(and(eq(adminSessions.adminUserId, userId), isNull(adminSessions.revokedAt)));
}

export { hashToken };
