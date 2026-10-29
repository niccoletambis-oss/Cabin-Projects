import "dotenv/config";
import { db } from "../src/lib/db";
import { discardFile } from "../src/lib/storage/service";
async function main() {
  if (process.env.MAINTENANCE_CONFIRM !== "EXPIRED_SECURITY_AND_UNLINKED_FILES")
    throw new Error("Explicit maintenance confirmation required.");
  const old = new Date(Date.now() - 86400000);
  const files = await db.storedFile.findMany({
    where: {
      state: { in: ["STAGED", "FAILED"] },
      createdAt: { lt: old },
      photos: { none: {} },
      operations: { none: {} },
      privateAttachments: { none: {} },
    },
    take: 100,
  });
  for (const file of files) await discardFile(file);
  await db.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: old } } });
  await db.session.deleteMany({ where: { expiresAt: { lt: old } } });
  await db.passwordResetToken.deleteMany({
    where: { expiresAt: { lt: new Date(Date.now() - 30 * 86400000) } },
  });
  console.info(
    "Expired security state and unlinked staged file cleanup completed. Operational, financial and audit records were retained.",
  );
}
main()
  .catch(() => {
    console.error("Maintenance failed or explicit confirmation was missing.");
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
