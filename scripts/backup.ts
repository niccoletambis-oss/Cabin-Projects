import "dotenv/config";
import { createBackup } from "./lib/backup";
async function main() {
  if (!process.env.BACKUP_DIRECTORY || !process.env.DATABASE_URL)
    throw new Error("Set BACKUP_DIRECTORY and DATABASE_URL.");
  const prefix = await createBackup(
    process.env.BACKUP_DIRECTORY,
    process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL,
  );
  console.info(JSON.stringify({ status: "backup_complete", backup: prefix }));
}
main().catch(() => {
  console.error(
    "Backup failed. Check private output/key permissions, PostgreSQL tool version and database/TLS access. No credentials are logged.",
  );
  process.exitCode = 1;
});
