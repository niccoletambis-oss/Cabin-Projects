import { test } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { stagingDatabaseDiagnostic } from "../src/lib/staging-database-diagnostic";
import { captureError } from "../src/lib/observability";
const staging = { DEPLOYMENT_TIER: "staging" };
const secret =
  "postgresql://private-user:private-password@private-host/customer-data";
function wrapped(cause: object) {
  return new Prisma.PrismaClientKnownRequestError("Raw query failed", {
    code: "P2010",
    clientVersion: "test",
    meta: { driverAdapterError: Object.assign(new Error(secret), { cause }) },
  });
}
test("temporary database metadata is absent outside exact staging tier", () => {
  for (const env of [
    {},
    { DEPLOYMENT_TIER: "production" },
    { DEPLOYMENT_TIER: "Staging" },
  ])
    assert.equal(
      stagingDatabaseDiagnostic(wrapped({ code: "28P01" }), env),
      undefined,
    );
});
test("Prisma adapter nesting exposes authentication SQLSTATE but no raw metadata", () => {
  const diagnostic = stagingDatabaseDiagnostic(
    wrapped({
      kind: "AuthenticationFailed",
      originalCode: "28P01",
      severity: "FATAL",
      originalMessage: `password authentication failed for user ${secret}`,
      user: secret,
      db: secret,
      detail: secret,
      hint: secret,
      query: secret,
    }),
    staging,
  )!;
  assert.deepEqual(diagnostic.prismaCodes, ["P2010"]);
  assert.deepEqual(diagnostic.postgresCodes, ["28P01"]);
  assert.deepEqual(diagnostic.adapterKinds, ["AuthenticationFailed"]);
  assert.deepEqual(diagnostic.postgresSeverities, ["FATAL"]);
  assert.ok(diagnostic.reasonLabels.includes("authentication_failed"));
  assert.ok(!JSON.stringify(diagnostic).includes(secret));
});
test("classifies TLS, hostname, network, pooler and SQL failures without returning messages", () => {
  for (const [cause, label] of [
    [
      {
        kind: "TlsConnectionError",
        reason: `self-signed certificate in certificate chain ${secret}`,
      },
      "tls_certificate_verification_failed",
    ],
    [
      {
        code: "ERR_TLS_CERT_ALTNAME_INVALID",
        message: `Hostname/IP does not match certificate's altnames ${secret}`,
      },
      "tls_hostname_verification_failed",
    ],
    [
      { code: "ECONNREFUSED", message: `connect ECONNREFUSED ${secret}` },
      "connection_refused",
    ],
    [
      { message: `timeout exceeded when trying to connect ${secret}` },
      "connection_timeout",
    ],
    [
      { message: `Tenant or user not found ${secret}` },
      "pooler_tenant_or_user_not_found",
    ],
    [
      {
        originalCode: "42P05",
        message: `prepared statement "${secret}" already exists`,
      },
      "pooler_prepared_statement_conflict",
    ],
    [{ code: "42601", message: secret }, "sql_execution_failure"],
  ] as const) {
    const diagnostic = stagingDatabaseDiagnostic(wrapped(cause), staging)!;
    assert.ok(diagnostic.reasonLabels.includes(label), label);
    assert.ok(!JSON.stringify(diagnostic).includes(secret));
  }
});
test("preserves internal and procedural PostgreSQL SQLSTATEs without confusing Prisma codes", () => {
  for (const code of ["XX000", "P0001", "HV000"]) {
    const diagnostic = stagingDatabaseDiagnostic(
      wrapped({ originalCode: code }),
      staging,
    )!;
    assert.deepEqual(diagnostic.postgresCodes, [code]);
    assert.deepEqual(diagnostic.prismaCodes, ["P2010"]);
  }
});
test("P2010 flattened metadata keeps pooler SQLSTATE and only fixed reason labels", () => {
  const error = new Prisma.PrismaClientKnownRequestError(secret, {
    code: "P2010",
    clientVersion: "test",
    meta: { code: "XX000", message: `Tenant or user not found ${secret}` },
  });
  const diagnostic = stagingDatabaseDiagnostic(error, staging)!;
  assert.deepEqual(diagnostic.postgresCodes, ["XX000"]);
  assert.ok(
    diagnostic.reasonLabels.includes("pooler_tenant_or_user_not_found"),
  );
  assert.ok(!JSON.stringify(diagnostic).includes(secret));
});
test("unknown fields, getters and circular error graphs cannot leak or break diagnostics", () => {
  const error = {
    code: secret,
    severity: secret,
    kind: secret,
    message: secret,
    cause: {},
  };
  error.cause = error;
  Object.defineProperty(error, "meta", {
    get() {
      throw new Error("must not run getter");
    },
  });
  const diagnostic = stagingDatabaseDiagnostic(error, staging)!;
  assert.deepEqual(diagnostic.reasonLabels, ["unclassified"]);
  assert.deepEqual(diagnostic.postgresCodes, []);
  assert.ok(!JSON.stringify(diagnostic).includes(secret));
});
test("only staging database-readiness capture adds diagnostics; ordinary and production logs stay safe", async () => {
  const originalTier = process.env.DEPLOYMENT_TIER;
  const originalProvider = process.env.MONITORING_PROVIDER;
  const originalConsole = console.error;
  const logs: string[] = [];
  console.error = (line: string) => {
    logs.push(line);
  };
  process.env.MONITORING_PROVIDER = "none";
  try {
    process.env.DEPLOYMENT_TIER = "staging";
    await captureError(
      "readiness",
      wrapped({ originalCode: "28P01" }),
      undefined,
      true,
    );
    await captureError("readiness", wrapped({ originalCode: "28P01" }));
    await captureError(
      "other",
      wrapped({ originalCode: "28P01" }),
      undefined,
      true,
    );
    process.env.DEPLOYMENT_TIER = "production";
    await captureError(
      "readiness",
      wrapped({ originalCode: "28P01" }),
      undefined,
      true,
    );
    assert.deepEqual(JSON.parse(logs[0]).databaseDiagnostic.postgresCodes, [
      "28P01",
    ]);
    for (const line of logs.slice(1))
      assert.equal(JSON.parse(line).databaseDiagnostic, undefined);
    assert.ok(!logs.join("").includes(secret));
  } finally {
    console.error = originalConsole;
    if (originalTier === undefined) delete process.env.DEPLOYMENT_TIER;
    else process.env.DEPLOYMENT_TIER = originalTier;
    if (originalProvider === undefined) delete process.env.MONITORING_PROVIDER;
    else process.env.MONITORING_PROVIDER = originalProvider;
  }
});
