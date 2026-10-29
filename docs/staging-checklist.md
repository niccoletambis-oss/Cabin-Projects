# Staging acceptance — Phase 5

**Current status: NOT EXECUTED on real staging infrastructure.** Local automated results do not certify a provider or authorize launch. Record the tested commit, image digest, date, operator, isolated database/bucket identifiers, redacted evidence and approver for each item. Never attach passwords, session/reset tokens, connection strings or guest data to an acceptance record.

## Provision and isolate

- [ ] Create a separate staging PostgreSQL database/roles, private bucket, sender/test mailbox and secret-manager bindings. Verify their actual provider account/resource identities differ from production; names or environment labels alone are not proof.
- [ ] Use Node 24 LTS and `APP_ENV=production` in staging to exercise real production validation. `DEPLOYMENT_TIER=staging` is an operator-tool guard, not a way to bypass production validation. Populate all required variables in [the environment example](../.env.example) and [Phase 4 guide](production-readiness.md).
- [ ] Configure a dedicated staging HTTPS domain, certificate and canonical `APP_URL`. Redirect HTTP to HTTPS. Keep Node/Postgres/private object ports inaccessible from the public Internet.
- [ ] The only ingress strips client IP headers, overwrites `TRUSTED_CLIENT_IP_HEADER`, preserves canonical Host, limits bodies/requests, avoids caching staff responses and redacts query strings/cookies/bodies from logs. Verify HSTS, nonce CSP, Secure/HttpOnly/SameSite cookies and no cross-origin/null-Origin mutations.
- [ ] Configure verified database TLS and the right CA; never accept invalid certificates. Size total app pools below provider limits and use a direct migration URL. Review SQL, take a backup, `npm run db:deploy`, then check migration status/drift. Never reset or push a destructive schema.
- [ ] Bootstrap one named staging Admin through the secure CLI, with a private password file. Create separate synthetic staff accounts and synthetic operational records. Never reuse production credentials/guest data. Production launch later needs a separate fresh Admin and no demo accounts/data.

## Repeatable automated probes

Use a private tooling checkout with `npm ci`, scoped **staging** credentials, CA trust and the exact staging origin in `STAGING_ACCEPTANCE_CONFIRM`. Both commands refuse unless `APP_ENV=production`, `DEPLOYMENT_TIER=staging` and confirmation equals `APP_URL`'s origin. They never report production GO.

```sh
npm run staging:preflight
npm run staging:storage
```

Preflight performs read-only HTTPS health/header/login/recovery-page checks through the configured proxy. The storage canary writes only a random `evidence/acceptance-<uuid>` object, validates signed upload/download SHA-256, MIME/size, encryption response, version ID and an unsigned GET denial, then deletes that exact canary/version in a finally block and verifies a 404 after deletion. It needs HeadBucket, Put/Get/HeadObject, DeleteObject/DeleteObjectVersion permissions on its prefix. It never creates database rows or changes existing attachments. A failure is a failed acceptance gate; use a privileged operator to reconcile any orphaned acceptance object after an ambiguous PUT/network/delete failure. Do not broaden ordinary app credentials just to bypass a provider restriction; document the required scoped identity or unresolved gate.

The baseline requires versioning. If the provider does not return S3-compatible encryption/version metadata, record equivalent independent provider evidence and an explicit Owner exception; do not edit the harness to pretend these checks passed. Its unsigned denial is a useful probe, not a full IAM audit: independently confirm all public ACL/policy paths are blocked. Run it only against the independently verified staging bucket, never production.

## Private storage acceptance

- [ ] Run the real canary with the deployment's intended identity. Confirm private ACL/policy, TLS-only access, encryption/KMS permissions, versioning, independent replication/backups and retention. Verify actual provider settings, not just SDK responses.
- [ ] Through the app, attach a JPEG/PNG/WebP to a synthetic inspection/damage/room record and a PDF receipt to a synthetic expense/purchase. Confirm original filename metadata, normalized image MIME, removal of EXIF, 2 MB limit and integrity. Test Unicode filename, quotes, malformed image, executable, traversal, oversized file and interactive PDF rejection.
- [ ] Download as permitted staff. Another Caretaker must not access unassigned-room/other-expense evidence; anonymous app downloads must be 401. Unsigned provider URLs must not return file bytes. Do not expose object keys or credentials in browser bundles.
- [ ] Owner archive/restore: use eligible synthetic evidence on an inactive room or cancelled stay. Confirm password confirmation, hidden archived bytes, retained data and audit. Attempt to archive reviewed financial/completed-inspection/damage evidence: must refuse. Never delete historical evidence for a test.
- [ ] Restricted identity/prefix: deliberately deny canary upload in an isolated staging copy and verify friendly failure, no parent/financial/stock partial commit, staged/failed metadata and cleanup backlog. Simulate storage outage in that copy, not by revoking access to real records; verify safe 503/retry and recovery.
- [ ] Verify legacy attachment URLs and a representative separately restored object version. Database backup alone is insufficient for S3 files.

## SMTP and password recovery acceptance

No real SMTP credentials are configured in the current workspace. **Delivery is unverified.** Use any TLS/STARTTLS-capable provider or trusted test SMTP with a real inbox; no paid provider is required.

- [ ] Configure `EMAIL_PROVIDER=smtp`, SMTP host/465 or 587/sender and auth pair or explicit trusted relay, CA if needed, verified sender/SPF/DKIM/DMARC, separate staging credentials and outbound access. Keep `DEV_RESET_LOG=false` and server/provider debug logging disabled.
- [ ] In a browser, request forgot-password for a dedicated synthetic active account and a nonexistent address. Confirm identical generic response/redirect and no token/address existence disclosures. Observe successful delivery in the **actual inbox**; a connection check alone is not delivery evidence.
- [ ] Confirm the email link uses the exact staging HTTPS origin, never localhost. Tokens must not appear in application/ingress/APM logs or referrer paths/query strings.
- [ ] Open two sessions, complete reset, confirm old sessions are rejected and the password works. Reuse the same token concurrently/sequentially: one success only. Reissue invalidates the earlier link.
- [ ] Wait over 30 minutes for one test token to expire (or use an isolated synthetic database fixture, never edit a live token). Confirm expired/invalid/used links fail safely without changing password/sessions.
- [ ] Exercise configured reset/login throttles, clean 429/Retry-After, five-failure 15-minute account lockout and automatic/offline Admin recovery. Do not stress normal staff accounts. Run `npm test` for deterministic timing/concurrency regressions.
- [ ] Simulate mail unavailability only in a staging copy. Response remains generic, safe monitoring records the delivery failure and a later fresh request recovers. Delivery is best-effort; there is no durable mail queue.

## People, workflow, reports and accessibility

- [ ] Owner: users/roles/deactivation, inventory, suppliers, one-time purchase approval/receiving, charge approval, expense review, all reports, storage, logs and recovery.
- [ ] Manager: inventory/suppliers, bookings and assigned room inspections, damage/charge review, expenses and reports. Server must deny users/Admin-only approvals even if a forged request is sent.
- [ ] Caretaker on a phone: stock in/out, linen movement, arrivals/departures, damage/missing evidence, expense submission and assigned audit. Deny other-room/private-finance/user management access server-side.
- [ ] Check zero/low stock, archived records, cancellation, duplicate receive/checkout/charge, concurrent linen/stock, long notes/Unicode names, missing files, outages, Manila midnight/month/year/leap-day boundaries, decimal totals, UTF-8/CSV formulas and print views. [Verification evidence](phase5-verification.md) maps existing automated coverage.
- [ ] Run all repository checks on synthetic staging data: lint, typecheck, unit/DB, build, three HTTP suites and Pixel 7 tests. Automated axe tests cover WCAG A/AA rules on representative role pages, menus, inventory dialog and public recovery forms. Also manually test keyboard-only operation, screen-reader announcements, 200%/400% zoom, iOS Safari, Android TalkBack/VoiceOver and real photo picker/camera. Axe is not a complete accessibility certification.
- [ ] Verify histories paginate with authorized scope preserved and monthly totals remain complete. Large reports must require narrower filters instead of silent truncation. Check realistic volume/latency, CPU/memory/connections; local tests are not a production load benchmark.

## Final staging evidence

- [ ] Image non-root/secrets/static assets/startup checks; real TLS DB/S3/SMTP integration.
- [ ] Daily database **and attachment** backups copied off-site; restore into separate targets, verify counts/hashes/history/permissions and measure RPO/RTO. No auto-cutover.
- [ ] Monitoring alert actually delivered to designated operators; owner/support contacts and escalation roster approved.
- [ ] Complete [deployment GO/NO-GO](deployment-checklist.md), with evidence and explicit authorized launch approval. Nothing in these scripts publishes the app or installs a scheduler.
