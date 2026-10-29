# Phase 5 verification and launch readiness

**Production launch: NO-GO until real infrastructure acceptance is completed.** Phase 5 is preparation, not deployment. See the itemized [launch gates](deployment-checklist.md) and [staging acceptance procedure](staging-checklist.md). No public deployment, scheduler installation or database reset is part of this work.

## Changes reviewed

- Shared cabin visual style retained; darker readable muted/status/identity text, visible keyboard focus, mobile 44px quick actions, 16px phone inputs, wrapping controls and resilient long-text cards. Add booking/expense buttons remain reachable on phones.
- Descriptive page titles, current-page navigation, skip-to-main link, accessible native mobile navigation dialog with focus containment/Escape/return focus, status messages associated with forms, error-summary focus and explicit confirmations for selected irreversible actions.
- Named tables/column headers, keyboard-focusable scrolling reports, reduced-motion support and printable reports. Status labels remain textual; cancelled/unknown states do not imply success through a green badge.
- Fifty-record scoped history pages for bookings, inspections, expenses, purchases, audits, damage, charges, linen, stock transactions and activity. Stable date/ID ordering, bounded page parsing and lookahead avoid false next-page links. Inventory renders 50 matching items at a time; supplier previews are bounded and link to full supplier-filtered purchase history; report booking choices are bounded/searchable.
- Monthly expense summaries use PostgreSQL decimal aggregation over the complete authorized Manila month, independently of page size. Next-month records are excluded from the dashboard's monthly approved total. Test coverage includes more than one history page, 0.10 additions, other-Caretaker scope and leap-day/midnight boundaries.
- Node-specific request logging is isolated from Edge instrumentation, fixing the development Webpack dependency error without removing error monitoring. The standalone runtime now explicitly validates configuration before importing the server: the container review found Next could otherwise log instrumentation validation errors but keep the process alive. Negative tests require a genuine exit, not a timeout/externally stopped process.
- Docker build copies the Prisma config's pure source dependencies and installs OpenSSL/CA certificates with verified proxy trust. No real credentials are used at build time.
- New private operator tools: staging HTTPS/header/readiness preflight, real S3-compatible canary with integrity/encryption/version/unsigned-denial/deletion checks, local Docker artifact acceptance, and convenient commands for existing outage/recovery drills. Staging tools refuse unconfirmed/non-staging targets and never report GO.

No business authorization/financial state machine, existing migration, session/reset/rate/CSRF/CSP/storage protection or stored history was removed. Phase 5 requires no schema migration/index. Test fixtures are synthetic and cleaned by their own user/record IDs; recovery drills remove only their own random databases.

## Check results

Verified on 29 October 2026 with Node 24.19.0, PostgreSQL 17 and Prisma 7.10.1. Passing local artifact checks do not establish real provider readiness.

| Check                                             | Result                                                                                                                                          |
| ------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`                                    | PASS                                                                                                                                            |
| `npm run typecheck`                               | PASS                                                                                                                                            |
| `npm test`                                        | PASS — 61 unit/database/protocol tests                                                                                                          |
| `npm run build`                                   | PASS — standalone artifact, compiled shared environment validator and pre-server runtime entry                                                  |
| `npm run test:smoke`                              | PASS — all three suites, preserving Phase 1–4 behavior                                                                                          |
| `npm run test:e2e`                                | PASS — all 9 browser scenarios; Pixel 7 roles/workflows plus a real desktop context for keyboard checks                                         |
| Standard Prisma validate / migrate status / drift | PASS — valid schema, all 5 migrations applied, no drift; no Phase 5 schema change                                                               |
| Production Docker build and `test:docker`         | PASS — image built; non-root, no embedded runtime credentials/root env files, health/static assets and genuine pre-listen configuration refusal |
| `test:operations`                                 | PASS — safe 503 during isolated DB outage, liveness healthy, invalid config exits by itself before serving                                      |
| Explicit isolated `test:recovery`                 | PASS — 32 tables, one attachment SHA, corrupted/unsafe overwrite refusal, secure Admin bootstrap/recovery, disposable targets cleaned           |
| Standard development startup                      | PASS — `npm run dev -- --port 3000`; `/login` returns 200 with Webpack, no prior Node/Edge bundler failure; left running locally                |
| Real staging S3/SMTP/HTTPS/Postgres/monitoring    | NOT CONFIGURED / UNVERIFIED; blocked launch gates                                                                                               |

Local verified image ID: `sha256:9029fbfd7d4c1fd3aa06e1d774d9e4699d18be4a9653cb96b9eb32e3abba3053` (`cabin-operations:phase5`, Linux/amd64). No image was pushed publicly. Docker positive integration used existing local development resources with the production Node artifact; real production-mode TLS/S3/SMTP integration is still a pending launch gate.

## Coverage and review map

| Area                                                                    | Automated evidence / review                                                                                                                                                                                               |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner/Manager/Caretaker roles                                           | Existing permission matrix, service and forged-action HTTP tests; new role-page accessibility/navigation and denied-route checks                                                                                          |
| Zero/low stock, archived records, duplicate receive, concurrent stock   | Inventory/Phase 2 service, HTTP and mobile regression tests                                                                                                                                                               |
| Duplicate checkout/charge, cancelled stays, scoped inspections          | Phase 3 lifecycle/HTTP/mobile tests; new cancel-confirmation test verifies dismiss causes no mutation                                                                                                                     |
| Concurrent linen and immutable audits/expenses/charges                  | Phase 2–3 transactional integration suites; prior protections preserved                                                                                                                                                   |
| Reset expiry/single use/reissue, sessions, throttling and lockout       | Phase 4 token/concurrency/HTTP/mobile/security suites                                                                                                                                                                     |
| Evidence permissions/type/size/path, missing files/outages, legacy URLs | Phase 3–4 service/HTTP tests, protocol adapter and Phase 5 canary contract; real-provider checklist remains pending                                                                                                       |
| Manila dates/decimal money/Unicode/CSV formulas/print                   | Existing financial/14-report and date-boundary regressions plus Phase 5 full-month aggregation and Unicode filename tests; print CSS reviewed                                                                             |
| Accessibility and mobile layout                                         | Axe WCAG A/AA checks on representative role/public/menu/inventory-dialog states; horizontal overflow, native dialog focus/Escape and keyboard skip/report scrolling checks; manual assistive-device review still required |
| Configuration/CSP/HSTS/CSRF/seeds/admin/backup                          | Phase 4 regression suite, actual local outage/startup refusal and isolated encrypted recovery drill; strengthened runtime/Docker acceptance                                                                               |
| Performance                                                             | Bounded historical queries, complete decimal summaries, bounded previews and rendered inventory; current catalog/active queues deliberately complete; no real load-test claim                                             |

The 14 existing operational report types remain unchanged. Bookings, stock transactions and Admin activity are separate scoped history views; operational summary remains `/reports`. This phase does not claim new CSV exports for those views. All supported exports retain their authorization, 5,000-row limit, formula safety, UTF-8 behavior, decimal arithmetic and documented ISO UTC/Manila date semantics.

## Unverified launch gates and known limitations

No real staging/production credentials or infrastructure are configured in this cloud session. Actual verified Postgres TLS/pooling, separate resource identity, bucket policy/KMS/version backups, delivered SMTP reset email, real HTTPS/domain/proxy/cookies, off-site backup schedule/retention, restored bucket, delivered monitoring alert, support roster and Owner acceptance must be evidenced before GO. Full production-mode image integration requires those real dependencies; local artifact tests use isolated development integration settings with the production Node build.

Manual screen-reader, real-phone camera/picker, iOS Safari and zoom checks remain staging acceptance tasks; automated axe is not a complete accessibility certification. MFA activation, durable mail/monitoring queues, antivirus/full PDF content disarm, large-database streaming backup enhancements, formal anonymization and immutable external audit replication remain the explicitly documented Phase 4 limitations. No scheduler is installed. No network draft/policy change or publication is required for the local work; provider-specific connectivity may need configuration when services are chosen.

Upstream build/test notices may include inherited FORCE_COLOR/NO_COLOR, deprecated ESLint 9 maintenance notice and npm lifecycle review/update notices. They are distinct from failed checks; do not perform unreviewed framework/toolchain upgrades just to silence them. No production runtime secrets belong in build layers/logs, acceptance reports or screenshots.
