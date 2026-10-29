# Cabin Bed & Breakfast Operations

A mobile-first Bed & Breakfast operations workspace built on the preserved Phase 1 inventory and Phase 2 security foundation. Next.js 16, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 17, Prisma 7.10.1 and the PostgreSQL driver adapter. Requires Node.js 22.12+ or 24+ and Docker Compose for the default local database.

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

## Phase 3 operations

Phase 3 extends the verified Phase 1/2 application. It keeps central inventory, authentication, existing permissions, suppliers, audits, purchasing, damage reports and activity history. No public deployment or database reset is part of this phase.

### New pages and protected endpoints

| Route                                          | Purpose                                                                                                               |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `/rooms`, `/rooms/[id]`                        | Rooms/areas, staff assignment, expected templates, assigned quantities, condition, replacement cost and discrepancies |
| `/linen`                                       | Linen dashboard, registration, status/location transfers and immutable movement history                               |
| `/bookings`, `/bookings/new`, `/bookings/[id]` | Lightweight guest stay references, assigned rooms and inspection/issue/charge links                                   |
| `/inspections`, `/inspections/[id]`            | Arrival/departure snapshots, live differences, photo evidence and associated issue creation                           |
| `/charges`, `/charges/[id]`                    | Draft/review/Owner approval, waiver and manual paid/unpaid tracking                                                   |
| `/expenses`, `/expenses/new`, `/expenses/[id]` | Expense submission, receipts, management review and current-month summary                                             |
| `/reports/operations`                          | Fourteen detailed report types, filters, CSV/Excel-friendly CSV and print view                                        |
| `/api/attachments/[id]`                        | Authenticated, room- or expense-owner-scoped evidence download                                                        |
| `/api/reports`                                 | Admin/Manager-only CSV exports, with formula-injection protection                                                     |

Existing dashboard, damage reports, evidence authorization and navigation are extended rather than replaced. The dashboard adds arrivals/departures, current guests, pending inspections, scoped linen/issues, guest charges, monthly approved expenses and phone-sized quick actions. Financial cards remain hidden server-side for Caretakers; they may see their own expense submissions.

### Roles and data boundaries

- Admin/Owner: all operations, plus exclusive guest-charge approval. Only an Owner may waive an already approved/unpaid charge.
- Manager: room standards/staff assignment, bookings, inspections, linen, issue/charge review, expenses and financial reports. Existing restrictions on user management and purchase approval remain.
- Caretaker: assigned rooms/booking references/inspections, linen transfers involving assigned locations or shared Storage/Laundry locations, issue/photo reporting, existing stock and audit operations, and own expense submission/receipts. They cannot see other staff expenses, restricted exports or guest-charge amounts. Guest mobile/email and private booking notes are management-only.

New rooms and areas require explicit staff assignments. Existing Phase 1 locations default to `AREA`; a Manager can classify an actual bedroom as `ROOM` without changing its inventory. Staff can still access the existing Phase 1/2 central inventory workflow as before.

### Room and linen records

Expected templates never alter central stock. Management can maintain expected and physically assigned quantities; completion of an inspection updates only the room's last-inspected assigned quantity/condition. Room template revisions retain before/after snapshots in protected activity history.

Linen is a separate status/location ledger for known physical units, not another purchase or automatic central Stock Out. Management registers verified untracked units (bounded by current central stock and existing active registration), then staff move them atomically between Available, Assigned to Room, In Use, Used, For Laundry, In Laundry, Clean, Damaged, Stained, Missing, For Replacement and Retired. Each movement records both states/locations, quantity, actor, timestamp and reason; movements cannot take a balance negative. Moving linen preserves the registered total and does not double-decrement central inventory. Retired units cannot return to circulation through an ordinary movement. Existing `LinenTracking` foundation records and legacy enum values remain untouched; do not infer a new starting balance from ambiguous historical entries. Reconcile physical balances before registration.

### Booking and inspection lifecycle

Bookings store only reference, name, optional contact details, guest count, planned dates, source and operational notes. There are no IDs, payment-card fields or payment gateways. Overlapping active room reservations are rejected. Upcoming bookings can be edited before inspections start; subsequent snapshots and edit history are preserved. Cancellation retains the record and cannot bypass completed arrival inspections.

Start an inspection from a booking's room. Check-in loads the room standard; check-out loads the **completed check-in snapshot**, including its expected quantity, actual count, condition, item name and replacement cost. Changing the room template during a stay does not rewrite that baseline. Save counts as a draft to add individual photos, then complete. Check-in cannot complete before the arrival date or while another stay still occupies that room. Completed inspections/evidence are immutable. Once every room's arrival inspection is complete, the stay becomes Checked In; once all departure inspections are complete, it becomes Checked Out. Unique inspection keys and transactional claims prevent duplicate departure processing.

Differences identify shortage, missing, stained, damaged and new damage while retaining pre-existing conditions. A completed departure discrepancy can create one existing Damage/Missing report with copied photo evidence and booking/room/item links. Wording is **associated with booking**, never an automatic finding of guest responsibility. Reporting never charges the guest or silently removes central stock.

### Charges and expenses

A charge requires a booking-associated issue whose management review is complete. Replacement/repair cost and proposed charge amount are separate. Drafts can be revised with history, then reviewed, approved only by an Owner, waived, marked unpaid/paid, or cancelled before approval. Payment records include approval/payment times and are tracking only. A unique report-to-charge relationship prevents duplicate charges, including attempts to re-charge a waived or cancelled issue; Phase 3 provides no duplicate override.

All staff can submit expenses. Caretakers can submit a payee, own amount/receipt and an assigned booking reference; management links restricted supplier/purchase/issue records. Managers/Admins may edit submitted expenses and approve or reject them. Reviewed expenses and receipts are locked, including against concurrent edits/uploads. This is expense tracking, not a full accounting/refund/reversal ledger.

### Reports and exports

Reports cover room inventory/discrepancies, linen balances/movements, check-in/out inspections, damage/missing items, guest charges, expenses/monthly expense totals, valuation, low stock, purchases and audits. Available filters are dates, room/location, category (inventory or expense), item, booking, status, supplier and user. Use filters relevant to the selected report; unrelated metadata produces no matches. Linen movement location filters include both origin and destination; expense room filters include associated booking rooms or issue locations.

Current stock/linen balance reports are current state, not reconstructed historical valuations. Room-template dates mean last update; other dated reports use movement/inspection/issue/purchase/audit creation or expense date. Date ranges and monthly groups use Asia/Manila, while exported timestamps are ISO UTC. Reports reject oversized results instead of silently truncating beyond 5,000 rows. UTF-8 CSV, Excel-friendly BOM CSV and browser-print CSS require no new heavy dependencies. Spreadsheet-formula prefixes in text cells are escaped. Native XLSX is intentionally deferred.

Photos accept JPEG/PNG/WebP up to 2 MB each; receipts also accept PDF. Evidence is uploaded one file per request and stored in PostgreSQL, protected by authentication and room/expense ownership checks. PDF receipts download as attachments. No public upload directory is used.

### Optional development operations data

```sh
# After migrations and the existing development-account seed:
ALLOW_DEMO_DATA=true npm run db:seed:operations
```

This script refuses production mode. It creates missing **Demo** rooms/property areas, room standards, linen items/registrations/allocation history, synthetic current/upcoming bookings, a sample arrival inspection and a submitted laundry expense. It preserves existing Phase 1/2 records and never resets passwords or quantities. Existing demo operational edits are not overwritten; initial linen allocation occurs only when the sole recorded movement is this script's initial registration. Rooms awaiting a physical count start at zero assigned quantity rather than inventing a confirmed count. No real guest data is used.

### Additive migration

`20261029020000_bnb_operations` adds location types/assignments, room inventory, linen enrollment/balances/movements, bookings/room links, inspection snapshots/lines, guest charges, protected operational attachments, expense metadata/review links, report booking/inspection/reviewer links and new workflow enums. Foreign keys, unique processing keys and nonnegative quantity/amount/date constraints supplement service validation. Existing three migrations are unchanged; deploy applies this fourth migration without resetting data.

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

Phase 3 extends the test suite with room/linen/stay/inspection/issue/charge/expense lifecycle tests, financial and room-scope restrictions, concurrency/duplicate protection, draft/history preservation and safe report exports. The existing HTTP smoke suite is retained and followed by the new operational HTTP suite. Browser tests include the original mobile inventory workflow plus a temporary-account Caretaker workflow covering arrival/departure, associated reporting, linen and receipt-backed expense submission. Fixtures clean up only their own records. Final Phase 3 validation: **36 unit/database checks passed**, **both HTTP smoke suites passed**, **2 mobile Chromium tests passed**, and lint, TypeScript and production build passed. Prisma validation, migration status and schema-drift verification passed. Repeating the operational demo seed was verified not to change existing stock, templates, linen balances/history, bookings, inspections, expenses or activity counts.

## Cloud network requirements

The published environment now enforces these custom allowed domains alongside the package-manager preset:

- `binaries.prisma.sh` — Prisma CLI native schema engine and checksum downloads.
- `cdn.playwright.dev` — Playwright Chromium and supporting downloads.
- `storage.googleapis.com` — Chrome for Testing download redirects.

Standard Prisma CLI commands now work: generation and validation succeeded, all four migrations are applied, deploy found no pending migrations, and the database-to-schema comparison found no drift. No database reset is used; Phase 3 adds the fourth migration described above. The original Phase 2 JavaScript/WebAssembly bootstrap is no longer required for normal verification.

Playwright Chromium, its headless shell and FFmpeg are installed, and mobile browser automation passed. Two FFmpeg download attempts were denied before Playwright's automatic permitted fallback succeeded; no manual alternate download route or disabled TLS/checksum verification was used. No further network changes were needed, and no environment draft changes or publication were performed during this verification.

Remaining non-blocking tool messages: Next.js labels its configured server-action body-size option as experimental, and the test runner warns that FORCE_COLOR takes precedence over NO_COLOR.

## Phase 4 / production preparation

Phase 3 is an operational workflow foundation, not a public production deployment. Intentionally deferred: a full booking engine, payment gateways (explicitly outside scope), native XLSX, email invitations/password recovery/MFA, notification automation, object storage/large attachments, expense credit/reversal accounting, production hosting, monitoring, retention policies and backup/restore operations. CSV/Excel-friendly CSV and printable reports are implemented.

Before real deployment, disable development accounts, replace local database credentials, use HTTPS and the real `APP_ORIGIN`, configure the trusted reverse proxy, test backups/restoration and perform deployment-specific security review. No new external service credentials or network hosts are required for Phase 3. Existing npm/Prisma/Playwright allowlist settings suffice. The app remains on loopback; no environment configuration was published or public deployment performed.
