import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";

/**
 * POST /api/sync/sales
 * Body: a Sale object (mirrors Dexie Sale) + optional deviceId.
 * Persists to server-side Prisma DB so the owner dashboard can read it.
 * The WebSocket broadcast is handled separately by the client (via socket.emit).
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.receiptNo) {
      return NextResponse.json(
        { error: "receiptNo is required" },
        { status: 400 },
      );
    }

    // Upsert by receiptNo (a device may retry the same sale if offline)
    const existing = await serverDb.serverSale.findUnique({
      where: { receiptNo: body.receiptNo },
    });

    const itemsJson = JSON.stringify(body.items ?? []);
    const data = {
      receiptNo: body.receiptNo,
      customerId: body.customerId ?? null,
      itemsJson,
      subtotal: body.subtotal ?? 0,
      discount: body.discount ?? 0,
      discountType: body.discountType ?? "amount",
      discountValue: body.discountValue ?? 0,
      total: body.total ?? 0,
      cost: body.cost ?? 0,
      paymentMethod: body.paymentMethod ?? "cash",
      amountPaid: body.amountPaid ?? 0,
      change: body.change ?? 0,
      cashierId: body.cashierId ?? 0,
      cashierName: body.cashierName ?? "Unknown",
      waiterId: body.waiterId ?? null,
      waiterName: body.waiterName ?? null,
      status: body.status ?? "completed",
      voidReason: body.voidReason ?? null,
      voidApprovedBy: body.voidApprovedBy ?? null,
      voidApprovedByName: body.voidApprovedByName ?? null,
      voidedAt: body.voidedAt ? new Date(body.voidedAt) : null,
      deviceId: body.deviceId ?? null,
    };

    let sale;
    if (existing) {
      sale = await serverDb.serverSale.update({
        where: { receiptNo: body.receiptNo },
        data,
      });
    } else {
      sale = await serverDb.serverSale.create({
        data: {
          ...data,
          createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
        },
      });
    }

    return NextResponse.json({ ok: true, sale });
  } catch (err: any) {
    console.error("[sync/sales POST]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}

/**
 * GET /api/sync/sales?from=ISO&limit=100
 * Returns the latest sales (newest first). Used by owner dashboard on
 * initial load to backfill before subscribing to socket events.
 */
export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const limit = Math.min(
      parseInt(req.nextUrl.searchParams.get("limit") || "100", 10),
      500,
    );

    const sales = await serverDb.serverSale.findMany({
      where: from ? { createdAt: { gte: new Date(from) } } : undefined,
      orderBy: { createdAt: "desc" },
      take: limit,
    });

    // Decode itemsJson
    const decoded = sales.map((s) => ({
      ...s,
      items: JSON.parse(s.itemsJson || "[]"),
      itemsJson: undefined,
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      voidedAt: s.voidedAt ? s.voidedAt.toISOString() : null,
    }));

    return NextResponse.json({ sales: decoded });
  } catch (err: any) {
    console.error("[sync/sales GET]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
