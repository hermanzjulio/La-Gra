import { db, type User, type Category, type Product } from "./db";

/* ============================================================
   Seed La Gracia Lounge — default users + opening inventory.
   Idempotent: only seeds if DB is empty.
   ============================================================ */

const DEFAULT_USERS: User[] = [
  {
    username: "owner",
    password: "owner123",
    fullName: "La Gracia Owner",
    role: "owner",
    pin: "1111",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    username: "manager",
    password: "manager123",
    fullName: "Shift Manager",
    role: "manager",
    pin: "2222",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    username: "mary",
    password: "cashier123",
    fullName: "Mary Atim",
    role: "cashier",
    pin: "3333",
    active: true,
    createdAt: new Date().toISOString(),
  },
  {
    username: "john",
    password: "waiter123",
    fullName: "John Okello",
    role: "waiter",
    pin: "4444",
    active: true,
    createdAt: new Date().toISOString(),
  },
];

const DEFAULT_CATEGORIES: Category[] = [
  { name: "Beer", icon: "🍺", color: "#d4a017", sortOrder: 1, active: true },
  { name: "Spirits", icon: "🥃", color: "#b8860b", sortOrder: 2, active: true },
  { name: "Whisky", icon: "🍶", color: "#c9a227", sortOrder: 3, active: true },
  { name: "Wine", icon: "🍷", color: "#8b0000", sortOrder: 4, active: true },
  { name: "Cocktails", icon: "🍹", color: "#ff6b35", sortOrder: 5, active: true },
  { name: "Soft Drinks", icon: "🥤", color: "#c41e3a", sortOrder: 6, active: true },
  { name: "Food", icon: "🍽️", color: "#e07b00", sortOrder: 7, active: true },
  { name: "Water", icon: "💧", color: "#4a9eff", sortOrder: 8, active: true },
  { name: "Other", icon: "📦", color: "#888", sortOrder: 9, active: true },
];

type P = Omit<Product, "id" | "categoryId" | "createdAt"> & { category: string };

const DEFAULT_PRODUCTS: P[] = [
  // Beer
  { name: "Nile Special 500ml", category: "Beer", sku: "BEER-NILE-500", price: 5000, costPrice: 3800, stock: 80, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Nile Gold 500ml", category: "Beer", sku: "BEER-NILE-GOLD", price: 5000, costPrice: 3800, stock: 60, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Club Beer 500ml", category: "Beer", sku: "BEER-CLUB-500", price: 5000, costPrice: 3700, stock: 12, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Bell Lager 500ml", category: "Beer", sku: "BEER-BELL-500", price: 5000, costPrice: 3700, stock: 48, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Tusker Lite 330ml", category: "Beer", sku: "BEER-TUSKER-330", price: 4500, costPrice: 3200, stock: 36, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Heineken 330ml", category: "Beer", sku: "BEER-HEIN-330", price: 6000, costPrice: 4500, stock: 30, reorderLevel: 12, unit: "bottle", active: true },

  // Spirits
  { name: "Smirnoff Vodka 750ml", category: "Spirits", sku: "SPI-SMIRN-750", price: 45000, costPrice: 35000, stock: 8, reorderLevel: 5, unit: "bottle", active: true },
  { name: "Smirnoff Double Ice", category: "Spirits", sku: "SPI-SMIRN-ICE", price: 7000, costPrice: 5000, stock: 24, reorderLevel: 12, unit: "bottle", active: true },
  { name: "Captain Morgan 750ml", category: "Spirits", sku: "SPI-CAPT-750", price: 55000, costPrice: 42000, stock: 6, reorderLevel: 5, unit: "bottle", active: true },
  { name: "Gilbey's Gin 750ml", category: "Spirits", sku: "SPI-GILB-750", price: 40000, costPrice: 30000, stock: 10, reorderLevel: 5, unit: "bottle", active: true },
  { name: "Waragi Premium 750ml", category: "Spirits", sku: "SPI-WARG-750", price: 18000, costPrice: 13000, stock: 15, reorderLevel: 6, unit: "bottle", active: true },
  { name: "Uganda Waragi 200ml", category: "Spirits", sku: "SPI-WARG-200", price: 5000, costPrice: 3500, stock: 40, reorderLevel: 12, unit: "sachet", active: true },

  // Whisky
  { name: "Johnnie Walker Black 750ml", category: "Whisky", sku: "WHI-JW-BLACK", price: 130000, costPrice: 105000, stock: 5, reorderLevel: 3, unit: "bottle", active: true },
  { name: "Johnnie Walker Red 750ml", category: "Whisky", sku: "WHI-JW-RED", price: 90000, costPrice: 70000, stock: 7, reorderLevel: 3, unit: "bottle", active: true },
  { name: "Famous Grouse 750ml", category: "Whisky", sku: "WHI-GROUSE-750", price: 75000, costPrice: 58000, stock: 4, reorderLevel: 3, unit: "bottle", active: true },
  { name: "Jameson 750ml", category: "Whisky", sku: "WHI-JAM-750", price: 95000, costPrice: 75000, stock: 6, reorderLevel: 3, unit: "bottle", active: true },

  // Wine
  { name: "Four Cousins Red 750ml", category: "Wine", sku: "WIN-FC-RED", price: 35000, costPrice: 26000, stock: 12, reorderLevel: 6, unit: "bottle", active: true },
  { name: "Four Cousins White 750ml", category: "Wine", sku: "WIN-FC-WHITE", price: 35000, costPrice: 26000, stock: 8, reorderLevel: 6, unit: "bottle", active: true },
  { name: "Sweet Rosé 750ml", category: "Wine", sku: "WIN-ROSE", price: 40000, costPrice: 30000, stock: 6, reorderLevel: 4, unit: "bottle", active: true },

  // Cocktails
  { name: "Sex on the Beach", category: "Cocktails", sku: "COCK-SOB", price: 25000, costPrice: 14000, stock: 999, reorderLevel: 0, unit: "glass", active: true },
  { name: "Mojito", category: "Cocktails", sku: "COCK-MOJ", price: 22000, costPrice: 11000, stock: 999, reorderLevel: 0, unit: "glass", active: true },
  { name: "Pina Colada", category: "Cocktails", sku: "COCK-PINA", price: 25000, costPrice: 13000, stock: 999, reorderLevel: 0, unit: "glass", active: true },
  { name: "Long Island Iced Tea", category: "Cocktails", sku: "COCK-LIIT", price: 28000, costPrice: 15000, stock: 999, reorderLevel: 0, unit: "glass", active: true },

  // Soft Drinks
  { name: "Coca-Cola 500ml", category: "Soft Drinks", sku: "SD-COKE-500", price: 3000, costPrice: 2000, stock: 96, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Pepsi 500ml", category: "Soft Drinks", sku: "SD-PEPSI-500", price: 3000, costPrice: 2000, stock: 60, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Fanta Orange 500ml", category: "Soft Drinks", sku: "SD-FANTA-500", price: 3000, costPrice: 2000, stock: 48, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Sprite 500ml", category: "Soft Drinks", sku: "SD-SPRITE-500", price: 3000, costPrice: 2000, stock: 36, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Mt. Dew 500ml", category: "Soft Drinks", sku: "SD-MTDEW-500", price: 3000, costPrice: 2000, stock: 24, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Red Bull 250ml", category: "Soft Drinks", sku: "SD-RED-250", price: 8000, costPrice: 5500, stock: 24, reorderLevel: 12, unit: "can", active: true },

  // Food
  { name: "Chips (French Fries)", category: "Food", sku: "FOOD-CHIPS", price: 8000, costPrice: 3500, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Chips & Chicken", category: "Food", sku: "FOOD-CHIPS-CHK", price: 15000, costPrice: 8000, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Chips & Sausage", category: "Food", sku: "FOOD-CHIPS-SAUS", price: 12000, costPrice: 6500, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Roast Goat Meat", category: "Food", sku: "FOOD-GOAT", price: 20000, costPrice: 12000, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Grilled Fish (Tilapia)", category: "Food", sku: "FOOD-FISH", price: 25000, costPrice: 15000, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Beef Skewers (3pc)", category: "Food", sku: "FOOD-SKEW", price: 12000, costPrice: 6500, stock: 999, reorderLevel: 0, unit: "plate", active: true },
  { name: "Samosa (each)", category: "Food", sku: "FOOD-SAMOSA", price: 2000, costPrice: 1000, stock: 60, reorderLevel: 20, unit: "piece", active: true },
  { name: "Groundnuts Pack", category: "Food", sku: "FOOD-GNUTS", price: 3000, costPrice: 1500, stock: 40, reorderLevel: 15, unit: "pack", active: true },

  // Water
  { name: "Rwenzori Water 500ml", category: "Water", sku: "WAT-RWEN-500", price: 2000, costPrice: 1200, stock: 0, reorderLevel: 24, unit: "bottle", active: true },
  { name: "Rwenzori Water 1.5L", category: "Water", sku: "WAT-RWEN-1500", price: 3500, costPrice: 2200, stock: 24, reorderLevel: 12, unit: "bottle", active: true },
  { name: "Aquafina 500ml", category: "Water", sku: "WAT-AQUA-500", price: 2000, costPrice: 1200, stock: 48, reorderLevel: 24, unit: "bottle", active: true },

  // Other
  { name: "Ice Bucket", category: "Other", sku: "OTH-ICE", price: 5000, costPrice: 1000, stock: 999, reorderLevel: 0, unit: "bucket", active: true },
  { name: "Service Charge 10%", category: "Other", sku: "OTH-SVC", price: 5000, costPrice: 0, stock: 999, reorderLevel: 0, unit: "service", active: true },
];

const DEFAULT_SETTINGS: Record<string, string> = {
  businessName: "La Gracia Lounge",
  currency: "UGX",
  taxRate: "0",
  receiptFooter: "Thank you for choosing La Gracia Lounge — Asante sana!",
  lowStockThreshold: "24",
  lastBackup: "",
};

const DEFAULT_DISCOUNTS = [
  { name: "Staff Discount 10%", type: "percent" as const, value: 10, active: true, createdAt: new Date().toISOString() },
  { name: "Ladies Night 15%", type: "percent" as const, value: 15, active: true, createdAt: new Date().toISOString() },
  { name: "Happy Hour 20%", type: "percent" as const, value: 20, active: true, createdAt: new Date().toISOString() },
];

export async function seedIfEmpty(): Promise<void> {
  const userCount = await db.users.count();
  if (userCount > 0) return;

  await db.transaction(
    "rw",
    db.users,
    db.categories,
    db.products,
    db.settings,
    db.discounts,
    async () => {
      await db.users.bulkAdd(DEFAULT_USERS);
      await db.categories.bulkAdd(DEFAULT_CATEGORIES);

      const cats = await db.categories.toArray();
      const catMap = new Map(cats.map((c) => [c.name, c.id!]));

      const products: Product[] = DEFAULT_PRODUCTS.map((p) => ({
        name: p.name,
        categoryId: catMap.get(p.category)!,
        sku: p.sku,
        price: p.price,
        costPrice: p.costPrice,
        stock: p.stock,
        reorderLevel: p.reorderLevel,
        unit: p.unit,
        active: p.active,
        createdAt: new Date().toISOString(),
      }));
      await db.products.bulkAdd(products);

      for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
        await db.settings.put({ key: k, value: v });
      }
      await db.discounts.bulkAdd(DEFAULT_DISCOUNTS);
    },
  );
}

/* Demo sales generator — so the dashboard has something to show on first run */
export async function seedDemoSales(): Promise<void> {
  const saleCount = await db.sales.count();
  if (saleCount > 0) return;

  const users = await db.users.toArray();
  const cashier = users.find((u) => u.role === "cashier")!;
  const waiter = users.find((u) => u.role === "waiter")!;
  const products = await db.products.toArray();
  const sellable = products.filter((p) => p.price > 0);

  const now = new Date();
  let receiptN = 1;
  const sales: any[] = [];

  // Generate sales for the past 7 days
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const day = new Date(now);
    day.setDate(now.getDate() - dayOffset);
    const isWeekend = day.getDay() === 0 || day.getDay() === 6;
    const salesCount = isWeekend ? 18 + Math.floor(Math.random() * 8) : 8 + Math.floor(Math.random() * 5);

    for (let i = 0; i < salesCount; i++) {
      const saleTime = new Date(day);
      saleTime.setHours(18 + Math.floor(Math.random() * 6), Math.floor(Math.random() * 60));

      const lineCount = 1 + Math.floor(Math.random() * 4);
      const items = [];
      let subtotal = 0;
      let cost = 0;
      for (let l = 0; l < lineCount; l++) {
        const p = sellable[Math.floor(Math.random() * sellable.length)];
        const qty = 1 + Math.floor(Math.random() * 3);
        const lineTotal = p.price * qty;
        items.push({
          productId: p.id!,
          productName: p.name,
          price: p.price,
          costPrice: p.costPrice,
          qty,
          lineTotal,
        });
        subtotal += lineTotal;
        cost += p.costPrice * qty;
      }

      const methods = ["cash", "cash", "cash", "mobile_money", "card", "credit"] as const;
      const method = methods[Math.floor(Math.random() * methods.length)];

      sales.push({
        receiptNo: "#" + String(receiptN++).padStart(6, "0"),
        items,
        subtotal,
        discount: 0,
        discountType: "amount" as const,
        discountValue: 0,
        total: subtotal,
        cost,
        paymentMethod: method,
        amountPaid: method === "credit" ? 0 : subtotal,
        change: 0,
        cashierId: cashier.id!,
        cashierName: cashier.fullName,
        waiterId: waiter.id!,
        waiterName: waiter.fullName,
        status: "completed" as const,
        createdAt: saleTime.toISOString(),
      });
    }
  }

  await db.sales.bulkAdd(sales);
}
