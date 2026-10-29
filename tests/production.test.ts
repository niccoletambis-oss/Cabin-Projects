import "dotenv/config";
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  environmentProblems,
  assertDevelopmentSeed,
} from "../src/lib/environment";
import { databaseOptions } from "../src/lib/database-options";
import { securityHeaders } from "../src/lib/security-headers";
import { validateUpload } from "../src/lib/storage/validation";
import { safeEvent, emitEvent } from "../src/lib/observability";
import {
  enforceRate,
  RateLimitError,
  type RateStore,
  clientIdentity,
} from "../src/lib/rate-limit";
import { sameDatabase } from "../scripts/lib/backup";
import sharp from "sharp";
const valid: import("../src/lib/environment").Environment = {
  APP_ENV: "production",
  DATABASE_URL: "postgresql://app:random-strong-password@db.example:5432/cabin",
  DATABASE_SSL: "verify-full",
  APP_URL: "https://cabin.example",
  SECURITY_HASH_KEY: "a".repeat(64),
  FILE_STORAGE_PROVIDER: "s3",
  FILE_STORAGE_BUCKET: "cabin-private",
  FILE_STORAGE_REGION: "ap-southeast-1",
  FILE_STORAGE_USE_IDENTITY: "true",
  EMAIL_PROVIDER: "smtp",
  SMTP_HOST: "smtp.example",
  SMTP_PORT: "587",
  SMTP_FROM: "operations@cabin.example",
  SMTP_USE_IDENTITY: "true",
  TRUST_PROXY: "true",
  TRUSTED_CLIENT_IP_HEADER: "x-cabin-client-ip",
};
test("production config fails closed without leaking values; demo seeds blocked in both production modes", () => {
  assert.deepEqual(environmentProblems(valid), []);
  for (const key of [
    "APP_URL",
    "DATABASE_SSL",
    "SECURITY_HASH_KEY",
    "FILE_STORAGE_PROVIDER",
    "FILE_STORAGE_BUCKET",
    "FILE_STORAGE_REGION",
    "EMAIL_PROVIDER",
    "SMTP_HOST",
    "SMTP_FROM",
    "TRUST_PROXY",
    "TRUSTED_CLIENT_IP_HEADER",
  ]) {
    const env = { ...valid };
    delete env[key];
    assert.ok(environmentProblems(env).length, key);
  }
  for (const override of [
    { MFA_MODE: "totp" },
    { DEV_RESET_LOG: "true" },
    { FILE_STORAGE_ENDPOINT: "http://objects.example" },
    { APP_URL: "https://evil.example/path" },
    { RATE_LIMIT_LOGIN_IP: "NaN" },
    { RATE_LIMIT_BACKEND: "memory" },
    {
      MONITORING_PROVIDER: "webhook",
      MONITORING_WEBHOOK_URL: "http://unsafe.example",
    },
  ])
    assert.ok(environmentProblems({ ...valid, ...override }).length);
  assert.throws(() => assertDevelopmentSeed({ APP_ENV: "production" }));
  assert.throws(() =>
    assertDevelopmentSeed({ APP_ENV: "development", NODE_ENV: "production" }),
  );
  assert.doesNotThrow(() => assertDevelopmentSeed({ APP_ENV: "test" }));
});
test("production TLS cannot be downgraded by connection URL options", () => {
  const options = databaseOptions({
    ...valid,
    DATABASE_URL:
      valid.DATABASE_URL + "?sslmode=no-verify&sslaccept=accept_invalid_certs",
  });
  assert.equal(options.ssl?.rejectUnauthorized, true);
  assert.ok(!options.connectionString?.includes("no-verify"));
  assert.throws(() => databaseOptions({ ...valid, DATABASE_SSL: "disable" }));
});
test("strict CSP, strict-origin, frame and capability restrictions", () => {
  const h = securityHeaders("uniqueNonce");
  assert.match(h["Content-Security-Policy"], /nonce-uniqueNonce/);
  assert.ok(!h["Content-Security-Policy"].includes("unsafe-inline"));
  assert.ok(!h["Content-Security-Policy"].includes("*"));
  assert.equal(h["Referrer-Policy"], "strict-origin");
  assert.equal(h["X-Frame-Options"], "DENY");
});
test("upload validation decodes real images, removes metadata and rejects dangerous files", async () => {
  const image = await sharp({
    create: { width: 2, height: 2, channels: 3, background: "white" },
  })
    .png()
    .withMetadata()
    .toBuffer();
  const normalized = await validateUpload({
    data: image,
    contentType: "image/png",
    originalName: "room.png",
  });
  assert.equal(normalized.contentType, "image/webp");
  assert.equal((await sharp(normalized.data).metadata()).exif, undefined);
  for (const name of [
    "../escape.png",
    "evil.exe.png",
    "C:\\bad.png",
    "name\u0000.png",
  ])
    await assert.rejects(
      validateUpload({
        data: image,
        contentType: "image/png",
        originalName: name,
      }),
    );
  await assert.rejects(
    validateUpload({
      data: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      contentType: "image/png",
    }),
  );
  await assert.rejects(
    validateUpload({
      data: Buffer.alloc(2 * 1024 * 1024 + 1),
      contentType: "image/png",
    }),
  );
  await assert.rejects(
    validateUpload({
      data: Buffer.from("MZ executable"),
      contentType: "image/png",
    }),
  );
  await assert.rejects(
    validateUpload(
      {
        data: Buffer.from("%PDF-1.4 /JavaScript %%EOF"),
        contentType: "application/pdf",
      },
      true,
    ),
  );
  await assert.rejects(
    validateUpload({
      data: Buffer.from("%PDF-1.4 %%EOF"),
      contentType: "application/pdf",
    }),
  );
  assert.equal(
    (
      await validateUpload(
        {
          data: Buffer.from("%PDF-1.4\n%%EOF"),
          contentType: "application/pdf",
        },
        true,
      )
    ).contentType,
    "application/pdf",
  );
});
test("limiter is shared-store configurable, concurrent and does not store raw subjects", async () => {
  const counts = new Map<string, number>();
  const store: RateStore = {
    async increment(key) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
      return counts.get(key)!;
    },
  };
  const results = await Promise.allSettled(
    Array.from({ length: 5 }, () =>
      enforceRate("unit", "guest@example.test", 2, 60000, store, 120000),
    ),
  );
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 2);
  assert.equal(
    results.filter(
      (r) => r.status === "rejected" && r.reason instanceof RateLimitError,
    ).length,
    3,
  );
  assert.equal(
    [...counts.keys()].some((k) => k.includes("guest")),
    false,
  );
  await enforceRate("unit", "guest@example.test", 2, 60000, store, 180000);
  assert.equal(
    clientIdentity(
      new Request("http://local", {
        headers: { "x-forwarded-for": "attacker" },
      }),
    ),
    "shared-untrusted-client",
  );
});
test("monitoring never serializes secrets, messages or request bodies", async () => {
  const event = safeEvent(
    "purchase-receive",
    new Error("password=secret resetToken=never log this"),
  );
  assert.ok(!JSON.stringify(event).includes("secret"));
  let captured = false;
  await emitEvent(event, {
    async capture(e) {
      captured = e === event;
    },
  });
  assert.equal(captured, true);
});
test("restore rejects identical target identities including loopback aliases", () => {
  assert.equal(
    sameDatabase(
      "postgres://a:a@localhost:5432/cabin",
      "postgres://b:b@127.0.0.1/cabin",
    ),
    true,
  );
  assert.equal(
    sameDatabase(
      "postgres://a:a@db:5432/cabin",
      "postgres://a:a@db:5432/isolated",
    ),
    false,
  );
});

test("public forms bound actual streamed bytes and reject unexpected encodings", async () => {
  const { publicForm } = await import("../src/lib/public-form");
  const form = await publicForm(
    new Request("http://local", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "email=test%40example.com",
    }),
  );
  assert.equal(form.get("email"), "test@example.com");
  await assert.rejects(
    publicForm(
      new Request("http://local", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "x".repeat(9000),
      }),
    ),
    /large/,
  );
  await assert.rejects(
    publicForm(
      new Request("http://local", { method: "POST", body: "unsupported" }),
    ),
    /Invalid/,
  );
});

test("production response headers preserve API denial and emit HSTS at runtime", async () => {
  const { withApiHeaders } = await import("../src/lib/api-response");
  const previous = process.env.APP_ENV;
  try {
    process.env.APP_ENV = "production";
    assert.equal(
      securityHeaders("test")["Strict-Transport-Security"],
      "max-age=31536000",
    );
    const denied = await withApiHeaders(
      () => new Response("Forbidden", { status: 403 }),
    )();
    assert.equal(denied.status, 403);
    assert.equal(await denied.text(), "Forbidden");
    assert.equal(
      denied.headers.get("Strict-Transport-Security"),
      "max-age=31536000",
    );
  } finally {
    if (previous === undefined) delete process.env.APP_ENV;
    else process.env.APP_ENV = previous;
  }
});

test("Prisma schema engine uses supported require/strict SSL rather than silently accepting verify-full", async () => {
  const { prismaDatabaseUrl } = await import("../src/lib/prisma-url");
  const url = new URL(
    prismaDatabaseUrl({
      ...valid,
      DIRECT_DATABASE_URL:
        valid.DATABASE_URL + "?sslmode=disable&sslaccept=accept_invalid_certs",
      DATABASE_SSL_CA_FILE: "/private/ca.pem",
    })!,
  );
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("sslaccept"), "strict");
  assert.equal(url.searchParams.get("sslcert"), "/private/ca.pem");
  assert.throws(() => prismaDatabaseUrl({ ...valid, DATABASE_SSL: "disable" }));
});
