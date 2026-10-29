# Disaster recovery — operator checklist

Use the named private escalation roster. The Owner authorizes any traffic/data cutover; this runbook does not authorize automatic restore or destructive database changes. Keep request IDs, deployment digest, timestamps and redacted provider errors. Never paste credentials, reset/session tokens, guest details or full dumps into incident tickets.

## Database unavailable

1. Check live versus ready and the database provider status. Drain failing instances from traffic, preserve current DB/storage state, and tell staff updates may be unavailable. Do not keep retrying inventory/financial mutations blindly.
2. Inspect verified TLS/CA/hostname, credentials/rotation, network allowlist, connection pool exhaustion/provider limits, migration state, disk/CPU and safe error codes. Fix the actual cause; never disable certificate checks, loosen roles or reset schema to restore access.
3. After service recovery, confirm ready, read-only records and audit history. Check whether the original operation committed before retrying the same record. If recovery requires a backup, follow the separate-target procedure below.

## Object storage unavailable or evidence missing

1. Check private provider/KMS status, TLS, scoped credentials/expiry, region/bucket identity, permissions, version ID and cleanup backlog. Preserve metadata and logs; do not make the bucket public, overwrite a key or delete READY evidence.
2. Existing DB-backed legacy attachments may still be readable. Explain new upload/download failures to staff and defer dependent evidence actions until ready recovers. Parent transactions must not partially commit when upload staging fails.
3. For one missing file, Owner verifies record authorization/archive status and expected SHA/version. Restore the exact version from independent backups into an isolated bucket first. Validate size/hash and permission before any approved repair/cutover. A DB restore does not restore S3 bytes.

## Application unavailable

1. Check process health, startup validation errors, TLS ingress, resource limits and the last release/config change. Never bypass critical environment validation just to get a green probe.
2. Start a replacement with the verified image and private runtime secrets; allow traffic only after readiness. If the release is at fault, roll back to the prior compatible image/config and repeat health/static/role checks. Preserve the existing database and bucket.
3. Record impact and follow up on sanitized monitoring errors. Development localhost links are not externally reachable previews; publishing/port exposure requires a supported hosting/preview capability and explicit authorization.

## Admin locked out

1. Confirm canonical HTTPS URL and account spelling; generic login failures do not identify whether an account exists. Five failed logins lock for 15 minutes; further attempts during the lock do not extend it. Wait, request a fresh reset to the authorized inbox, or use another existing Admin if permitted.
2. If inbox access or all Admin sessions are unavailable, an authorized host/database operator uses the existing private `admin:recover` CLI with explicit Admin email/name, a 0600 unique password file and exact `ADMIN_RECOVERY_CONFIRM=RECOVER_ADMIN:<email>`. Never use a public setup route or default password.
3. Confirm sessions/reset tokens revoked, recovery audited and access restored. Remove the temporary password secret using the approved secret manager and investigate unexpected failures. Bootstrap refuses when an Admin exists; do not delete an account to bypass it.

## Password recovery unavailable

1. Keep the generic user response. Check safe delivery events/request IDs, SMTP service status, sender/DNS, TLS/CA, auth/relay, outbound policy and test inbox delivery. Never enable reset URL logging in production.
2. Restore mail service, request a new link and invalidate/ignore older links. Links last 30 minutes and are single-use; successful reset revokes sessions. Do not edit token expiry or store raw tokens to “help” a user.
3. If urgent Owner access is required, use the authorized offline Admin recovery procedure. Durable mail queuing is not implemented, so a process termination can lose an in-flight message; safely request a fresh link.

## Accidental or suspicious data modification

1. Stop repeated/suspect writes or isolate affected accounts with Owner authorization; preserve logs, snapshots and object versions. Identify actor, affected records, commit timing and scope using read-only queries/history.
2. Prefer supported attributable corrections: reverse via new stock/linen movements or the approved financial correction/review workflow. Do not edit immutable transactions or remove audit/financial history.
3. If corruption is broad, select a known good recovery point with the database/storage operators, estimate writes lost since that point and plan reconciliation. Restore and validate separate resources; obtain explicit Owner approval for any eventual cutover. Never blindly restore over the live database.

## Restore to a separate target

1. Freeze the candidate backup pair/key version and matching attachment versions. Verify independent/off-site copies and recovery operator access. Provision a **new empty isolated database** and isolated private bucket, not another DNS name for the live DB. Record verified resource identities; host-name comparison alone cannot detect aliases to the same cluster.
2. Use private tooling with compatible PostgreSQL 17 tools. Set source/direct connection, `BACKUP_KEY_FILE`, `BACKUP_PREFIX`, `RESTORE_TARGET_DATABASE_URL` and exact `RESTORE_CONFIRM=RESTORE_TO_EMPTY_DATABASE:<target name>`, then `npm run db:restore`. The helper authenticates encrypted manifest/dump before SQL, restores transactionally without --clean/--create, refuses nonempty targets and compares all snapshot row counts. Do not cut over after any failure.
3. Restore remote objects independently with provider tooling/backup identity. Validate every manifest object key/version/size/SHA; retain private access and encryption. Legacy/database file bytes are in the database dump. Do not point a rehearsal at the live bucket for destructive tests or overwrite referenced versions.
4. Configure a private isolated app instance with the restored resources. Verify migrations/status/drift and migration-owned CHECK constraints; login/Admin recovery/session revocation, all roles, stock and linen totals, duplicate receive/checkout protections, booking/inspection history, decimal expenses/charges/reports, Manila dates, CSV safety and representative legacy/S3 files. Confirm unsigned/unassigned access denied and health/alerts working.
5. Compare counts/hash manifests, record actual RPO/RTO and reconcile post-backup writes with the Owner. Obtain explicit approval and a rollback plan before switching traffic. Preserve previous resources and evidence; no automatic cutover is implemented.
6. Record restoration/security audit, rotate any compromised credentials, test backups/alerts again and conduct an incident review. Delete only explicitly approved disposable drill resources; never reset or remove the source database as cleanup.

Rehearse quarterly and after major changes. The local `test:recovery` script requires `RECOVERY_DRILL_CONFIRM=ISOLATED_LOCAL_DRILL`, refuses production mode and creates/drops only its own random local databases. It is evidence for helper safeguards, not proof that provider backups or a real bucket can be recovered.
