import { randomBytes } from "node:crypto";
import { db } from "./db";
import { hashPassword, tokenHash } from "./security";
import { enforceRate, rateLimitValue, subjectHash } from "./rate-limit";
import { configuredAppUrl } from "./environment";
import { requestId, captureError } from "./observability";
import { type ResetEmail } from "./email";
export async function requestPasswordReset(
  email: string,
  deliver: (message: ResetEmail) => void | Promise<void>,
  context: { requestId?: string } = {},
) {
  const normalized = email.trim().toLowerCase();
  const id = requestId(context.requestId);
  await enforceRate(
    "reset-account",
    normalized,
    rateLimitValue("RATE_LIMIT_RESET_ACCOUNT", 5),
    15 * 60 * 1000,
  );
  const user = await db.user.findUnique({ where: { email: normalized } });
  const token = randomBytes(32).toString("hex");
  await db.activityLog.create({
    data: {
      action: "PASSWORD_RESET_REQUESTED",
      requestId: id,
      details: `Recovery request accepted; subject ${subjectHash(normalized)}`,
    },
  });
  if (!user || !user.active || !user.passwordHash) return;
  const created = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${user.id} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id } });
    if (!current.active || !current.passwordHash) return false;
    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: tokenHash(token),
        credentialHash: tokenHash(current.passwordHash),
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      },
    });
    return true;
  });
  if (created) {
    const url = new URL("/reset-password", configuredAppUrl());
    url.searchParams.set("token", token);
    try {
      await deliver({ to: user.email, url: url.toString() });
    } catch (error) {
      await captureError("password_reset_delivery", error, id);
    }
  }
}
export async function completePasswordReset(
  token: string,
  password: string,
  context: { requestId?: string } = {},
) {
  if (!/^[a-f0-9]{64}$/.test(token)) return false;
  const hashed = await hashPassword(password);
  const hash = tokenHash(token);
  const initial = await db.passwordResetToken.findUnique({
    where: { tokenHash: hash },
    select: { userId: true },
  });
  if (!initial) return false;
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "User" WHERE id=${initial.userId} FOR UPDATE`;
    const row = await tx.passwordResetToken.findUnique({
      where: { tokenHash: hash },
      include: { user: true },
    });
    if (
      !row ||
      row.usedAt ||
      row.expiresAt <= new Date() ||
      !row.user.active ||
      row.credentialHash !== tokenHash(row.user.passwordHash ?? "")
    )
      return false;
    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;
    await tx.user.update({
      where: { id: row.userId },
      data: { passwordHash: hashed, failedLogins: 0, lockedUntil: null },
    });
    await tx.session.deleteMany({ where: { userId: row.userId } });
    await tx.passwordResetToken.updateMany({
      where: { userId: row.userId, usedAt: null },
      data: { usedAt: new Date() },
    });
    await tx.activityLog.create({
      data: {
        userId: row.userId,
        role: row.user.role,
        action: "PASSWORD_RESET_COMPLETED",
        requestId: requestId(context.requestId),
        details:
          "Password reset completed; all sessions and other recovery tokens revoked",
      },
    });
    return true;
  });
}
