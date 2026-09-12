import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";

/**
 * POST /api/sync/audit
 * Body: { userId, userName, action, detail, entity?, entityId?, createdAt? }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.userName || !body.action) {
      return NextResponse.json(
        { error: "userName and action are required" },
        { status: 400 },
      );
    }
    const log = await serverDb.serverAuditLog.create({
      data: {
        userId: body.userId ?? null,
        userName: body.userName,
        action: body.action,
        detail: body.detail ?? "",
        entity: body.entity ?? null,
        entityId: body.entityId ?? null,
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
      },
    });
    return NextResponse.json({
      ok: true,
      log: { ...log, createdAt: log.createdAt.toISOString() },
    });
  } catch (err: any) {
    console.error("[sync/audit POST]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
