# Cabin Bed & Breakfast Inventory

A mobile-first operations workspace built on the existing Phase 1 inventory foundation. Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 17, Prisma 7.10.1 and the PostgreSQL driver adapter. Requires Node.js 22.12+ or 24+ and Docker Compose for the default local database.

## Start development

```sh
# Only if .env does not already exist:
cp .env.example .env
npm ci
docker compose up -d --wait db
npm run db:deploy
npm run db:seed                      # optional sample inventory; preserves existing stock
ALLOW_DEMO_ACCOUNTS=true npm run db:seed:dev  # explicit development-only accounts
npm run dev
```

The server binds to loopback on port 3000. Sign in at `/login`. For a production-mode local check, run `npm run build` then `npm run start`. Use the existing checkout at `/workspace/Cabin-Projects`; cloud tasks are isolated and do not require worktrees. Keep `.env` private. Local database credentials in `.env.example` and Compose are **development-only**. An external PostgreSQL database can be selected with a securely configured `DATABASE_URL`.

## Temporary development accounts

These accounts are created only by the explicitly enabled development seed. The script refuses to run with `NODE_ENV=production`, never overwrites existing accounts/passwords, and does not reset inventory. They are available in the current development database.

| Role          | Email                       | Temporary password  |
| ------------- | --------------------------- | ------------------- |
| Owner / Admin | owner@cabin.example         | CabinOwner2026!     |
| Manager       | manager@cabin.example       | CabinManager2026!   |
| Caretaker     | caretaker.dev@cabin.example | CabinCaretaker2026! |

**Never use these accounts or passwords in production.** The original Phase 1 sample user `caretaker@cabin.example` is preserved but has no password until an Admin resets it. Create named personal accounts, reset their temporary passwords through Settings, and deactivate demo accounts before a real deployment.

## Permissions and session security

Permissions are checked in request guards, server-rendered pages and mutation services. Hiding navigation is an additional convenience, not the authorization boundary. No role or actor ID is trusted from the browser.

| Capability                                                                            | Admin / Owner | Manager | Caretaker |
| ------------------------------------------------------------------------------------- | ------------- | ------- | --------- |
| View inventory; stock in/out; report issues; inventory checks                         | Yes           | Yes     | Yes       |
| Add/edit inventory; manage suppliers; create/receive purchases; review reports/audits | Yes           | Yes     | No        |
| View costs, activity history, operational summaries                                   | Yes           | Yes     | No        |
| Approve purchase requests; manage users                                               | Yes           | No      | No        |

Caretakers can complete their own/assigned audits. Managers can assign checks to active users. Cost fields and purchase/activity routes are omitted or denied server-side for Caretakers, including React Server Component payloads. All mutations record the authenticated actor. Opening seed transactions retain their legacy attribution.

Passwords use salted scrypt (`N=32768, r=8, p=3`, 64-byte keys) and timing-safe comparison. Sessions use cryptographically random 256-bit opaque tokens; only SHA-256 token hashes are stored in PostgreSQL. Sessions expire after eight hours. Cookies are HttpOnly, SameSite=Lax and Secure for HTTPS origins. Login failure messages do not disclose account existence. Five failed attempts lock the account for 15 minutes. User changes and password resets revoke all sessions; self-service password changes require the current password. Admin changes cannot deactivate/demote the acting Admin or remove the last active Admin.

Login and logout accept same-origin POST requests only; Next.js also protects server actions against cross-origin submissions. Logout has no GET mutation. Set `APP_ORIGIN=https://your-real-host` behind an HTTPS reverse proxy; configure that proxy to preserve the intended browser-facing Host. Do not trust arbitrary forwarded host/protocol headers. The application stays on loopback by default. No public deployment was performed.

## Workflows and routes

- `/`: dashboard with stock counts/value (role restricted), low/out-of-stock items, pending damage/purchases, replacement items, assigned/recent audits, activity and stock movements.
- `/inventory`: existing search/category/stock filtering and Add Item / Stock In / Stock Out. On phones inventory uses cards. `/inventory/[id]`: full item metadata and stock history; Admin/Manager edits never overwrite quantity or transactions.
- `/low-stock`: normal/low/critical/out-of-stock classification, reorder suggestions, suppliers and role-restricted cost estimates. Selected low-stock items can become a purchase request. Normal items remain in All Items.
- `/transactions`: paginated, read-only stock transaction history. No transaction deletion endpoint exists.
- `/suppliers`: contacts, addresses, notes, active/archive status and purchase history. Archiving never deletes suppliers or historical purchases.
- `/damage`: damaged, broken, missing, lost, stained, repair and replacement reports; attributed reporting, locations and management review/status/remarks. Caretakers cannot submit or read replacement costs. Optional photo evidence is stored in PostgreSQL and served through authenticated `/api/evidence/[id]`, never a public upload directory. JPEG/PNG/WebP only, up to 2 MB; signatures are checked, SVG/HTML uploads rejected. Photos are accessible to active authenticated staff. Report creation/review does not automatically decrement stock.
- `/audits`, `/audits/[id]`: whole-property or room/location snapshots, assignment, live count differences and complete/shortage/excess/damaged/missing flags. Completing a count leaves stock unchanged. Manager/Admin review can leave it unchanged or explicitly apply adjustments atomically with attributed stock movements. Adjustment is rejected if an item changed after the snapshot; start a new audit rather than overwriting intervening movements. Saved audits show start/completion/review times, performer, results and remarks.
- `/purchases`, `/purchases/[id]`: multi-item Draft → For Approval → Approved → Purchased → Received requests, with cancellation before receiving. Admin-only approval. Approved requests may be received directly or after marking Purchased. Receiving records user/time and atomically claims the request, creates Stock In movements, increments stock and writes logs. Concurrent/duplicate receiving is rejected; any item failure rolls back the entire receipt.
- `/users`: Admin-only add/edit/role/activation/password-reset controls, with last-login and creation timestamps.
- `/activity`: paginated, read-only attributed operations history, including login/logout, account changes, inventory, supplier, report, audit and purchase actions.
- `/reports`: live operational summaries by category and pending workflow totals.
- `/settings`: own account/session information and current-password-verified password change.
- `/login`, `/api/login`, `/api/logout`: authentication. `/denied`: authenticated access-restriction page.

Currency is PHP. Display times use Asia/Manila. Quantities are whole numbers, capped at 1,000,000 per item. Unit costs use database decimals with two decimal places. The API validates all input; database CHECK constraints additionally reject negative stock and invalid transaction/purchase quantities.

## Database changes

`20261028000000_init` remains unchanged. The additive `20261029000000_phase2` migration adds Manager, password/account/session fields, extended item and supplier metadata, report and purchase statuses, approvals/receiving attribution, audit review fields, session storage, protected photo evidence, and activity-role snapshots. `20261029010000_stock_constraints` adds stock/quantity checks and preserves the meaning of existing completed audits/received purchases through status backfills. No reset, table replacement, or historical-record deletion is required.

```sh
npm run db:deploy                   # apply committed migrations without resetting data
npm run db:migrate -- --name change # create a future schema migration
```

Back up a real database before applying any migration. `docker compose stop db` stops the local database; avoid `down -v` unless you explicitly intend to delete its volume.

## Tests and validation

```sh
npm run lint
npm run typecheck
npm test
npm run build
# With the production server running:
npm run test:smoke
# Optional real mobile browser regression (requires development accounts):
npx playwright install chromium
npm run test:e2e
```

The database suite exercises Phase 1 regression behavior plus login/logout, role permissions, user management and session revocation, metadata/history preservation, damage reporting, assigned audits, review-only and approved adjustments, stale-audit rejection, Admin-only purchase approval, concurrent receiving, multi-line rollback, supplier archiving and activity attribution. Tests use isolated named fixtures and delete only their own records. HTTP smoke uses temporary accounts, checks all 12 protected section routes, same-origin login, role denials, Caretaker cost redaction, item/stock mutations, insufficient-stock feedback, reporting with protected photo evidence, assigned audit submission/review, purchase approval/receiving/duplicate rejection and logout revocation. The browser regression signs in first and checks the mobile inventory workflow.

Validation after the published network update: **21 automated unit/database checks passed**, along with lint, TypeScript, production build, standard Prisma CLI generation/schema validation/migration status/deploy/schema-drift verification, the HTTP smoke workflow, and **1 mobile Chromium browser test**. The browser test covers login, responsive layout, item creation, stock in/out and insufficient-stock feedback. Its select locators use combobox roles and accessible names; application behavior is unchanged.

## Cloud network requirements

The published environment now enforces these custom allowed domains alongside the package-manager preset:

- `binaries.prisma.sh` — Prisma CLI native schema engine and checksum downloads.
- `cdn.playwright.dev` — Playwright Chromium and supporting downloads.
- `storage.googleapis.com` — Chrome for Testing download redirects.

Standard Prisma CLI commands now work: generation and validation succeeded, all three migrations are applied, deploy found no pending migrations, and the database-to-schema comparison found no drift. No database reset or new migration was needed. The original Phase 2 JavaScript/WebAssembly bootstrap is no longer required for normal verification.

Playwright Chromium, its headless shell and FFmpeg are installed, and mobile browser automation passed. Two FFmpeg download attempts were denied before Playwright's automatic permitted fallback succeeded; no manual alternate download route or disabled TLS/checksum verification was used. No further network changes were needed, and no environment draft changes or publication were performed during this verification.

Remaining non-blocking tool messages: Next.js labels its configured server-action body-size option as experimental, and the test runner warns that FORCE_COLOR takes precedence over NO_COLOR.

## Phase 3 candidates

Dedicated linen/laundry tracking and expense-entry workflows (their Phase 1 models are preserved), richer analytics/exports, email invitations and password recovery, MFA, purchase attachments/partial deliveries, multiple photo attachments and object storage, audit scheduling, and deployment/backups/monitoring are future work. These are additions beyond the implemented Phase 2 scope. Before using real operational data, disable demo accounts, use HTTPS with `APP_ORIGIN`, replace development database credentials, arrange backups and perform deployment-specific security review. No public exposure is configured by this repository.
