"use client";

/**
 * La Gracia POS — Real-time Sync Client
 *
 * Wires every device into the central server so the Owner Live Dashboard
 * can see what's happening on every phone logged in (cashier/waiter/manager).
 *
 * Architecture:
 *   1. Each device gets a stable deviceId (per-browser, persisted in localStorage).
 *   2. On login, the device opens a Socket.io connection to this same app
 *      (merged into server.js) and emits 'session:join' so the server knows
 *      it's online.
 *   3. When a cashier/waiter completes a sale on this device, the calling code
 *      invokes `pushSale(sale)` which:
 *        a) POSTs the sale to /api/sync/sales (server stores it in Prisma)
 *        b) emits 'sale:new' over the socket (owner dashboard updates instantly)
 *   4. Owner dashboards subscribe via `subscribeOwnerLive()` and re-render on
 *      every 'sale:new', 'audit:new', 'stock:movement', 'presence:list', 'broadcast:new'.
 *   5. Heartbeat keeps the socket alive on mobile networks (Android Chrome will
 *      throttle background tabs; this prevents that).
 */

import { io, type Socket } from "socket.io-client";

/**
 * The Socket.io server is merged into the same Node process/port as the
 * Next.js app (see server.js) — so on a real deployment we just connect
 * same-origin with the default socket.io path. NEXT_PUBLIC_SYNC_URL can
 * override this if the sync layer is ever split into its own service.
 */
const SYNC_URL = process.env.NEXT_PUBLIC_SYNC_URL || undefined;

/* ============================================================
   Device ID — stable per browser
   ============================================================ */
const DEVICE_ID_KEY = "la-gracia-device-id";
const DEVICE_LABEL_KEY = "la-gracia-device-label";

export function getDeviceId(): string {
  if (typeof window === "undefined") return "server";
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id =
      "dev-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10);
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getDeviceLabel(): string {
  if (typeof window === "undefined") return "";
  return localStorage.getItem(DEVICE_LABEL_KEY) || "";
}

export function setDeviceLabel(label: string) {
  if (typeof window === "undefined") return;
  localStorage.setItem(DEVICE_LABEL_KEY, label);
}

/* ============================================================
   Singleton socket
   ============================================================ */
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;
  socket = io(SYNC_URL, {
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 15000,
  });

  socket.on("connect", () => {
    console.log("[sync] socket connected:", socket?.id, "transport:", socket?.io?.engine?.transport?.name);
  });
  socket.on("disconnect", (reason) => {
    console.warn("[sync] socket disconnected:", reason);
  });
  socket.on("connect_error", (err) => {
    console.error("[sync] socket connect_error:", err.message);
  });

  // Heartbeat to keep mobile connections alive
  const heartbeat = setInterval(() => {
    if (socket?.connected) {
      socket.emit("ping", () => {});
    }
  }, 20000);

  return socket;
}

/* ============================================================
   Session presence
   ============================================================ */
export function joinSession(user: {
  id: number;
  username: string;
  fullName: string;
  role: string;
}) {
  const s = getSocket();
  const deviceId = getDeviceId();
  let label = getDeviceLabel();
  if (!label) {
    // Guess a friendly label from UA
    const ua = navigator.userAgent;
    let guess = "Phone";
    if (/android/i.test(ua)) guess = "Android Phone";
    else if (/iphone|ipad|ipod/i.test(ua)) guess = "iOS Device";
    else if (/windows/i.test(ua)) guess = "Windows PC";
    else if (/mac/i.test(ua)) guess = "Mac";
    label = `${user.fullName.split(" ")[0]}'s ${guess}`;
    setDeviceLabel(label);
  }
  s.emit("session:join", {
    userId: user.id,
    userName: user.fullName,
    role: user.role,
    deviceId,
    deviceLabel: label,
  });
}

/* ============================================================
   Push events from cashier/waiter/manager devices → server
   ============================================================ */

export async function pushSale(sale: any) {
  // 1. REST persist
  try {
    const enriched = { ...sale, deviceId: getDeviceId() };
    await fetch("/api/sync/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(enriched),
    });
  } catch (e) {
    console.error("[sync] pushSale REST failed", e);
  }
  // 2. Real-time broadcast
  try {
    const s = getSocket();
    s.emit("sale:new", { ...sale, deviceId: getDeviceId() });
  } catch (e) {
    console.error("[sync] pushSale socket emit failed", e);
  }
}

export async function pushAuditLog(log: any) {
  try {
    await fetch("/api/sync/audit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(log),
    });
  } catch (e) {
    console.error("[sync] pushAuditLog REST failed", e);
  }
  try {
    getSocket().emit("audit:new", log);
  } catch (e) {
    console.error("[sync] pushAuditLog socket emit failed", e);
  }
}

export async function pushStockMovement(movement: any) {
  try {
    await fetch("/api/sync/stock", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(movement),
    });
  } catch (e) {
    console.error("[sync] pushStockMovement REST failed", e);
  }
  try {
    getSocket().emit("stock:movement", movement);
  } catch (e) {
    console.error("[sync] pushStockMovement socket emit failed", e);
  }
}

export function broadcastSaleVoid(payload: {
  receiptNo: string;
  reason: string;
  approvedBy: number;
  approvedByName: string;
  voidedAt: string;
}) {
  getSocket().emit("sale:voided", payload);
}

/* ============================================================
   Owner-side: send a broadcast message to staff
   ============================================================ */
export function sendBroadcast(payload: {
  senderId: number;
  senderName: string;
  message: string;
  audience: "all" | "staff" | "owner";
}) {
  getSocket().emit("broadcast:send", payload);
}

/* ============================================================
   Owner-side: remote commands (force void, force logout)
   ============================================================ */
export function sendOwnerCommand(cmd: { type: string; payload: any }) {
  getSocket().emit("owner:command", cmd);
}

/* ============================================================
   Initial state fetch (for owner dashboard first paint)
   ============================================================ */
export async function fetchInitialState(opts?: { from?: string }): Promise<{
  sales: any[];
  auditLogs: any[];
  stockMovements: any[];
  products: any[];
  broadcasts: any[];
  serverTime: string;
}> {
  const url = new URL("/api/sync/state", window.location.origin);
  if (opts?.from) url.searchParams.set("from", opts.from);
  url.searchParams.set("today", "1");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`fetchInitialState: ${res.status}`);
  return res.json();
}

/* ============================================================
   Push local catalog (users, categories, products) to server
   so the Owner Live Dashboard has product data on first visit.
   Idempotent: server only creates missing rows.
   ============================================================ */
export async function pushLocalCatalogToServer(opts: {
  users: any[];
  categories: any[];
  products: any[];
}) {
  try {
    const productsWithCatName = opts.products.map((p: any) => {
      const cat = opts.categories.find((c: any) => c.id === p.categoryId);
      return { ...p, categoryName: cat?.name };
    });
    const res = await fetch("/api/sync/seed-demo", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        users: opts.users,
        categories: opts.categories,
        products: productsWithCatName,
      }),
    });
    if (!res.ok) throw new Error(`seed-demo: ${res.status}`);
    return await res.json();
  } catch (e) {
    console.error("[sync] pushLocalCatalogToServer failed", e);
    return null;
  }
}
