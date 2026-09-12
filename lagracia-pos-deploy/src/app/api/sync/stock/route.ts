import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";

/**
 * POST /api/sync/stock
 * Body: a ServerStockMovement-compatible object.
 * Persists the stock movement on the server so the owner dashboard can see it.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || !body.productId || !body.type) {
      return NextResponse.json(
        { error: "productId and type are required" },
        { status: 400 },
      );
    }
    const movement = await serverDb.serverStockMovement.create({
      data: {
        productId: body.productId,
        productName: body.productName ?? "",
        type: body.type,
        quantityChange: body.quantityChange ?? 0,
        reason: body.reason ?? null,
        reference: body.reference ?? null,
        supplier: body.supplier ?? null,
        invoiceNo: body.invoiceNo ?? null,
        costPrice: body.costPrice ?? null,
        userId: body.userId ?? null,
        userName: body.userName ?? null,
        saleId: body.saleId ?? null,
        createdAt: body.createdAt ? new Date(body.createdAt) : new Date(),
      },
    });

    // Also update the product's stock level on the server
    if (body.productId && body.quantityChange) {
      const product = await serverDb.serverProduct.findUnique({
        where: { id: body.productId },
      });
      if (product) {
        await serverDb.serverProduct.update({
          where: { id: body.productId },
          data: {
            stock: Math.max(0, product.stock + body.quantityChange),
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      movement: { ...movement, createdAt: movement.createdAt.toISOString() },
    });
  } catch (err: any) {
    console.error("[sync/stock POST]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
