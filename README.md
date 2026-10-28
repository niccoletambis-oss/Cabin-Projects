# Cabin Bed & Breakfast Inventory

Phase 1: a responsive caretaker dashboard, searchable inventory, item creation, and stock in/out with a PostgreSQL audit trail. Currency is PHP; activity timestamps use Asia/Manila.

## Stack

Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, PostgreSQL 17 and Prisma 7 with the PostgreSQL driver adapter. Node.js 22.12+ or 24+ and Docker Compose are required for the default local workflow.

## Run locally

```sh
cp .env.example .env       # only if .env does not already exist
npm ci
npm run db:generate
docker compose up -d --wait db
npm run db:deploy
npm run db:seed
npm run dev
```

Open the development server on port 3000. The seed is repeatable: it creates 12 sample items across five categories and six locations, and never resets existing quantities. Sample data is illustrative. Default database credentials are for local development only. For an external PostgreSQL database, set `DATABASE_URL` securely and omit Docker Compose.

## Checks

```sh
npm run lint
npm run typecheck
npm test
npm run build
```

With the production server running, `npm run test:smoke` exercises both HTTP pages and the actual add-item/stock server actions. For the mobile browser test, run `npx playwright install chromium`, then `npm run test:e2e` after building. Playwright starts the production server if needed; its workflow creates and cleans up its own inventory record.

Tests include database integration checks and require the migrated database. They use uniquely named records and remove their own fixtures. Stock-out uses an atomic conditional update; successful movements and activity logs are saved in the same transaction. Quantities are whole numbers, bounded to 1,000,000 per item. Unit costs use database decimals with two decimal places.

For schema changes, edit `prisma/schema.prisma`, then run `npm run db:migrate -- --name describe_change` and commit the generated migration. `db:deploy` applies committed migrations without resetting data. Run `npm run start` after a production build. `docker compose stop db` stops the local database; do not remove the data volume unless you intend to delete all local data.

## Phase 1 scope

- Dashboard: inventory counts, low stock, stock valuation, locations and recent movements.
- Inventory: search by item/SKU/room, category and stock filters, add item, stock in/out.
- Schema: users, categories, rooms/locations, items, transactions, suppliers, purchases/lines, audits/lines, damage/missing reports, linen tracking, expenses, activity logs.
- Accessible native dialogs, labeled forms, visible keyboard focus, mobile navigation and touch-sized controls. Wide inventory tables scroll within their panel on phones.

This is a **development foundation**, not a production deployment. Authentication and authorization are not implemented; mutations run in a shared workspace with no signed-in actor. The sample user is not a login. Do not expose the application publicly or enter real guest/operational data until access controls are added. Supplier, purchase, audit, report, linen and expense workflows are schema foundations only. Reporting a damage record or creating a purchase does not yet change stock; all current stock changes go through the inventory functions. Future work should add authentication, role checks, workflow UI, backups and deployment configuration.

## Cloud environment

Use the existing checkout at `/workspace/Cabin-Projects`; tasks are already isolated and do not need a worktree. Keep `.env` private. Restore dependencies with `npm ci`, start the database, deploy migrations, optionally seed a new development database, then start Next.js. Running processes must restart in new tasks. Package installation needs the npm registry and Prisma tooling needs `binaries.prisma.sh`; browser installation needs `cdn.playwright.dev` and its Google storage redirect. Keep TLS and artifact verification enabled.

Onboarding validation: production build, lint, TypeScript, four unit/database checks, repeatable seeding and production HTTP/server-action smoke checks passed. Native Prisma CLI downloads were blocked by the environment allowlist, so the initial client and migration were generated with the matching official Prisma 7.10.1 JavaScript/WebAssembly tooling, and the migration was applied with that engine. Normal `npm ci`/Prisma CLI reproduction requires the saved network additions to be applied. Mobile browser automation is included but could not run because its browser download was blocked.
