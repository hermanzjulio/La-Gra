/**
 * La Gracia POS — Production server
 *
 * Runs the Next.js app and the real-time Socket.io layer on ONE process /
 * ONE port, so the whole system deploys as a single ordinary Node service.
 *
 * This replaces the sandbox-only setup (separate mini-service on port 3004,
 * reached through a sandbox-specific Caddy "?XTransformPort=" proxy trick).
 * That trick only exists inside the Z.ai sandbox — it will not work on a
 * real host. This file is the portable replacement.
 *
 * Why not Vercel: Vercel's functions are serverless/stateless and cannot
 * hold a persistent Socket.io connection or an on-disk SQLite file. Any
 * host that runs a normal long-lived Node process works: Render, Railway,
 * Fly.io, a VPS, DigitalOcean App Platform, etc. See DEPLOY.md.
 */

const { createServer } = require("http");
const next = require("next");
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = parseInt(process.env.PORT || "3000", 10);

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

/** In-memory presence store (per-process; fine for a single instance). */
const presence = new Map();

function presenceList() {
  return Array.from(presence.values()).map((p) => ({
    userId: p.userId,
    userName: p.userName,
    role: p.role,
    deviceId: p.deviceId,
    deviceLabel: p.deviceLabel,
    status: p.status,
    lastSeen: p.lastSeen.toISOString(),
  }));
}

app.prepare().then(() => {
  const httpServer = createServer((req, res) => handle(req, res));

  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    pingTimeout: 60000,
    pingInterval: 25000,
  });

  io.on("connection", (socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    function broadcastPresence() {
      io.emit("presence:list", presenceList());
    }

    socket.on("session:join", (data) => {
      presence.set(socket.id, {
        userId: data.userId,
        userName: data.userName,
        role: data.role,
        deviceId: data.deviceId,
        deviceLabel: data.deviceLabel,
        status: "online",
        lastSeen: new Date(),
      });
      console.log(`[session] ${data.userName} (${data.role}) joined from ${data.deviceLabel || data.deviceId}`);
      broadcastPresence();
      socket.emit("presence:list", presenceList());
    });

    socket.on("sale:new", (sale) => {
      io.emit("sale:new", sale);
      console.log(`[sale:new] ${sale?.receiptNo} · ${sale?.total} · by ${sale?.cashierName}`);
    });

    socket.on("sale:voided", (data) => {
      io.emit("sale:voided", data);
      console.log(`[sale:voided] ${data?.receiptNo} — ${data?.reason}`);
    });

    socket.on("audit:new", (log) => {
      io.emit("audit:new", log);
      console.log(`[audit:new] ${log?.userName} — ${log?.action} — ${log?.detail}`);
    });

    socket.on("stock:movement", (movement) => {
      io.emit("stock:movement", movement);
      console.log(`[stock:movement] ${movement?.productName} ${movement?.quantityChange > 0 ? "+" : ""}${movement?.quantityChange} (${movement?.type})`);
    });

    socket.on("broadcast:send", (data) => {
      const payload = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        senderId: data.senderId,
        senderName: data.senderName,
        message: data.message,
        audience: data.audience || "all",
        createdAt: new Date().toISOString(),
      };
      if (payload.audience === "owner") {
        for (const [sid, rec] of presence) {
          if (rec.role === "owner") io.to(sid).emit("broadcast:new", payload);
        }
      } else if (payload.audience === "staff") {
        for (const [sid, rec] of presence) {
          if (rec.role !== "owner") io.to(sid).emit("broadcast:new", payload);
        }
      } else {
        io.emit("broadcast:new", payload);
      }
      console.log(`[broadcast] (${payload.audience}) ${payload.senderName}: ${payload.message}`);
    });

    socket.on("owner:command", (cmd) => {
      io.emit("owner:command", cmd);
    });

    socket.on("ping", (ack) => {
      const rec = presence.get(socket.id);
      if (rec) rec.lastSeen = new Date();
      if (typeof ack === "function") ack();
    });

    socket.on("disconnect", () => {
      const rec = presence.get(socket.id);
      if (rec) {
        presence.delete(socket.id);
        console.log(`[session] ${rec.userName} disconnected`);
        broadcastPresence();
      } else {
        console.log(`[socket] disconnected: ${socket.id}`);
      }
    });

    socket.on("error", (err) => {
      console.error(`[socket] error on ${socket.id}:`, err);
    });
  });

  httpServer.listen(port, hostname, () => {
    console.log(`✓ La Gracia POS ready on http://${hostname}:${port}`);
  });

  const shutdown = (sig) => {
    console.log(`\nReceived ${sig}, shutting down…`);
    io.close(() => httpServer.close(() => process.exit(0)));
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
});
