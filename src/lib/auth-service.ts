import { randomBytes } from "node:crypto";
import { db } from "./db";
import { tokenHash, verifyPassword } from "./security";
export async function authenticate(email: string, password: string) {
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (
    !user ||
    !valid ||
    !user.active ||
    (user.lockedUntil && user.lockedUntil > new Date())
  ) {
    if (user)
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLogins: { increment: 1 },
          ...(user.failedLogins >= 4
            ? { lockedUntil: new Date(Date.now() + 15 * 60 * 1000) }
            : {}),
        },
      });
    throw new Error("Invalid credentials or account temporarily unavailable.");
  }
  const token = randomBytes(32).toString("hex");
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (
      !current.active ||
      current.passwordHash !== user.passwordHash ||
      (current.lockedUntil && current.lockedUntil > new Date())
    )
      throw new Error("Account changed. Sign in again.");
    await tx.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date(), failedLogins: 0, lockedUntil: null },
    });
    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
      },
    });
    await tx.activityLog.create({
      data: {
        userId: user.id,
        role: user.role,
        action: "LOGIN",
        details: "User signed in",
      },
    });
  });
  return token;
}
export async function sessionUser(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    return null;
  return {
    id: session.user.id,
    name: session.user.name,
    email: session.user.email,
    role: session.user.role,
  };
}
export async function destroySession(token: string | undefined) {
  if (!token) return;
  await db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (session) {
      await tx.session.delete({ where: { id: session.id } });
      await tx.activityLog.create({
        data: {
          userId: session.userId,
          role: session.user.role,
          action: "LOGOUT",
          details: "User signed out",
        },
      });
    }
  });
}
