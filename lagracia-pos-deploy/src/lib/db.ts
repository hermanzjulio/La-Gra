import Dexie, { Table } from "dexie";

/* ============================================================
   La Gracia POS — Local Database (IndexedDB via Dexie)
   Offline-first. All operations happen on the device.
   ============================================================ */

export type UserRole = "owner" | "manager" | "cashier" | "waiter";

export interface User {
  id?: number;
  username: string;
  password: string; // plaintext for v1 (local only); upgrade to hash later
  fullName: string;
  role: UserRole;
  pin?: string; // quick PIN for fast POS login
  active: boolean;
  createdAt: string;
}

export interface Category {
  id?: number;
  name: string;
  icon: string; // emoji or lucide name
  color: string; // hex
  sortOrder: number;
  active: boolean;
}

export interface Product {
  id?: number;
  name: string;
  categoryId: number;
  sku?: string;
  price: number;       // selling price
  costPrice: number;   // cost price (for profit calc)
  stock: number;       // current on-hand
  reorderLevel: number;
  unit: string;        // bottle, glass, plate, etc
  active: boolean;
  createdAt: string;
}

export interface Customer {
  id?: number;
  name: string;
  phone?: string;
  email?: string;
  creditBalance: number; // outstanding credit (positive = owes us)
  notes?: string;
  createdAt: string;
}

export interface Sale {
  id?: number;
  receiptNo: string;     // e.g. #000125
  customerId?: number;
  items: SaleItem[];
  subtotal: number;
  discount: number;       // total discount amount
  discountType: "amount" | "percent";
  discountValue: number;
  total: number;
  cost: number;           // total cost of goods (for profit)
  paymentMethod: "cash" | "mobile_money" | "card" | "credit";
  amountPaid: number;
  change: number;
  cashierId: number;
  cashierName: string;
  waiterId?: number;
  waiterName?: string;
  status: "completed" | "voided";
  voidReason?: string;
  voidApprovedBy?: number;
  voidApprovedByName?: string;
  voidedAt?: string;
  createdAt: string;
}

export interface SaleItem {
  productId: number;
  productName: string;
  price: number;
  costPrice: number;
  qty: number;
  lineTotal: number;
}

export interface Payment {
  id?: number;
  saleId: number;
  method: "cash" | "mobile_money" | "card" | "credit";
  amount: number;
  reference?: string;
  createdAt: string;
}

export interface Expense {
  id?: number;
  category: string;       // electricity, transport, cleaning, etc
  description?: string;
  amount: number;
  paidBy?: string;
  date: string;
  createdAt: string;
}

export interface StockMovement {
  id?: number;
  productId: number;
  productName: string;
  type: "sale" | "receiving" | "adjustment" | "void" | "wastage";
  quantityChange: number; // positive = in, negative = out
  reason?: string;
  reference?: string;     // supplier invoice, sale receipt, etc
  supplier?: string;
  invoiceNo?: string;
  costPrice?: number;
  userId?: number;
  userName?: string;
  createdAt: string;
}

export interface AuditLog {
  id?: number;
  userId: number;
  userName: string;
  action: string;        // login, sale, void, discount, stock_adjust, etc
  detail: string;
  entity?: string;       // sale, product, user
  entityId?: string;
  createdAt: string;
}

export interface Setting {
  key: string;
  value: string;
}

export interface Discount {
  id?: number;
  name: string;
  type: "percent" | "amount";
  value: number;
  active: boolean;
  createdAt: string;
}

export class LaGraciaDB extends Dexie {
  users!: Table<User, number>;
  categories!: Table<Category, number>;
  products!: Table<Product, number>;
  customers!: Table<Customer, number>;
  sales!: Table<Sale, number>;
  payments!: Table<Payment, number>;
  expenses!: Table<Expense, number>;
  stockMovements!: Table<StockMovement, number>;
  auditLogs!: Table<AuditLog, number>;
  settings!: Table<Setting, string>;
  discounts!: Table<Discount, number>;

  constructor() {
    super("LaGraciaPOS");
    this.version(1).stores({
      users: "++id, &username, role, active",
      categories: "++id, &name, sortOrder, active",
      products: "++id, name, categoryId, sku, active, stock",
      customers: "++id, name, phone",
      sales: "++id, receiptNo, customerId, cashierId, waiterId, status, paymentMethod, createdAt",
      payments: "++id, saleId, method, createdAt",
      expenses: "++id, category, date, createdAt",
      stockMovements: "++id, productId, type, createdAt",
      auditLogs: "++id, userId, action, entity, createdAt",
      settings: "&key",
      discounts: "++id, name, active",
    });
  }
}

export const db = new LaGraciaDB();

/* ============== Helpers ============== */

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db.settings.get(key);
  if (!row) return fallback;
  try {
    return JSON.parse(row.value) as T;
  } catch {
    return (row.value as unknown) as T;
  }
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await db.settings.put({
    key,
    value: typeof value === "string" ? value : JSON.stringify(value),
  });
}

export async function logAudit(
  userId: number,
  userName: string,
  action: string,
  detail: string,
  entity?: string,
  entityId?: string,
) {
  await db.auditLogs.add({
    userId,
    userName,
    action,
    detail,
    entity,
    entityId,
    createdAt: new Date().toISOString(),
  });
}

let receiptCounter = 0;
export async function nextReceiptNo(): Promise<string> {
  const lastSale = await db.sales.orderBy("id").last();
  let n = 1;
  if (lastSale) {
    const m = /#(\d+)/.exec(lastSale.receiptNo);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  receiptCounter = n;
  return "#" + String(n).padStart(6, "0");
}
