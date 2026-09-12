import { PrismaClient } from "@prisma/client";

/**
 * Server-side Prisma client (singleton across hot reloads).
 * Used by API routes + Socket.io mini-service to centralise POS data
 * so the Owner Live Dashboard can see every device's activity.
 */
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const serverDb =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = serverDb;
