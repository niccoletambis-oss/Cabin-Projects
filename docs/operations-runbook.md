# Operations runbook

Keep the named Owner, on-call operator, database/storage/mail provider support contacts and escalation path in a private team directory. Never store credentials in this runbook or tickets. Routine business operations use the app's role checks; database/hosting access belongs to designated operators.

## Each day

1. Check `/api/health/live` (process) and `/api/health/ready` or `/api/health` (database + storage). Expected status is 200 with a safe JSON status. Readiness failures must stop new traffic; a healthy process alone does not establish dependency health.
2. Review sanitized application errors, failed login/temporary locks, missing reset deliveries, storage cleanup backlog and provider alerts. Correlate the request ID, deployment/image digest and timestamp without copying cookies, reset tokens, full URLs/query strings, guest records or financial details into monitoring.
3. Owner/Manager reviews pending damage, inspections, expenses, charges, purchases and audits. Caretaker sees only assigned/own work. Receiving/checkout/charge/audit retries must use the same record: do not recreate financial/inventory records merely because a response was lost. Inspect history first.
4. Verify last successful encrypted database backup, attachment backup/replication and off-site copy. A successful job exit without a restorable artifact/manifest/key and object versions is insufficient.

## Backup schedule recommendation — not installed

This Phase 5 baseline supersedes the shorter illustrative daily retention in the Phase 4 guide. Agree actual legal/cost requirements and legal holds with the Owner before implementation.

| Job                                               | Proposed schedule                                   | Retention/evidence                                                                                      |
| ------------------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Encrypted full DB backup + authenticated manifest | Daily during low traffic, e.g. 02:00 Asia/Manila    | 30 rolling daily copies; record completion, size, encryption key version and off-site receipt           |
| Private attachment snapshot/replication           | Daily, with continuous versioning where supported   | Retain referenced object versions at least as long as every retained database backup and any legal hold |
| Long-term encrypted DB + attachment recovery set  | Monthly                                             | Suggested 12 monthly copies, adjusted to approved legal/financial retention                             |
| Managed PostgreSQL WAL/PITR                       | Continuous if available                             | Target RPO 15 minutes, provider policy and monitored backup lag                                         |
| Full restore rehearsal                            | Quarterly and after schema/storage/recovery changes | Separate DB/bucket; record counts, SHA hashes, roles, duration and Owner review; target RTO 4 hours     |

No scheduler, cloud job, retention deletion rule or bucket lifecycle was configured by this phase. An authorized operator must configure a private scheduled job running `npm run db:backup` with secret-manager-injected source access, `BACKUP_DIRECTORY` and a separate private `BACKUP_KEY_FILE`. Keep files/manifest encrypted, private directory 0700/files 0600, and keys recoverable separately with a second authorized operator. Copy the encrypted pair and independently versioned attachment backup to a separate account/provider with deletion protection. Alert if any component is stale over its agreed interval, missing, undecryptable or fails verification. Do not expire evidence while a retained DB backup can reference it. Application archive is not physical object deletion.

See [Phase 4 backup details](production-readiness.md#backup-and-restore) and [disaster recovery](disaster-recovery.md) before running any restore. Test large-database operator memory requirements: the existing manifest/hash helper reads encrypted dump bytes in memory; use provider encrypted snapshots/PITR or extend streaming before exceeding available resources.

## Routine security and maintenance

- Rotate DB/object/SMTP/monitoring keys through the secret manager, scoped to their purpose. Keep `SECURITY_HASH_KEY` shared across instances for consistent throttling; never expose it to browser code. Keep staging identities independent.
- Use the private maintenance CLI only with explicit `MAINTENANCE_CONFIRM=EXPIRED_SECURITY_AND_UNLINKED_FILES`. It cleans expired security state and unlinked staged/failed uploads, not operational/financial/audit history or READY/ARCHIVED evidence. Review failed cleanup before privileged manual object-version reconciliation.
- Owners review staff access and inactive accounts, closed-stay privacy archive/legal holds, sensitive evidence and retention. Do not store card numbers/IDs or unnecessary guest details. Archive is reversible; formal anonymization and automatic personal-data deletion are not implemented.
- MFA activation is deferred and fails closed. Do not set an unsupported MFA mode or claim protection is enabled. Restrict Admin/operator access, use unique strong passwords and test the offline recovery path.
- Update dependencies/images through a reviewed release, rerun tests and staging acceptance, and record any accepted upstream warnings. Never perform blind upgrades/reset data during an incident.

## Quick incident triage

| Symptom                           | First checks                                                                         | Escalation                                                   |
| --------------------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------ |
| Live fails                        | Process, image/startup config, memory, private ingress                               | Application operator; roll back compatible image if needed   |
| Live passes, ready fails          | Database/TLS/pool and private bucket/IAM/KMS health                                  | Dependency owner; do not bypass validation or widen access   |
| Staff cannot sign in              | Generic 429/temporary lock, canonical Origin, proxy IP/header, account active status | Owner; wait lock interval or explicit CLI recovery           |
| Reset not delivered               | SMTP sender/TLS/auth, provider/outbound policy, safe delivery event                  | Mail operator; new reset request after service recovery      |
| File missing/unavailable          | Parent permission, archive/state, version/hash, provider health                      | Owner/storage operator; never make the bucket public         |
| Possible bad stock/expense/charge | Stop repeated mutations; inspect attributable history                                | Owner/Manager correction workflow; preserve accounting audit |

Detailed safe response steps are in [disaster-recovery.md](disaster-recovery.md). Communicate impact and timestamps without secrets; record remediation and the next GO/NO-GO decision.

## Reports and periodic review

The existing 14 operational CSV/print report types cover room inventory/discrepancies, linen balances/movements, check-in/out inspections, damage/missing, guest charges, expenses/monthly expense summaries, inventory valuation/low stock, purchases and audits. Bookings, stock transactions and Admin activity are separate role-scoped pageable views; this phase does not invent new CSV exports for those views. `/reports` supplies the operational summary. Caretakers cannot fetch financial exports; activity remains Admin-only. Date-time filters/month grouping use Manila boundaries; export timestamps retain documented ISO UTC, booking date-only fields retain their calendar dates. CSV formula escaping, UTF-8/BOM support and decimal arithmetic remain covered by regression tests. Use browser Print on the printable report view; navigation/controls are excluded.

Histories now fetch at most 51 rows to show 50 and detect a next page. Existing current inventory/room/linen balance catalogs and active stay queues remain complete because truncating them would misstate totals or remove operational choices. Inventory rendering loads 50 matching cards/rows at a time while searching the complete current catalog. Supplier previews show ten requests with a link to full filtered history; report booking choices are limited to 100 searchable matches with the selected record preserved. Reports retain the 5,000-row guard and ask for narrower filters. No new indexes/migrations were justified by the local dataset. Measure real volume/query plans before further optimization; no production load benchmark is claimed.
