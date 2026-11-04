# Wedding Betting

The fictional-money betting site described in [PRODUCT.md](./PRODUCT.md).

The database layer is built: schema, bet and settlement transactions, and tests. The guest and admin screens come next.

## How it fits together

- **`supabase/migrations/`** holds the schema and every operation that moves money. Each runs as one database transaction.
- **`src/lib/supabase/admin.ts`** is the server-only database client. Browsers have no database access, so all requests go through Next.js server code.
- **`src/lib/game/errors.ts`** turns database error codes into plain-language messages.

Balances are never stored. Each one is the sum of a guest's entries in the append-only `ledger_entries` table.

## Run the tests

The tests need a real Postgres server, because they exercise locking and simultaneous requests. They create and drop their own temporary database.

```bash
npm install
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

## Set up Supabase

1. Create a Supabase project and apply the migrations in order.
2. Copy `.env.example` to `.env.local` and fill it in. `SUPABASE_SERVICE_ROLE_KEY` has full database access, so never expose it to the browser.
3. Create your admin user in Supabase Auth, then add it to the `admins` table with `is_owner = true`.
