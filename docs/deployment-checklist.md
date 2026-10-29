# Deployment and launch checklist

**Current production decision: NO-GO.** Application checks can pass while real infrastructure remains unverified. Every required row needs dated evidence from the intended production/staging resources and an accountable approver. No public deployment is authorized by Phase 5.

| Required gate                                                                               | Current evidence                                                              | Status                              |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------- |
| Production database provisioned, isolated roles, verified TLS/pool sizing                   | Local PostgreSQL only                                                         | PENDING                             |
| Reviewed migrations applied, no pending migrations/drift                                    | Local 5 migrations verified; repeat on actual target                          | PENDING target                      |
| HTTPS/domain/certificate, correct APP_URL, trusted proxy and secure cookies                 | Local header/config regression; no chosen live domain                         | PENDING                             |
| Private bucket/identity, encryption, versioning and off-site replication                    | Local protocol/fault tests and real-provider harness                          | PENDING real provider               |
| SMTP sender and actual reset email delivery                                                 | Local token/HTTP/browser tests; no configured SMTP                            | PENDING inbox proof                 |
| Unique Admin securely bootstrapped, recovery tested                                         | Isolated CLI drill; repeat for real target                                    | PENDING target                      |
| Demo accounts disabled and no demo/test guest data                                          | Seed guards; production:check must run on target                              | PENDING target review               |
| Encrypted database plus attachment backups completed off-site                               | Isolated local encrypted restore drill                                        | PENDING scheduled/off-site evidence |
| Restore drill in separate DB/bucket with counts/hashes and measured RPO/RTO                 | Local rehearsal; no provider bucket recovery                                  | PENDING real drill                  |
| Monitoring, readiness probes and alerts delivered                                           | Local safe events/outage tests; collector not provisioned                     | PENDING alert proof                 |
| Mobile/Owner/Manager/Caretaker workflows and reports accepted                               | Repository automation; human staging sign-off needed                          | PENDING staging sign-off            |
| No critical test failures; accessibility/manual review and accepted limitations             | See phase5-verification.md; manual assistive-device review outstanding        | PENDING human review                |
| Container image acceptance and production-mode integration                                  | See phase5-verification.md; local image checks do not prove real integrations | PENDING deployment integration      |
| Rollback plan, operator roster, retention, change window and explicit Owner launch approval | Runbooks prepared                                                             | PENDING approval                    |

A missing gate is NO-GO. Never auto-populate GO from a passing preflight/harness. Record the final commit and immutable image digest in the release ticket, with no secrets or guest records attached.

## Private release preparation

1. Select Node 24 LTS, maintained PostgreSQL 17-compatible service and a Node/container host. Provision separate staging and production identities/databases/buckets. Inject all variables from [.env.example](../.env.example) through the secret manager. Never use `APP_ENV=development` to bypass validation in actual staging/production.
2. From a private tooling checkout: `npm ci`, `npm run db:generate`, lint, typecheck, tests and `npm run build`. Build the image with `docker build -t cabin-operations:<release> .`. In this managed cloud use both `--secret id=proxy_ca,src="$CODEX_PROXY_CERT"` and `--secret id=system_ca,src=/etc/ssl/certs/ca-certificates.crt`; keep proxy/TLS validation. Build uses no real database credentials and no database reset.
3. Inspect the image user, filesystem and config for secret leakage; run `npm run test:docker` with the explicit isolated local settings below. It binds only loopback. Container application image has no release CLI tools; run Prisma/admin/backup from a separate private tooling job.
4. Complete [staging acceptance](staging-checklist.md), including real SMTP/S3/Postgres TLS. Review migration SQL and take a verified pre-release backup; deploy migrations once using `npm run db:deploy` with a direct migration connection. Never run migrate reset or destructive push.
5. Verify `npx prisma validate`, `npx prisma migrate status` and `npx prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`. Preserve migration-owned SQL CHECK constraints; Prisma schema diff does not model them. Phase 5 introduces no schema migration.
6. Secure Admin bootstrap/recovery and no-demo production seed are in [Phase 4 operations](production-readiness.md). Never seed demo accounts/data into the release database. Run `npm run production:check`; inspect any existing imported data separately.
7. Configure private app port 3000 behind canonical HTTPS ingress, HTTP redirect, overwritten client-IP header, no staff response caching, 3 MB body cap and stricter public endpoint limits. DNS/certificates must be correct before live traffic. Verify live/ready, static assets, CSP/HSTS, cookie/origin handling and all role checks on the real domain.
8. Confirm backups, private object restore, alerts, retention and break-glass access. Freeze the release artifact; obtain explicit launch approval. **Stop here until launch is authorized.**

## Reproducible local Docker acceptance

```sh
# Use the existing isolated local Compose network/database, never production.
DOCKER_ACCEPTANCE_NETWORK=cabin-projects_default \
DOCKER_ACCEPTANCE_DB_HOST=db \
DOCKER_ACCEPTANCE_IMAGE=cabin-operations:phase5 \
DOCKER_ACCEPTANCE_PORT=3004 npm run test:docker
```

This script checks non-root execution, absence of embedded runtime credential environment variables/root .env files, startup refusal without critical production config, local liveness/readiness and static assets. It creates/removes only its random test containers and passes database credentials via environment, not CLI values. The positive image test uses **development integration configuration with the production Node artifact** because real provider credentials are unavailable; it does not certify full production-mode TLS/S3/SMTP acceptance. For real staging run the same image with private secret injection, `APP_ENV=production`, an isolated TLS DB/private bucket/SMTP and HTTPS ingress; check ready, login/assets/reset delivery and shutdown/restart recovery. Never put real secrets in build args or image layers. Production image runs uid 1001.

## Launch window — only after explicit authorization

- [ ] Snapshot/backup and restore point recorded; object-version retention aligned; rollback release ready.
- [ ] Single migration job succeeds; rollout pins approved image digest and runtime secrets.
- [ ] Readiness passes before routing traffic; smoke login/logout, stock, bookings, expense/report and attachment access without using real guest data as disposable fixtures.
- [ ] Verify actual Owner, Manager and Caretaker access from phones; monitoring receives an intentional safe test alert.
- [ ] Observe errors/latency/connections/login locks/cleanup backlog; named operator owns the observation window and support communication.

## Rollback

Remove traffic from an unhealthy new instance; keep existing database/object data. Roll back to a compatible previously verified image/configuration. Phase 5 changes are additive UI/query/tooling changes with no schema change; do not undo old migrations or reset the database. Verify compatibility and health/permissions after rollback. If data was modified, preserve evidence and use [the recovery runbook](disaster-recovery.md): restore to **separate** targets, reconcile writes and obtain explicit cutover approval. Never automatically overwrite production with a backup or delete referenced objects. Record the incident and new release decision.
