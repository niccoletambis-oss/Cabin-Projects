import type { Environment } from "./environment";

// TEMPORARY: remove after the staging P2010 incident is diagnosed.
// Never serialize error objects or free-form text, even from Prisma metadata.
const driverCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ETIMEDOUT",
  "ENOTFOUND",
  "EAI_AGAIN",
  "EHOSTUNREACH",
  "ENETUNREACH",
  "ERR_TLS_CERT_ALTNAME_INVALID",
  "ERR_TLS_CERT_ALTNAME_FORMAT",
  "HOSTNAME_MISMATCH",
  "CERT_HAS_EXPIRED",
  "CERT_NOT_YET_VALID",
  "DEPTH_ZERO_SELF_SIGNED_CERT",
  "SELF_SIGNED_CERT_IN_CHAIN",
  "UNABLE_TO_GET_ISSUER_CERT",
  "UNABLE_TO_GET_ISSUER_CERT_LOCALLY",
  "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
  "CERT_SIGNATURE_FAILURE",
  "CERT_REVOKED",
  "INVALID_CA",
  "CERT_UNTRUSTED",
  "CERT_REJECTED",
]);
const kinds = new Set([
  "AuthenticationFailed",
  "DatabaseAccessDenied",
  "DatabaseDoesNotExist",
  "TlsConnectionError",
  "DatabaseNotReachable",
  "SocketTimeout",
  "ConnectionClosed",
  "TooManyConnections",
  "postgres",
  "RawDatabaseError",
]);
const reasons: ReadonlyArray<readonly [string, RegExp]> = [
  [
    "authentication_failed",
    /password authentication failed|authentication failed|SASL.*(?:password|authentication)|SCRAM.*(?:password|authentication)/i,
  ],
  ["pooler_tenant_or_user_not_found", /tenant or user not found/i],
  [
    "tls_hostname_verification_failed",
    /hostname.*(?:mismatch|does not match)|not in the cert(?:ificate)?[’']?s altnames|ERR_TLS_CERT_ALTNAME_INVALID/i,
  ],
  [
    "tls_certificate_verification_failed",
    /self.signed certificate|unable to verify.*certificate|unable to get.*issuer certificate|certificate (?:has expired|verify failed|is not yet valid)/i,
  ],
  ["tls_not_supported", /server does not support SSL/i],
  ["connection_refused", /ECONNREFUSED|connection refused/i],
  [
    "connection_timeout",
    /ETIMEDOUT|connection.*timed? ?out|timeout exceeded when trying to connect/i,
  ],
  ["dns_lookup_failed", /ENOTFOUND|EAI_AGAIN|getaddrinfo/i],
  [
    "connection_closed",
    /ECONNRESET|connection (?:terminated|closed) unexpectedly/i,
  ],
  [
    "pooler_prepared_statement_conflict",
    /prepared statement.*(?:already exists|does not exist)|prepared statements?.*(?:not supported|unsupported)/i,
  ],
  [
    "pooler_capacity_exceeded",
    /max client connections reached|maxclientsinsessionmode|remaining connection slots|too many (?:clients|connections)/i,
  ],
];
function field(value: object, key: string): unknown {
  // Ignore getters and arbitrary toJSON methods on unknown error objects.
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}
export function stagingDatabaseDiagnostic(
  error: unknown,
  env: Environment = process.env,
) {
  if (env.DEPLOYMENT_TIER !== "staging") return undefined;
  const prismaCodes = new Set<string>();
  const postgresCodes = new Set<string>();
  const transportCodes = new Set<string>();
  const adapterKinds = new Set<string>();
  const postgresSeverities = new Set<string>();
  const reasonLabels = new Set<string>();
  const seen = new Set<object>();
  function visit(value: unknown, depth: number) {
    if (
      !value ||
      typeof value !== "object" ||
      seen.has(value) ||
      depth > 6 ||
      seen.size >= 24
    )
      return;
    seen.add(value);
    for (const key of ["code", "originalCode", "sqlState"]) {
      const code = field(value, key);
      if (typeof code !== "string") continue;
      if (/^P[1-6]\d{3}$/.test(code)) prismaCodes.add(code);
      else if (/^(?:[0-5][0-9]|72|F0|HV|P0|XX)[0-9A-Z]{3}$/.test(code))
        postgresCodes.add(code);
      else if (driverCodes.has(code)) transportCodes.add(code);
    }
    const kind = field(value, "kind");
    if (typeof kind === "string" && kinds.has(kind)) adapterKinds.add(kind);
    const severity = field(value, "severity");
    if (
      typeof severity === "string" &&
      ["ERROR", "FATAL", "PANIC", "WARNING"].includes(severity)
    )
      postgresSeverities.add(severity);
    for (const key of ["message", "originalMessage", "reason"]) {
      const message = field(value, key);
      if (typeof message !== "string") continue;
      const bounded = message.slice(0, 8192);
      for (const [label, pattern] of reasons)
        if (pattern.test(bounded)) reasonLabels.add(label);
    }
    for (const key of ["meta", "driverAdapterError", "cause", "error"])
      visit(field(value, key), depth + 1);
  }
  visit(error, 0);
  for (const code of postgresCodes) {
    if (code.startsWith("28"))
      reasonLabels.add("authentication_or_access_denied");
    else if (code.startsWith("08")) reasonLabels.add("connection_failure");
    else if (code === "53300") reasonLabels.add("connection_capacity_exceeded");
    else reasonLabels.add("sql_execution_failure");
  }
  return {
    version: 1,
    probe: "readiness_select_1",
    prismaCodes: [...prismaCodes].sort(),
    postgresCodes: [...postgresCodes].sort(),
    transportCodes: [...transportCodes].sort(),
    adapterKinds: [...adapterKinds].sort(),
    postgresSeverities: [...postgresSeverities].sort(),
    reasonLabels: reasonLabels.size
      ? [...reasonLabels].sort()
      : ["unclassified"],
  };
}
