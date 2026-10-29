import { Client } from "pg";
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  createHash,
} from "node:crypto";
import {
  mkdir,
  readFile,
  writeFile,
  stat,
  mkdtemp,
  rm,
  chmod,
  realpath,
} from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { databaseOptions } from "../../src/lib/database-options";
export function connection(url: string) {
  return new Client({
    ...databaseOptions({ ...process.env, DATABASE_URL: url }),
    connectionTimeoutMillis: 5000,
  });
}
export async function backupKey() {
  const file = process.env.BACKUP_KEY_FILE;
  if (!file)
    throw new Error(
      "BACKUP_KEY_FILE is required (32-byte hex key in a private file).",
    );
  const info = await stat(file);
  if (!info.isFile() || info.mode & 0o077)
    throw new Error("Backup key must be a private 0600 regular file.");
  const value = (await readFile(file, "utf8")).trim();
  if (!/^[a-f0-9]{64}$/i.test(value))
    throw new Error("Backup key must contain 64 hexadecimal characters.");
  return Buffer.from(value, "hex");
}
export function sameDatabase(source: string, target: string) {
  const a = new URL(source),
    b = new URL(target);
  const host = (u: URL) =>
    ["localhost", "127.0.0.1", "[::1]"].includes(u.hostname)
      ? "loopback"
      : u.hostname;
  return (
    host(a) === host(b) &&
    (a.port || "5432") === (b.port || "5432") &&
    a.pathname === b.pathname
  );
}
function tool(command: string, url: string, args: string[]) {
  const u = new URL(url);
  const env = {
    ...process.env,
    PGHOST: u.hostname,
    PGPORT: u.port || "5432",
    PGDATABASE: decodeURIComponent(u.pathname.slice(1)),
    PGUSER: decodeURIComponent(u.username),
    PGPASSWORD: decodeURIComponent(u.password),
    PGSSLMODE:
      process.env.DATABASE_SSL === "verify-full" ? "verify-full" : "prefer",
    PGSSLROOTCERT: process.env.DATABASE_SSL_CA_FILE,
    PGCONNECT_TIMEOUT: "5",
  };
  const container = process.env.PG_TOOL_CONTAINER;
  if (container && process.env.APP_ENV === "production")
    throw new Error("Container tool wrapper is local-verification only.");
  return spawn(
    container ? "docker" : command,
    container
      ? [
          "exec",
          "-i",
          ...[
            "PGHOST",
            "PGPORT",
            "PGDATABASE",
            "PGUSER",
            "PGPASSWORD",
            "PGSSLMODE",
            "PGCONNECT_TIMEOUT",
          ].flatMap((key) => ["-e", key]),
          container,
          command,
          ...args,
        ]
      : args,
    { env, stdio: ["pipe", "pipe", "pipe"] },
  );
}
function completed(child: ReturnType<typeof tool>) {
  return new Promise<void>((resolve, reject) => {
    child.once("error", () =>
      reject(new Error("PostgreSQL tool could not start.")),
    );
    child.stderr.resume();
    child.once("close", (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(
              "PostgreSQL tool failed. Check installed version, database access and TLS configuration.",
            ),
          ),
    );
  });
}
export async function rowCounts(client: Client) {
  const tables = await client.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename",
  );
  const counts: Record<string, string> = {};
  for (const { tablename } of tables.rows) {
    const quoted = '"' + tablename.replaceAll('"', '""') + '"';
    const result = await client.query<{ count: string }>(
      `SELECT count(*)::text AS count FROM public.${quoted}`,
    );
    counts[tablename] = result.rows[0].count;
  }
  return counts;
}
async function audit(client: Client, action: string) {
  await client.query(
    'INSERT INTO "ActivityLog" (id,action,details,"createdAt") VALUES ($1,$2,$3,now())',
    [
      randomBytes(16).toString("hex"),
      action,
      "Administrative backup/recovery verification; credentials and contents excluded",
    ],
  );
}
export async function createBackup(directory: string, source: string) {
  const key = await backupKey();
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const path = resolve(directory);
  if ((await realpath(directory)) !== path || (await stat(path)).mode & 0o077)
    throw new Error(
      "Backup directory must be private (0700), without symlinks.",
    );
  const prefix = join(
    path,
    `cabin-${new Date().toISOString().replaceAll(":", "-")}-${randomBytes(4).toString("hex")}`,
  );
  const output = prefix + ".dump.enc";
  const client = connection(source);
  await client.connect();
  try {
    await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
    const snapshot = (
      await client.query<{ snapshot: string }>(
        "SELECT pg_export_snapshot() AS snapshot",
      )
    ).rows[0].snapshot;
    const counts = await rowCounts(client);
    const objects = (
      await client.query(
        'SELECT id,"objectKey",provider,"storageVersion",sha256,size FROM "StoredFile" WHERE state IN (\'READY\',\'ARCHIVED\') ORDER BY id',
      )
    ).rows;
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const child = tool("pg_dump", source, [
      "--format=custom",
      "--no-owner",
      "--no-acl",
      `--snapshot=${snapshot}`,
    ]);
    const done = completed(child);
    try {
      await Promise.all([
        pipeline(
          child.stdout,
          cipher,
          createWriteStream(output, { flags: "wx", mode: 0o600 }),
        ),
        done,
      ]);
    } catch (error) {
      child.kill();
      await rm(output, { force: true });
      throw error;
    }
    const encrypted = await readFile(output);
    const manifest = {
      version: 1,
      createdAt: new Date().toISOString(),
      counts,
      objects,
      dumpSha256: createHash("sha256").update(encrypted).digest("hex"),
      dumpIv: iv.toString("hex"),
      dumpTag: cipher.getAuthTag().toString("hex"),
    };
    const miv = randomBytes(12);
    const mcipher = createCipheriv("aes-256-gcm", key, miv);
    const payload = Buffer.concat([
      mcipher.update(JSON.stringify(manifest)),
      mcipher.final(),
    ]);
    await writeFile(
      prefix + ".manifest.enc",
      Buffer.concat([miv, mcipher.getAuthTag(), payload]),
      { flag: "wx", mode: 0o600 },
    );
    await client.query("COMMIT");
    await audit(client, "BACKUP_COMPLETED");
    return prefix;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}
export async function restoreBackup(
  prefix: string,
  source: string,
  target: string,
  confirmation: string,
) {
  const u = new URL(target);
  const dbname = decodeURIComponent(u.pathname.slice(1));
  if (
    sameDatabase(source, target) ||
    confirmation !== `RESTORE_TO_EMPTY_DATABASE:${dbname}`
  )
    throw new Error(
      "Restore requires a different empty target and exact explicit confirmation.",
    );
  const key = await backupKey();
  const encryptedManifest = await readFile(prefix + ".manifest.enc");
  const mdec = createDecipheriv(
    "aes-256-gcm",
    key,
    encryptedManifest.subarray(0, 12),
  );
  mdec.setAuthTag(encryptedManifest.subarray(12, 28));
  const manifest = JSON.parse(
    Buffer.concat([
      mdec.update(encryptedManifest.subarray(28)),
      mdec.final(),
    ]).toString(),
  );
  if (manifest.version !== 1) throw new Error("Unsupported backup version.");
  const dump = await readFile(prefix + ".dump.enc");
  if (createHash("sha256").update(dump).digest("hex") !== manifest.dumpSha256)
    throw new Error("Backup integrity check failed.");
  const dir = await mkdtemp(join(tmpdir(), "cabin-restore-"));
  await chmod(dir, 0o700);
  const plaintext = join(dir, "verified.dump");
  const client = connection(target);
  try {
    const dec = createDecipheriv(
      "aes-256-gcm",
      key,
      Buffer.from(manifest.dumpIv, "hex"),
    );
    dec.setAuthTag(Buffer.from(manifest.dumpTag, "hex"));
    await pipeline(
      createReadStream(prefix + ".dump.enc"),
      dec,
      createWriteStream(plaintext, { flags: "wx", mode: 0o600 }),
    ); // GCM must authenticate fully before pg_restore executes anything.
    await client.connect();
    await client.query("SELECT pg_advisory_lock(493061)");
    const count = await client.query(
      "SELECT 1 FROM pg_tables WHERE schemaname='public' UNION ALL SELECT 1 FROM information_schema.routines WHERE routine_schema='public' UNION ALL SELECT 1 FROM information_schema.sequences WHERE sequence_schema='public' LIMIT 1",
    );
    if (count.rowCount)
      throw new Error("Restore target is not empty; refusing to overwrite.");
    const child = tool("pg_restore", target, [
      "--single-transaction",
      "--exit-on-error",
      "--no-owner",
      "--no-acl",
      `--dbname=${dbname}`,
    ]);
    const done = completed(child);
    await Promise.all([
      pipeline(createReadStream(plaintext), child.stdin),
      done,
    ]);
    const counts = await rowCounts(client);
    if (JSON.stringify(counts) !== JSON.stringify(manifest.counts))
      throw new Error("Restored row counts differ. Do not cut over.");
    await audit(client, "RESTORE_COMPLETED");
    return {
      tables: Object.keys(counts).length,
      objects: manifest.objects.length,
    };
  } finally {
    await client.end().catch(() => {});
    await rm(dir, { recursive: true, force: true });
  }
}
