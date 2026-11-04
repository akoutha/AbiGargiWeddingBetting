# Wedding Betting

The fictional-money betting site described in [PRODUCT.md](./PRODUCT.md).

The database layer and guest screens are built. The admin panel comes next.

## How it fits together

- **`supabase/migrations/`** holds the schema and every operation that moves money. Each runs as one database transaction.
- **`src/lib/db.ts`** is the server-only database connection. Browsers have no database access, so all requests go through Next.js server code.
- **`src/app/actions.ts`** handles sign-in and bets. The guest is always taken from the signed-in session, never from the browser's request.
- **`src/lib/game/errors.ts`** turns database error codes into plain-language messages.

Balances are never stored. Each one is the sum of a guest's entries in the append-only `ledger_entries` table.

## Run the tests

The tests need a real Postgres server, because they exercise locking and simultaneous requests. They create and drop their own temporary database.

```bash
npm install
TEST_DATABASE_URL=postgres://postgres@localhost:5432/postgres npm test
```

## Set up Supabase

1. Create a Supabase project.
2. In the SQL Editor, run the files in `supabase/migrations/` in order.
3. To try the guest screens with sample events and guests, also run `supabase/seed-demo.sql`. Don't run it on the real game.
4. Copy `.env.example` to `.env.local` and fill it in. `DATABASE_URL` is the Transaction pooler connection string from Supabase's **Connect** button, with your database password in it. Never expose it to the browser.
5. Run `npm run dev`. Guests can enter the code at `/join`, or scan a QR code for `/join/link?code=YOURCODE`.
