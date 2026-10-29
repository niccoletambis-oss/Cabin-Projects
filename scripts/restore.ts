import "dotenv/config";
import { restoreBackup } from "./lib/backup";
async function main() {
  const {
    BACKUP_PREFIX,
    RESTORE_TARGET_DATABASE_URL,
    RESTORE_CONFIRM,
    DATABASE_URL,
    DIRECT_DATABASE_URL,
  } = process.env;
  if (
    !BACKUP_PREFIX ||
    !RESTORE_TARGET_DATABASE_URL ||
    !RESTORE_CONFIRM ||
    !DATABASE_URL
  )
    throw new Error("Missing restore configuration.");
  const result = await restoreBackup(
    BACKUP_PREFIX,
    DIRECT_DATABASE_URL ?? DATABASE_URL,
    RESTORE_TARGET_DATABASE_URL,
    RESTORE_CONFIRM,
  );
  console.info(JSON.stringify({ status: "restore_verified", ...result }));
}
main().catch(() => {
  console.error(
    "Restore refused or failed. Verify a separate EMPTY database, exact confirmation, key, backup integrity and PostgreSQL/TLS access. Never cut over after a failure.",
  );
  process.exitCode = 1;
});
