# USDCare

USDCare is healthcare payment, escrow, and funding infrastructure built around USDC. This repository currently contains the product specification, a Next.js provider experience, and the first Fastify/PostgreSQL backend module for Privy-authenticated account onboarding.

## Applications

- `apps/web`: Next.js frontend using Privy email login, embedded wallets, and external wallet connectors.
- `apps/api`: Fastify API using Privy access-token verification and PostgreSQL.
- `USDCare_PRD_and_Development_Plan.md`: product requirements, architecture, security model, and delivery plan.

## Prerequisites

- Node.js 20 or newer
- PostgreSQL 15 or newer
- A Privy application configured for email login and Ethereum embedded wallets

In the Privy dashboard, enable email as a login method, configure embedded Ethereum wallets to be created for users without wallets, add `http://localhost:3000` as an allowed origin, and enable Arc Testnet for the application.

## Configure

```bash
cp apps/web/.env.example apps/web/.env.local
cp apps/api/.env.example apps/api/.env
```

Use the same Privy app ID in both files. The Privy app secret belongs only in `apps/api/.env`; never expose it through a `NEXT_PUBLIC_` variable.

## Database

Start an isolated local development database:

```bash
docker run -d --name usdcare-postgres \
  -e POSTGRES_USER=usdcare \
  -e POSTGRES_PASSWORD=usdcare_dev_only \
  -e POSTGRES_DB=usdcare \
  -p 5433:5432 \
  -v usdcare_postgres_data:/var/lib/postgresql/data \
  postgres:16-alpine
```

Then apply the migrations:

```bash
psql "$DATABASE_URL" -f apps/api/db/migrations/001_identity_and_wallets.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/002_invoices_and_payment_requests.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/003_arc_testnet.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/004_invoice_arc_default.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/005_payment_confirmation.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/006_payment_ownership_and_org_profile.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/007_treatment_escrows.sql
psql "$DATABASE_URL" -f apps/api/db/migrations/008_escrow_payment_requests.sql
```

The migration stores Privy user IDs, account profiles, organizations, memberships, connected wallet metadata, and transaction/settlement wallet-role assignments. It does not store private keys, seed phrases, or medical records.

## Install and run

```bash
cd apps/api
npm install
npm run dev
```

In a second terminal:

```bash
cd apps/web
npm install
npm run dev
```

Open `http://localhost:3000`. The API runs at `http://localhost:4000`; health endpoints are available at `/health` and `/ready`.

Without frontend Privy variables, the web application runs in an interactive preview mode. Live account creation requires valid Privy credentials and a migrated PostgreSQL database.

## Verification

```bash
cd apps/web
npm run typecheck
npm run lint
npm run build
# With the web server running and a Playwright browser installed:
npm run visual-check

cd ../api
npm run typecheck
npm run build
```

## Current backend scope

- Verify Privy bearer tokens.
- Load the authenticated user's onboarding status.
- Persist individual or organization account setup.
- Record embedded and external wallets without taking custody of keys.
- Validate submitted wallets against wallets linked and verified on the authenticated Privy user.
- Assign transaction and organization settlement wallet roles on Arc Testnet.
- Create and list provider invoices with generated public payment requests.
- Resolve public payment-request details without exposing medical records.

Ledger entries, onchain payment detection, reconciliation, receipts, and escrow contracts are the next backend modules described in the PRD.
