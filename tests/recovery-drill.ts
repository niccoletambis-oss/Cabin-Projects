// Explicit operator verification, never part of ordinary unit tests. Only creates/drops its own random databases.
import "dotenv/config";
import { stayFixture, cleanupStay } from "./stay-fixtures";
import { db } from "../src/lib/db";
import { attachPrivateEvidence } from "../src/lib/private-evidence";
import sharp from "sharp";
import { randomBytes, createHash } from "node:crypto";
import { mkdtemp, writeFile, chmod, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import {
  connection,
  createBackup,
  restoreBackup,
  rowCounts,
} from "../scripts/lib/backup";
async function main() {
  if (
    process.env.APP_ENV === "production" ||
    process.env.RECOVERY_DRILL_CONFIRM !== "ISOLATED_LOCAL_DRILL"
  )
    throw new Error(
      "Recovery drill requires explicit local-development confirmation.",
    );
  const source = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL!;
  const targetName = `cabin_recovery_${randomBytes(6).toString("hex")}`;
  const target = new URL(source);
  target.pathname = "/" + targetName;
  const original = connection(source);
  await original.connect();
  const dir = await mkdtemp(join(tmpdir(), "cabin-drill-"));
  await chmod(dir, 0o700);
  const key = join(dir, "backup.key");
  await writeFile(key, randomBytes(32).toString("hex"), { mode: 0o600 });
  process.env.BACKUP_KEY_FILE = key;
  const f = await stayFixture();
  const attachment = await attachPrivateEvidence(
    f.admin,
    { locationId: f.room.id },
    {
      data: await sharp({
        create: { width: 2, height: 2, channels: 3, background: "white" },
      })
        .png()
        .toBuffer(),
      contentType: "image/png",
      originalName: "recovery.png",
    },
  );
  const stored = await db.storedFile.findUniqueOrThrow({
    where: { id: attachment.storedFileId },
  });
  let created = false;
  let bootstrapCreated = false;
  const bootstrapName = targetName + "_admin";
  try {
    await original.query(`CREATE DATABASE "${targetName}"`);
    created = true;
    const prefix = await createBackup(dir, source);
    await assert.rejects(
      restoreBackup(
        prefix,
        source,
        source,
        "RESTORE_TO_EMPTY_DATABASE:" + new URL(source).pathname.slice(1),
      ),
    );
    await assert.rejects(
      restoreBackup(prefix, source, target.toString(), "wrong-confirmation"),
    );
    const corrupt = await readFile(prefix + ".dump.enc");
    corrupt[0] ^= 1;
    await writeFile(prefix + "-corrupt.dump.enc", corrupt, { mode: 0o600 });
    await writeFile(
      prefix + "-corrupt.manifest.enc",
      await readFile(prefix + ".manifest.enc"),
      { mode: 0o600 },
    );
    await assert.rejects(
      restoreBackup(
        prefix + "-corrupt",
        source,
        target.toString(),
        `RESTORE_TO_EMPTY_DATABASE:${targetName}`,
      ),
    );
    const result = await restoreBackup(
      prefix,
      source,
      target.toString(),
      `RESTORE_TO_EMPTY_DATABASE:${targetName}`,
    );
    const clone = connection(target.toString());
    await clone.connect();
    try {
      const counts = await rowCounts(clone);
      assert.ok(Object.keys(counts).length > 20);
      await assert.rejects(
        restoreBackup(
          prefix,
          source,
          target.toString(),
          `RESTORE_TO_EMPTY_DATABASE:${targetName}`,
        ),
      ); // A second attempt cannot overwrite restored data.
      const file = join(dir, "admin-password");
      await writeFile(file, "IsolatedRecoveryPassword2026!", { mode: 0o600 });
      const restored = (
        await clone.query('SELECT data,sha256 FROM "StoredFile" WHERE id=$1', [
          stored.id,
        ])
      ).rows[0];
      assert.equal(
        createHash("sha256").update(restored.data).digest("hex"),
        stored.sha256,
      );
      const email = f.admin.email;
      const env = {
        ...process.env,
        DATABASE_URL: target.toString(),
        DIRECT_DATABASE_URL: target.toString(),
        ADMIN_EMAIL: email,
        ADMIN_NAME: "Isolated recovery operator",
        ADMIN_PASSWORD_FILE: file,
        ADMIN_RECOVERY_CONFIRM: `RECOVER_ADMIN:${email}`,
      };
      const child = spawnSync(
        process.execPath,
        ["node_modules/tsx/dist/cli.mjs", "scripts/admin.ts", "recover"],
        { env, encoding: "utf8" },
      );
      assert.equal(child.status, 0, child.stderr);
      assert.equal(
        (
          await clone.query(
            'SELECT count(*) AS count FROM "Session" WHERE "userId"=(SELECT id FROM "User" WHERE email=$1)',
            [email],
          )
        ).rows[0].count,
        "0",
      );
      await original.query(`CREATE DATABASE "${bootstrapName}"`);
      bootstrapCreated = true;
      const bootstrapUrl = new URL(source);
      bootstrapUrl.pathname = "/" + bootstrapName;
      const bootstrapEnv = {
        ...env,
        DATABASE_URL: bootstrapUrl.toString(),
        DIRECT_DATABASE_URL: bootstrapUrl.toString(),
      };
      const migrate = spawnSync(
        process.execPath,
        ["node_modules/prisma/build/index.js", "migrate", "deploy"],
        { env: bootstrapEnv, encoding: "utf8" },
      );
      assert.equal(migrate.status, 0, migrate.stderr);
      const bootstrap = () =>
        spawnSync(
          process.execPath,
          ["node_modules/tsx/dist/cli.mjs", "scripts/admin.ts", "bootstrap"],
          { env: bootstrapEnv, encoding: "utf8" },
        );
      const first = bootstrap();
      assert.equal(first.status, 0, first.stderr);
      assert.notEqual(bootstrap().status, 0);
      console.info(
        JSON.stringify({
          status: "encrypted_backup_restore_verified",
          ...result,
          sourceReset: false,
          overwriteRefused: true,
          adminRecoveryVerified: true,
          adminBootstrapVerified: true,
          attachmentHashVerified: true,
          corruptionRefused: true,
        }),
      );
    } finally {
      await clone.end();
    }
  } finally {
    if (bootstrapCreated) {
      await original.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [bootstrapName],
      );
      await original.query(`DROP DATABASE "${bootstrapName}"`);
    }
    await db.privateAttachment.delete({ where: { id: attachment.id } });
    await cleanupStay(f);
    await db.$disconnect();
    if (created) {
      await original.query(
        "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname=$1 AND pid<>pg_backend_pid()",
        [targetName],
      );
      await original.query(`DROP DATABASE "${targetName}"`);
    }
    await original.end();
    await rm(dir, { recursive: true, force: true });
  }
}
main().catch((error) => {
  console.error(
    error instanceof Error
      ? { name: error.name, message: error.message.split("\n")[0] }
      : "Unknown verification error",
  );
  console.error(
    "Isolated recovery drill failed; source database was not reset.",
  );
  process.exitCode = 1;
});
