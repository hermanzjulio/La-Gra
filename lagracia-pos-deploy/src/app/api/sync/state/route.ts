import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";

/**
 * GET /api/sync/state
 * Returns the full snapshot needed for the Owner Live Dashboard initial load:
 *   - sales (today + recent)
 *   - auditLogs (recent)
 *   - stockMovements (recent)
 *   - users
 *   - products (for low stock)
 *   - broadcasts (recent)
 *
 * Query:
 *   ?today=1 -> only today's sales
 *   ?from=ISO -> sales/audit/movements since this ISO
 */
export async function GET(req: NextRequest) {
  try {
    const fromParam = req.nextUrl.searchParams.get("from");
    const todayOnly = req.nextUrl.searchParams.get("today") === "1";

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const from = fromParam ? new Date(fromParam) : startOfToday;

    const [sales, auditLogs, stockMovements, products, broadcasts] =
      await Promise.all([
        serverDb.serverSale.findMany({
          where: { createdAt: { gte: todayOnly ? startOfToday : from } },
          orderBy: { createdAt: "desc" },
          take: 500,
        }),
        serverDb.serverAuditLog.findMany({
          where: { createdAt: { gte: from } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        serverDb.serverStockMovement.findMany({
          where: { createdAt: { gte: from } },
          orderBy: { createdAt: "desc" },
          take: 200,
        }),
        serverDb.serverProduct.findMany({
          where: { active: true },
        }),
        serverDb.serverBroadcast.findMany({
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

    const decoded = sales.map((s) => ({
      ...s,
      items: JSON.parse(s.itemsJson || "[]"),
      itemsJson: undefined,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      voidedAt: s.voidedAt ? s.voidedAt.toISOString() : null,
    }));

    const auditDecoded = auditLogs.map((a) => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    }));
    const movesDecoded = stockMovements.map((m) => ({
      ...m,
      createdAt: m.createdAt.toISOString(),
    }));
    const broadcastsDecoded = broadcasts.map((b) => ({
      ...b,
      createdAt: b.createdAt.toISOString(),
    }));

    return NextResponse.json({
      sales: decoded,
      auditLogs: auditDecoded,
      stockMovements: movesDecoded,
      products,
      broadcasts: broadcastsDecoded,
      serverTime: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[sync/state GET]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
