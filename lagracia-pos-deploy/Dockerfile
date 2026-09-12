# La Gracia POS — production image
# Works on any Docker host: Render, Railway, Fly.io, DigitalOcean App
# Platform, a plain VPS, etc. Do NOT deploy this to Vercel — Vercel's
# serverless functions cannot run this custom server.js (it needs a
# persistent process for Socket.io + the on-disk SQLite file).

FROM node:20-bookworm-slim AS base
WORKDIR /app
RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ---- deps ----
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# ---- build ----
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ---- run ----
FROM base AS run
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/public ./public
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
COPY server.js next.config.ts package.json ./

# SQLite lives here — mount a persistent volume at this path on your host
# (Fly.io volumes, Railway volumes, Render persistent disks) or the data
# is lost on every redeploy/restart.
RUN mkdir -p /app/db
VOLUME ["/app/db"]
ENV DATABASE_URL="file:/app/db/custom.db"

EXPOSE 3000
ENV PORT=3000

CMD ["sh", "-c", "npx prisma db push --accept-data-loss --skip-generate && node server.js"]
