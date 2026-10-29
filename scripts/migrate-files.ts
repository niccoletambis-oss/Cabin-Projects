import "dotenv/config";
import { db } from "../src/lib/db";
import { stageFile, readyFile, discardFile } from "../src/lib/storage/service";
async function main() {
  if (process.env.FILE_MIGRATION_CONFIRM !== "MIGRATE_PRIVATE_FILES")
    throw new Error(
      "Explicit FILE_MIGRATION_CONFIRM=MIGRATE_PRIVATE_FILES is required.",
    );
  const actor = await db.user.findUnique({
    where: { email: process.env.FILE_MIGRATION_ACTOR_EMAIL ?? "" },
  });
  if (!actor?.active || actor.role !== "ADMIN")
    throw new Error("A named active Admin is required.");
  let migrated = 0,
    failed = 0;
  for (const model of ["photoEvidence", "operationAttachment"] as const) {
    const args = {
      where: { storedFileId: null },
      take: 25,
      orderBy: { id: "asc" as const },
    };
    const rows =
      model === "photoEvidence"
        ? await db.photoEvidence.findMany(args)
        : await db.operationAttachment.findMany(args);
    for (const row of rows) {
      let file;
      try {
        file = await stageFile(
          actor,
          { data: row.data, contentType: row.contentType },
          model === "operationAttachment",
        );
        const staged = file;
        await db.$transaction(async (tx) => {
          const args = {
            where: { id: row.id, storedFileId: null },
            data: { storedFileId: staged.id },
          };
          const result =
            model === "photoEvidence"
              ? await tx.photoEvidence.updateMany(args)
              : await tx.operationAttachment.updateMany(args);
          if (result.count !== 1) throw new Error("Concurrent migration");
          await readyFile(tx, staged, actor);
        });
        migrated++;
      } catch {
        if (file) await discardFile(file);
        failed++;
      }
    }
  }
  console.info(
    JSON.stringify({
      migrated,
      failed,
      legacyBytesRetained: true,
      batchLimitPerType: 25,
    }),
  );
  if (failed) process.exitCode = 1;
}
main()
  .catch(() => {
    console.error(
      "File migration refused or failed. Check explicit confirmation, active Admin and storage. Legacy data has been retained.",
    );
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
