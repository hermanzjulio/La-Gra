"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User } from "./db";

/* ============================================================
   Global UI store — auth session, active view, cart state.
   Persisted to localStorage so a refresh keeps you logged in.
   ============================================================ */

export type ViewKey =
  | "dashboard"
  | "live-ops"
  | "pos"
  | "products"
  | "categories"
  | "inventory"
  | "stock-receiving"
  | "stock-adjustments"
  | "expenses"
  | "customers"
  | "voids"
  | "staff"
  | "reports"
  | "audit"
  | "settings"
  | "backup";

interface CartLine {
  productId: number;
  productName: string;
  price: number;
  costPrice: number;
  qty: number;
  lineTotal: number;
}

interface AppState {
  /* session */
  currentUser: User | null;
  login: (u: User) => void;
  logout: () => void;

  /* navigation */
  view: ViewKey;
  setView: (v: ViewKey) => void;

  /* cart (POS) */
  cart: CartLine[];
  cartCustomerId?: number;
  cartWaiterId?: number;
  discountValue: number;
  discountType: "amount" | "percent";
  addToCart: (line: Omit<CartLine, "qty" | "lineTotal">, qty?: number) => void;
  updateCartQty: (productId: number, qty: number) => void;
  removeFromCart: (productId: number) => void;
  clearCart: () => void;
  setCartCustomer: (id?: number) => void;
  setCartWaiter: (id?: number) => void;
  setDiscount: (type: "amount" | "percent", value: number) => void;

  /* ui */
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      currentUser: null,
      login: (u) => set({ currentUser: u, view: "dashboard" }),
      logout: () =>
        set({
          currentUser: null,
          view: "dashboard",
          cart: [],
          cartCustomerId: undefined,
          cartWaiterId: undefined,
          discountValue: 0,
          discountType: "amount",
        }),

      view: "dashboard",
      setView: (v) => set({ view: v, sidebarOpen: false }),

      cart: [],
      cartCustomerId: undefined,
      cartWaiterId: undefined,
      discountValue: 0,
      discountType: "amount",

      addToCart: (line, qty = 1) => {
        const cart = [...get().cart];
        const i = cart.findIndex((c) => c.productId === line.productId);
        if (i >= 0) {
          const newQty = cart[i].qty + qty;
          cart[i] = { ...cart[i], qty: newQty, lineTotal: cart[i].price * newQty };
        } else {
          cart.push({ ...line, qty, lineTotal: line.price * qty });
        }
        set({ cart });
      },
      updateCartQty: (productId, qty) => {
        if (qty <= 0) {
          set({ cart: get().cart.filter((c) => c.productId !== productId) });
          return;
        }
        set({
          cart: get().cart.map((c) =>
            c.productId === productId ? { ...c, qty, lineTotal: c.price * qty } : c,
          ),
        });
      },
      removeFromCart: (productId) =>
        set({ cart: get().cart.filter((c) => c.productId !== productId) }),
      clearCart: () =>
        set({
          cart: [],
          cartCustomerId: undefined,
          cartWaiterId: undefined,
          discountValue: 0,
          discountType: "amount",
        }),
      setCartCustomer: (id) => set({ cartCustomerId: id }),
      setCartWaiter: (id) => set({ cartWaiterId: id }),
      setDiscount: (type, value) => set({ discountType: type, discountValue: value }),

      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),
    }),
    {
      name: "lagracia-session",
      partialize: (s) => ({
        currentUser: s.currentUser,
        view: s.view,
      }),
    },
  ),
);

/* ============ Permission helpers ============ */

export function can(user: User | null, action: string): boolean {
  if (!user) return false;
  const role = user.role;
  const matrix: Record<string, UserRole[]> = {
    /* dashboard */
    "view.dashboard": ["owner", "manager", "cashier", "waiter"],
    "view.live_ops": ["owner"],
    "view.reports": ["owner", "manager"],
    "view.audit": ["owner", "manager"],
    "view.staff": ["owner", "manager"],
    "view.settings": ["owner", "manager"],
    "view.backup": ["owner", "manager"],

    /* pos */
    "pos.sell": ["owner", "manager", "cashier", "waiter"],
    "pos.void": ["owner", "manager"],
    "pos.discount": ["owner", "manager", "cashier"],

    /* inventory */
    "inventory.view": ["owner", "manager", "cashier", "waiter"],
    "inventory.receive": ["owner", "manager"],
    "inventory.adjust": ["owner", "manager"],
    "products.manage": ["owner", "manager"],
    "categories.manage": ["owner", "manager"],

    /* expenses */
    "expenses.manage": ["owner", "manager"],

    /* customers */
    "customers.manage": ["owner", "manager", "cashier"],
  };
  const allowed = matrix[action];
  if (!allowed) return false;
  return allowed.includes(role);
}
