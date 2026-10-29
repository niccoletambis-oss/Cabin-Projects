import { randomBytes } from "node:crypto";
import { db } from "./db";
import { tokenHash, verifyPassword, hashPassword } from "./security";
import { enforceLoginAccount, subjectHash, RateLimitError } from "./rate-limit";
import { requestId } from "./observability";
import { sessionHours } from "./environment";
import { assertMfaPolicy } from "./mfa-policy";
const invalid = () =>
  new Error("Invalid credentials or account temporarily unavailable.");
export async function authenticate(
  email: string,
  password: string,
  context: { requestId?: string } = {},
) {
  const normalized = email.trim().toLowerCase();
  const id = requestId(context.requestId);
  try {
    await enforceLoginAccount(normalized);
  } catch (error) {
    if (error instanceof RateLimitError)
      await db.activityLog.create({
        data: {
          action: "LOGIN_THROTTLED",
          requestId: id,
          details: `Authentication throttled; subject ${subjectHash(normalized)}`,
        },
      });
    throw error;
  }
  const user = await db.user.findUnique({ where: { email: normalized } });
  const valid = await verifyPassword(password, user?.passwordHash ?? null);
  if (!user) {
    await db.activityLog.create({
      data: {
        action: "LOGIN_FAILED",
        requestId: id,
        details: `Unsuccessful authentication; subject ${subjectHash(normalized)}`,
      },
    });
    throw invalid();
  }
  const token = randomBytes(32).toString("hex");
  const accepted = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    const now = new Date();
    const locked = !!current.lockedUntil && current.lockedUntil > now;
    if (
      !valid ||
      !current.active ||
      locked ||
      current.passwordHash !== user.passwordHash
    ) {
      if (!locked && current.active) {
        const failures =
          (current.lockedUntil && current.lockedUntil <= now
            ? 0
            : current.failedLogins) + 1;
        await tx.user.update({
          where: { id: user.id },
          data: {
            failedLogins: failures,
            lockedUntil:
              failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000) : null,
          },
        });
        if (failures === 5)
          await tx.activityLog.create({
            data: {
              userId: user.id,
              role: current.role,
              action: "LOGIN_LOCKED",
              requestId: id,
              details:
                "Temporary authentication lock; expires automatically after 15 minutes",
            },
          });
      }
      await tx.activityLog.create({
        data: {
          userId: user.id,
          role: current.role,
          action: "LOGIN_FAILED",
          requestId: id,
          details:
            "Unsuccessful authentication attempt; credentials and client addresses are not recorded",
        },
      });
      return false;
    }
    assertMfaPolicy();
    await tx.user.update({
      where: { id: user.id },
      data: { lastLogin: now, failedLogins: 0, lockedUntil: null },
    });
    await tx.session.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        expiresAt: new Date(Date.now() + sessionHours() * 60 * 60 * 1000),
      },
    });
    await tx.activityLog.create({
      data: {
        userId: user.id,
        role: current.role,
        action: "LOGIN",
        requestId: id,
        details: "User signed in",
      },
    });
    return true;
  });
  if (!accepted) throw invalid();
  return token;
}
export async function sessionUser(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: tokenHash(token) },
    select: {
      expiresAt: true,
      user: {
        select: { id: true, name: true, email: true, role: true, active: true },
      },
    },
  });
  if (!session || session.expiresAt <= new Date() || !session.user.active)
    return null;
  const { active, ...user } = session.user;
  void active;
  return user;
}
export async function destroySession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return;
  await db.$transaction(async (tx) => {
    const session = await tx.session.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { user: true },
    });
    if (session) {
      const claimed = await tx.session.deleteMany({
        where: { id: session.id },
      });
      if (claimed.count)
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

export async function changeOwnPassword(
  actor: { id: string; role: import("@prisma/client").Role },
  currentPassword: string,
  password: string,
) {
  const passwordHash = await hashPassword(password);
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${actor.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({
      where: { id: actor.id },
    });
    if (
      !current.active ||
      !(await verifyPassword(currentPassword, current.passwordHash))
    )
      throw new Error("Current password is incorrect");
    await tx.user.update({
      where: { id: actor.id },
      data: { passwordHash, failedLogins: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: actor.id } });
    await tx.passwordResetToken.updateMany({
      where: { userId: actor.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        role: current.role,
        action: "PASSWORD_CHANGED",
        details: "Own password changed; sessions and reset links revoked",
      },
    });
  });
}
