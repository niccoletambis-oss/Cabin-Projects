import "dotenv/config";
import { readFile, stat } from "node:fs/promises";
import { z } from "zod";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security";
async function main() {
  const mode = process.argv[2];
  if (!["bootstrap", "recover"].includes(mode))
    throw new Error("Use admin:bootstrap or admin:recover.");
  const email = z.email().parse(process.env.ADMIN_EMAIL).toLowerCase();
  const name = z.string().trim().min(2).max(120).parse(process.env.ADMIN_NAME);
  const file = process.env.ADMIN_PASSWORD_FILE;
  if (!file) throw new Error("ADMIN_PASSWORD_FILE is required.");
  const info = await stat(file);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error("Password file must be private (0600).");
  const passwordHash = await hashPassword(
    (await readFile(file, "utf8")).replace(/\r?\n$/, ""),
  );
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(493061)`;
    if (mode === "bootstrap") {
      if (await tx.user.count({ where: { role: "ADMIN" } }))
        throw new Error("An Admin already exists; bootstrap refused.");
      const user = await tx.user.create({
        data: { email, name, role: "ADMIN", passwordHash },
      });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          role: "ADMIN",
          action: "ADMIN_BOOTSTRAPPED",
          entityId: user.id,
          details: "Explicit CLI bootstrap; no demo credentials",
        },
      });
    } else {
      if (process.env.ADMIN_RECOVERY_CONFIRM !== `RECOVER_ADMIN:${email}`)
        throw new Error("Recovery confirmation required.");
      const user = await tx.user.findUnique({ where: { email } });
      if (!user || user.role !== "ADMIN")
        throw new Error("Recovery requires an existing Admin.");
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          active: true,
          failedLogins: 0,
          lockedUntil: null,
        },
      });
      await tx.session.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.activityLog.create({
        data: {
          userId: user.id,
          role: "ADMIN",
          action: "ADMIN_RECOVERED",
          entityId: user.id,
          details:
            "Explicit CLI recovery; all sessions and reset tokens revoked",
        },
      });
    }
  });
  console.info("Admin operation completed. No passwords were printed.");
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error &&
        /^(Use admin|ADMIN_PASSWORD|Password file|Password must|An Admin|Recovery confirmation|Recovery requires)/.test(
          error.message,
        )
        ? error.message
        : "Admin operation failed. Check configuration and unique email. No credentials are logged.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
