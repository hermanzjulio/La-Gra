# La Gracia POS — What changed, and how to host it

## 1. The pricing bug — fixed

**Cause:** when you tapped a product, the app attached a `lineTotal` to that
cart line equal to the unit price at that moment (e.g. Nile = 5,000). Every
time you tapped the *same* product again, only the `qty` was bumped — the
`lineTotal` was copied over unchanged. The order subtotal, the checkout
total, and the amount saved into the sale record all read from that frozen
`lineTotal`, not from `price × qty`. So Nile ×3 showed 5,000 instead of
15,000 — and because the saved sale record had the wrong `lineTotal` too,
Reports and the Dashboard's revenue/profit numbers would have been thrown
off for any multi-quantity line, not just the on-screen total.

**Fix:** the cart store (`src/lib/store.ts`) now recalculates
`lineTotal = price × qty` every single time a line is added to or its
quantity is changed — nothing is ever "set once and left." The checkout
screen and the saved sale record (`src/components/views/pos.tsx`) now also
compute straight from `price × qty` instead of trusting a stored field.
Tapping Nile three times now correctly shows 15,000, and every sale from
now on will save the correct line totals.

## 2. Why not Vercel

This app has two things Vercel's serverless functions can't provide:
- **A live Socket.io connection** for the owner's real-time dashboard
  (Live Ops) — serverless functions don't stay running between requests.
- **A local SQLite file** (`db/custom.db`) — serverless filesystems are
  read-only/ephemeral, so writes would vanish.

I merged the previously separate real-time sync service into the main app
(`server.js`) so the whole thing now runs as **one ordinary Node process on
one port** — which is exactly what non-serverless hosts are good at.

## 3. Hosting options (pick one)

All of these run a normal Node/Docker process, so all of them work:

### Render (easiest, has a free-tier-friendly path)
1. Push this folder to a GitHub repo.
2. New → Web Service → connect the repo.
3. Environment: Node. Build command: `npm install && npm run build`.
   Start command: `npm start`.
4. Add a **Persistent Disk** (Render → Disks) mounted at `/app/db` — this
   is what keeps your sales data across restarts/deploys.
5. Set env var `DATABASE_URL=file:/app/db/custom.db` (matching the disk's
   mount path) and `PORT` (Render sets this automatically).
6. First deploy: open the Shell tab and run `npx prisma db push` once to
   create the tables.

### Railway
1. New Project → Deploy from GitHub repo.
2. Railway auto-detects Node; it will run `npm install`, `npm run build`,
   `npm start` from `package.json`.
3. Add a **Volume** mounted at `/app/db`, and set
   `DATABASE_URL=file:/app/db/custom.db`.
4. Run `npx prisma db push` once from Railway's shell/one-off command.

### Fly.io (uses the included Dockerfile)
1. `fly launch` in this folder (it will detect the Dockerfile).
2. `fly volumes create data --size 1` then mount it at `/app/db` in
   `fly.toml` (`[mounts] source="data" destination="/app/db"`).
3. `fly deploy`. The Dockerfile's start command already runs
   `prisma db push` on boot.

### A plain VPS (DigitalOcean, Hetzner, etc.)
1. Install Node 20, clone/copy this folder onto the server.
2. `npm install && npx prisma generate && npm run build`
3. `npx prisma db push --accept-data-loss` (creates the SQLite tables)
4. `npm start` (use `pm2` or a systemd service to keep it running, and a
   reverse proxy like Caddy/Nginx in front for HTTPS).

## 4. Environment variables

- `DATABASE_URL` — where the SQLite file lives, e.g.
  `file:./db/custom.db` (relative, for a VPS) or `file:/app/db/custom.db`
  (for a mounted volume/disk). **Must point at persistent storage** or
  sales data is lost on restart.
- `PORT` — most hosts set this for you automatically.
- `NEXT_PUBLIC_SYNC_URL` — only needed if you later split the real-time
  layer into its own separate service; leave unset to use the merged
  single-process setup.

## 5. What was removed/changed from the sandbox export

- `mini-services/sync-service` (separate Socket.io process) — merged into
  `server.js`, so you no longer run two processes.
- The Caddy `?XTransformPort=` routing trick — that only exists inside the
  Z.ai sandbox gateway; real hosts don't need or support it.
- The hardcoded `/home/z/my-project/...` database path — replaced with a
  relative/configurable `DATABASE_URL`.
- Sandbox-only folders (`.zscripts/`, `examples/`, `Caddyfile`, the demo
  `db/custom.db`) were dropped from this package since they don't apply
  outside the sandbox.
