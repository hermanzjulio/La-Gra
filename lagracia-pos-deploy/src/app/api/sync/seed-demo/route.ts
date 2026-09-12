import { NextRequest, NextResponse } from "next/server";
import { serverDb } from "@/lib/server-db";

/**
 * POST /api/sync/seed-demo
 *
 * Pushes the local demo catalog (users, categories, products) into the
 * server-side DB so the Owner Live Dashboard has products to show on first
 * load. This is idempotent: it only creates rows that don't already exist.
 *
 * Body: {
 *   users:    ServerUser[],
 *   categories: ServerCategory[],
 *   products:   ServerProduct[]  (with category matched by name)
 * }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const users = body.users ?? [];
    const categories = body.categories ?? [];
    const products = body.products ?? [];

    let createdUsers = 0;
    let createdCats = 0;
    let createdProducts = 0;

    // Users
    for (const u of users) {
      const existing = await serverDb.serverUser.findUnique({
        where: { username: u.username },
      });
      if (!existing) {
        await serverDb.serverUser.create({
          data: {
            username: u.username,
            fullName: u.fullName,
            role: u.role,
            password: u.password || "demo",
            pin: u.pin ?? null,
            active: u.active ?? true,
          },
        });
        createdUsers++;
      }
    }

    // Categories (by name)
    const catIdByName = new Map<string, number>();
    for (const c of categories) {
      const existing = await serverDb.serverCategory.findUnique({
        where: { name: c.name },
      });
      if (existing) {
        catIdByName.set(c.name, existing.id);
      } else {
        const created = await serverDb.serverCategory.create({
          data: {
            name: c.name,
            icon: c.icon || "📦",
            color: c.color || "#888",
            sortOrder: c.sortOrder ?? 0,
            active: c.active ?? true,
          },
        });
        catIdByName.set(c.name, created.id);
        createdCats++;
      }
    }

    // Products (match by name to avoid duplicates)
    for (const p of products) {
      const catId = catIdByName.get(p.categoryName);
      if (!catId) continue;
      const existing = await serverDb.serverProduct.findFirst({
        where: { name: p.name },
      });
      if (!existing) {
        await serverDb.serverProduct.create({
          data: {
            name: p.name,
            categoryId: catId,
            sku: p.sku ?? null,
            price: p.price ?? 0,
            costPrice: p.costPrice ?? 0,
            stock: p.stock ?? 0,
            reorderLevel: p.reorderLevel ?? 0,
            unit: p.unit || "unit",
            active: p.active ?? true,
          },
        });
        createdProducts++;
      } else {
        // Update stock to latest
        await serverDb.serverProduct.update({
          where: { id: existing.id },
          data: {
            stock: p.stock ?? existing.stock,
            price: p.price ?? existing.price,
            costPrice: p.costPrice ?? existing.costPrice,
            reorderLevel: p.reorderLevel ?? existing.reorderLevel,
          },
        });
      }
    }

    return NextResponse.json({
      ok: true,
      created: {
        users: createdUsers,
        categories: createdCats,
        products: createdProducts,
      },
    });
  } catch (err: any) {
    console.error("[sync/seed-demo POST]", err);
    return NextResponse.json(
      { error: err?.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
