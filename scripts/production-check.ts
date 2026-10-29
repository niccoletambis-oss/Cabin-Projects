import "dotenv/config";
import { validateEnvironment, production } from "../src/lib/environment";
import { db } from "../src/lib/db";
import { storageProvider } from "../src/lib/storage/provider";
async function main() {
  validateEnvironment();
  if (!production())
    throw new Error("Production check requires APP_ENV=production.");
  await db.$queryRaw`SELECT 1`;
  if (
    await db.user.count({
      where: {
        OR: [
          { email: { endsWith: ".example" } },
          { email: { endsWith: ".invalid" } },
          { passwordHash: null, active: true },
        ],
      },
    })
  )
    throw new Error(
      "Demo/test or active passwordless accounts exist. Review and remove/deactivate them before production.",
    );
  await storageProvider().health();
  console.info(
    "Production configuration, database and private bucket checks passed. Verify email delivery, TLS proxy, backups and access policies before cutover.",
  );
}
main()
  .catch((error) => {
    console.error(
      error instanceof Error &&
        /^(Invalid server configuration|Production check|Demo\/test)/.test(
          error.message,
        )
        ? error.message
        : "Production preflight failed. Check database and private storage access.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
