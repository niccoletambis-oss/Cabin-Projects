# Temporary staging readiness database diagnostic

Purpose: investigate Render/Supabase Session Pooler readiness `P2010` failures.
No connection settings, queries, SSL checks, permissions or data are changed.
The existing `SELECT 1` remains the probe and the public 503 response contains
only status and requestId. Storage failures do not receive database diagnostics.

## Activation and output

The existing readiness error event gains `databaseDiagnostic` only when
`DEPLOYMENT_TIER` equals `staging` and the database query failed. Production and
all ordinary error events retain their current logging behavior. Configure this
non-secret deployment marker in Render staging if it is not already present.
Do not enable it on production. No credential/configuration values are emitted.

The nested object contains exactly:

- `version`: fixed `1`.
- `probe`: fixed `readiness_select_1`.
- `prismaCodes`: Prisma-format codes such as `P2010`.
- `postgresCodes`: SQLSTATE-format codes such as `28P01`, `XX000`, `42P05`.
- `transportCodes`: explicitly allowlisted Node socket/TLS codes.
- `adapterKinds`: explicitly allowlisted Prisma driver-adapter classifications.
- `postgresSeverities`: only `ERROR`, `FATAL`, `PANIC`, `WARNING`.
- `reasonLabels`: fixed classifications matched against bounded internal text;
  raw text is always discarded. Unknown failures produce `unclassified`.

Known nested `meta`, `driverAdapterError`, `cause` and `error` objects are
inspected with depth/node limits and cycle detection. Getters and serialization
hooks are ignored. No arbitrary metadata keys, messages, reason strings, stack
traces, query text, usernames, hosts, certificates, connection strings, customer
records or environment values are added to logs. The existing event envelope
(timestamp, severity, requestId, context, errorType, code, stack fingerprint)
remains unchanged. Configured monitoring receives the same safe event.

## Interpreting evidence

- `28P01` / authentication labels: authentication failure; do not disclose user or password.
- TLS transport codes / certificate labels: chain/trust/expiry issues; keep verified TLS enabled.
- Hostname label or `ERR_TLS_CERT_ALTNAME_INVALID`: certificate name mismatch.
- Socket codes / timeout, DNS or closed labels: transport/connectivity failure.
- Pooler tenant/user, prepared-statement or capacity labels: evidence to inspect
  pooler configuration/capacity; these labels alone do not prove incompatibility.
- Other SQLSTATE codes: inspect the documented meaning of that code. `XX000` is
  an internal error, not proof of a specific cause.
- Empty code arrays and `unclassified`: no recognized metadata survived wrapping;
  do not enable raw error logging. Extend only allowlisted classifications after
  reviewing the actual driver error shape securely.

Do not make speculative infrastructure changes based on `P2010` alone. Correlate
safe events by requestId, observe the first database-specific metadata after the
staging redeploy, and diagnose before proposing a separate fix.

## Removal

After diagnosis, remove the readiness `databaseReady` marker and fourth
`captureError` argument; remove the diagnostic import/type/branch/parameter in
`observability.ts`; delete `staging-database-diagnostic.ts` and its dedicated test
file. Remove this incident document or retain it as historical evidence with the
incident resolution. Rerun lint, typecheck, tests and build. Unsetting the staging
tier marker immediately disables extra diagnostic output, but permanent removal
should be a follow-up commit. Never switch staging to development to bypass TLS.

## Local verification

Lint and TypeScript checks passed. The full unit/database suite passed all 68
checks, including seven diagnostic gating/redaction/error-shape regressions.
The initial integration attempt found the local PostgreSQL container stopped;
starting that existing container resolved the failures without a reset or schema
change. Tests use their own synthetic fixtures; no Render/Supabase data was used.
The optimized production build and standalone preparation passed. No underlying
Render/Supabase cause is established until the staging diagnostic is observed.
