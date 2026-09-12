"use client";

/**
 * La Gracia Lounge POS — Owner Live Dashboard
 *
 * Real-time, multi-device dashboard for the business owner. While cashiers,
 * waiters, and managers go about their shifts on other phones, the owner can
 * log in from anywhere and watch everything happening across the business:
 *
 *   • Online staff list (who's currently logged in, from which device)
 *   • Live sales feed (every new sale pops in instantly as it happens)
 *   • Today's revenue, profit, item count, average sale — aggregated across ALL devices
 *   • Per-cashier performance leaderboard
 *   • Payment-method breakdown
 *   • Low stock alerts
 *   • Quick controls: broadcast a message to all staff, or trigger a void request
 *
 * The view polls /api/sync/state on mount to backfill from server-side storage
 * and then subscribes to socket events for live updates. It is owner-only.
 */

import { useEffect, useMemo, useState, useRef, useCallback } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { useStore } from "@/lib/store";
import {
  getSocket,
  fetchInitialState,
  sendBroadcast,
  broadcastSaleVoid,
} from "@/lib/sync";
import { formatUGX, formatNumber, isSameDay } from "@/lib/format";
import {
  Radio,
  Users,
  TrendingUp,
  DollarSign,
  ShoppingCart,
  Package,
  Wifi,
  WifiOff,
  Crown,
  Activity,
  Send,
  AlertTriangle,
  Receipt,
  ArrowUpRight,
  Bell,
  Megaphone,
  CheckCircle2,
  Clock,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";

interface PresenceUser {
  userId: number;
  userName: string;
  role: string;
  deviceId: string;
  deviceLabel?: string;
  status: "online" | "offline";
  lastSeen: string;
}

interface LiveSale {
  id?: number;
  receiptNo: string;
  cashierId: number;
  cashierName: string;
  waiterId?: number;
  waiterName?: string;
  items: any[];
  subtotal: number;
  discount: number;
  total: number;
  cost: number;
  paymentMethod: "cash" | "mobile_money" | "card" | "credit";
  amountPaid: number;
  change: number;
  status: "completed" | "voided";
  voidReason?: string;
  createdAt: string;
  voidedAt?: string;
  deviceId?: string;
}

interface LiveAudit {
  id?: number;
  userId?: number;
  userName: string;
  action: string;
  detail: string;
  entity?: string;
  entityId?: string;
  createdAt: string;
}

interface LiveMovement {
  id?: number;
  productId: number;
  productName: string;
  type: string;
  quantityChange: number;
  reason?: string;
  userName?: string;
  createdAt: string;
}

interface ServerProduct {
  id: number;
  name: string;
  stock: number;
  reorderLevel: number;
  active: boolean;
}

interface BroadcastMsg {
  id: string;
  senderName: string;
  message: string;
  audience: string;
  createdAt: string;
}

export function LiveOps() {
  const { currentUser } = useStore();

  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [sales, setSales] = useState<LiveSale[]>([]);
  const [audits, setAudits] = useState<LiveAudit[]>([]);
  const [movements, setMovements] = useState<LiveMovement[]>([]);
  const [products, setProducts] = useState<ServerProduct[]>([]);
  const [broadcasts, setBroadcasts] = useState<BroadcastMsg[]>([]);
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(true);

  // Broadcast composer state
  const [bcMessage, setBcMessage] = useState("");
  const [bcAudience, setBcAudience] = useState<"all" | "staff" | "owner">("all");

  // Live notifications
  const [toasts, setToasts] = useState<
    { id: string; msg: string; tone: "sale" | "audit" | "broadcast" }[]
  >([]);

  // Refs to avoid stale closures
  const salesRef = useRef<LiveSale[]>(sales);
  salesRef.current = sales;

  /* ----------------------------------------------------------
     Initial backfill from /api/sync/state
     ---------------------------------------------------------- */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const state = await fetchInitialState();
        if (!mounted) return;
        setSales(state.sales as LiveSale[]);
        setAudits(state.auditLogs as LiveAudit[]);
        setMovements(state.stockMovements as LiveMovement[]);
        setProducts(state.products as ServerProduct[]);
        setBroadcasts(state.broadcasts as BroadcastMsg[]);
      } catch (e) {
        console.error("fetchInitialState failed", e);
        toast.error("Failed to load live state — showing partial data");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  /* ----------------------------------------------------------
     Socket subscriptions for live updates
     + REST polling fallback (every 5s) in case WebSocket is
     not reachable through the gateway.
     ---------------------------------------------------------- */
  useEffect(() => {
    if (!currentUser) return;
    const s = getSocket();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);
    s.on("connect", onConnect);
    s.on("disconnect", onDisconnect);
    // Defer to avoid setState-in-effect warning
    setTimeout(() => setConnected(s.connected), 0);

    const onPresence = (list: PresenceUser[]) => setPresence(list);

    const onSaleNew = (sale: LiveSale) => {
      setSales((prev) => {
        // De-dupe by receiptNo
        if (prev.some((s) => s.receiptNo === sale.receiptNo)) return prev;
        return [sale, ...prev].slice(0, 500);
      });
      // Push a transient toast
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) =>
        [
          {
            id,
            msg: `${sale.cashierName} just sold ${formatUGX(sale.total)} (${sale.receiptNo})`,
            tone: "sale" as const,
          },
          ...prev,
        ].slice(0, 5),
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 8000);
    };

    const onSaleVoided = (data: any) => {
      setSales((prev) =>
        prev.map((s) =>
          s.receiptNo === data.receiptNo
            ? {
                ...s,
                status: "voided",
                voidReason: data.reason,
                voidedAt: data.voidedAt,
              }
            : s,
        ),
      );
    };

    const onAuditNew = (log: LiveAudit) => {
      setAudits((prev) => [log, ...prev].slice(0, 200));
    };

    const onStockMovement = (m: LiveMovement) => {
      setMovements((prev) => [m, ...prev].slice(0, 200));
      setProducts((prev) =>
        prev.map((p) =>
          p.id === m.productId
            ? { ...p, stock: Math.max(0, p.stock + m.quantityChange) }
            : p,
        ),
      );
    };

    const onBroadcast = (b: BroadcastMsg) => {
      setBroadcasts((prev) => [b, ...prev].slice(0, 50));
      if (b.senderName !== currentUser?.fullName) {
        toast(`📢 ${b.senderName}: ${b.message}`);
      }
    };

    s.on("presence:list", onPresence);
    s.on("sale:new", onSaleNew);
    s.on("sale:voided", onSaleVoided);
    s.on("audit:new", onAuditNew);
    s.on("stock:movement", onStockMovement);
    s.on("broadcast:new", onBroadcast);

    // REST polling fallback — refresh state every 5 seconds.
    // This guarantees the owner dashboard shows updates even if the
    // socket connection is unavailable (mobile network restrictions,
    // corporate proxies, gateway quirks). The owner will still see
    // near-real-time data (≤5s lag).
    const lastRefresh = { time: Date.now() };
    const pollInterval = setInterval(async () => {
      try {
        const state = await fetchInitialState({
          from: new Date(lastRefresh.time - 60_000).toISOString(),
        });
        lastRefresh.time = Date.now();
        // Merge in new sales (by receiptNo)
        setSales((prev) => {
          const existing = new Set(prev.map((s) => s.receiptNo));
          const fresh = state.sales.filter(
            (s: LiveSale) => !existing.has(s.receiptNo),
          );
          if (fresh.length === 0) return prev;
          // Show a toast for the newest one
          const newest = fresh[0];
          if (newest) {
            const id = `poll-${newest.receiptNo}-${Date.now()}`;
            setToasts((prev) =>
              [
                {
                  id,
                  msg: `${newest.cashierName} just sold ${formatUGX(newest.total)} (${newest.receiptNo})`,
                  tone: "sale" as const,
                },
                ...prev,
              ].slice(0, 5),
            );
            setTimeout(
              () => setToasts((prev) => prev.filter((t) => t.id !== id)),
              8000,
            );
          }
          return [...fresh, ...prev].slice(0, 500);
        });
        // Update audits
        setAudits((prev) => {
          const existing = new Set(prev.map((a) => `${a.action}|${a.detail}|${a.createdAt}`));
          const fresh = state.auditLogs.filter(
            (a: LiveAudit) => !existing.has(`${a.action}|${a.detail}|${a.createdAt}`),
          );
          return fresh.length ? [...fresh, ...prev].slice(0, 200) : prev;
        });
        // Update movements
        setMovements((prev) => {
          const existing = new Set(prev.map((m) => `${m.productId}|${m.type}|${m.createdAt}`));
          const fresh = state.stockMovements.filter(
            (m: LiveMovement) => !existing.has(`${m.productId}|${m.type}|${m.createdAt}`),
          );
          return fresh.length ? [...fresh, ...prev].slice(0, 200) : prev;
        });
        // Refresh product stock levels
        if (state.products.length) {
          setProducts(state.products as ServerProduct[]);
        }
      } catch (e) {
        // Silent — will retry next interval
      }
    }, 5000);

    return () => {
      s.off("connect", onConnect);
      s.off("disconnect", onDisconnect);
      s.off("presence:list", onPresence);
      s.off("sale:new", onSaleNew);
      s.off("sale:voided", onSaleVoided);
      s.off("audit:new", onAuditNew);
      s.off("stock:movement", onStockMovement);
      s.off("broadcast:new", onBroadcast);
      clearInterval(pollInterval);
    };
  }, [currentUser]);

  /* ----------------------------------------------------------
     Derived metrics
     ---------------------------------------------------------- */
  const todaySales = useMemo(
    () => sales.filter((s) => s.status === "completed" && isSameDay(s.createdAt, new Date())),
    [sales],
  );

  const todayRevenue = todaySales.reduce((s, x) => s + x.total, 0);
  const todayCost = todaySales.reduce((s, x) => s + x.cost, 0);
  const todayGrossProfit = todayRevenue - todayCost;
  const todayQty = todaySales.reduce(
    (s, x) => s + x.items.reduce((a, b) => a + b.qty, 0),
    0,
  );
  const avgSale = todaySales.length ? todayRevenue / todaySales.length : 0;
  const margin = todayRevenue > 0 ? Math.round((todayGrossProfit / todayRevenue) * 100) : 0;

  const staffPerf = useMemo(() => {
    const map: Record<string, { name: string; count: number; revenue: number }> = {};
    for (const s of todaySales) {
      const key = s.cashierName;
      if (!map[key]) map[key] = { name: key, count: 0, revenue: 0 };
      map[key].count += 1;
      map[key].revenue += s.total;
    }
    return Object.values(map).sort((a, b) => b.revenue - a.revenue);
  }, [todaySales]);

  const paymentBreakdown = useMemo(() => {
    const bd: Record<string, number> = { cash: 0, mobile_money: 0, card: 0, credit: 0 };
    for (const s of todaySales) {
      bd[s.paymentMethod] = (bd[s.paymentMethod] || 0) + s.total;
    }
    return Object.entries(bd)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({
        name: k.replace("_", " ").toUpperCase(),
        value: v,
        key: k,
      }));
  }, [todaySales]);

  const lowStock = useMemo(
    () =>
      products
        .filter((p) => p.active && p.reorderLevel > 0 && p.stock <= p.reorderLevel)
        .sort((a, b) => a.stock - b.stock),
    [products],
  );

  const recentSales = useMemo(() => sales.slice(0, 30), [sales]);
  const recentAudits = useMemo(() => audits.slice(0, 20), [audits]);
  const recentMovements = useMemo(() => movements.slice(0, 15), [movements]);

  /* ----------------------------------------------------------
     Handlers
     ---------------------------------------------------------- */
  const handleBroadcast = useCallback(() => {
    if (!currentUser) return;
    if (!bcMessage.trim()) {
      toast.error("Message cannot be empty");
      return;
    }
    sendBroadcast({
      senderId: currentUser.id!,
      senderName: currentUser.fullName,
      message: bcMessage.trim(),
      audience: bcAudience,
    });
    setBcMessage("");
    toast.success("Broadcast sent");
  }, [bcMessage, bcAudience, currentUser]);

  const handleRemoteVoid = useCallback(
    (sale: LiveSale) => {
      if (!currentUser) return;
      if (!confirm(`Void sale ${sale.receiptNo} (${formatUGX(sale.total)})?`)) return;
      const payload = {
        receiptNo: sale.receiptNo,
        reason: `Remote void by owner (${currentUser.fullName})`,
        approvedBy: currentUser.id!,
        approvedByName: currentUser.fullName,
        voidedAt: new Date().toISOString(),
      };
      broadcastSaleVoid(payload);
      setSales((prev) =>
        prev.map((s) =>
          s.receiptNo === sale.receiptNo
            ? { ...s, status: "voided", voidReason: payload.reason, voidedAt: payload.voidedAt }
            : s,
        ),
      );
      toast.success(`Sale ${sale.receiptNo} voided`);
    },
    [currentUser],
  );

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-muted-foreground">
        <div className="flex items-center gap-3">
          <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Connecting to live feed…
        </div>
      </div>
    );
  }

  const paymentColors: Record<string, string> = {
    cash: "#c9a227",
    mobile_money: "#4a9eff",
    card: "#a855f7",
    credit: "#ef4444",
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Radio className="h-6 w-6 text-primary animate-pulse" />
            <h1 className="text-2xl font-bold tracking-tight">
              Live Operations
            </h1>
            <Badge
              variant={connected ? "default" : "destructive"}
              className={`ml-2 gap-1 ${
                connected
                  ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/20"
                  : ""
              }`}
            >
              {connected ? (
                <>
                  <Wifi className="h-3 w-3" /> Live
                </>
              ) : (
                <>
                  <WifiOff className="h-3 w-3" /> Reconnecting…
                </>
              )}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground">
            Remote, real-time view of every device logged into the system.
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase tracking-widest text-muted-foreground">
            Owner
          </p>
          <p className="text-sm font-semibold text-primary">
            {currentUser?.fullName}
          </p>
        </div>
      </div>

      {/* Live toast stack (transient) */}
      <div className="fixed right-4 top-20 z-50 flex w-80 flex-col gap-2">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`flex items-start gap-3 rounded-lg border p-3 shadow-lg backdrop-blur-md animate-in slide-in-from-right ${
              t.tone === "sale"
                ? "border-emerald-500/40 bg-emerald-950/80"
                : t.tone === "audit"
                  ? "border-blue-500/40 bg-blue-950/80"
                  : "border-amber-500/40 bg-amber-950/80"
            }`}
          >
            <div className="mt-0.5">
              {t.tone === "sale" ? (
                <ShoppingCart className="h-4 w-4 text-emerald-400" />
              ) : t.tone === "audit" ? (
                <Activity className="h-4 w-4 text-blue-400" />
              ) : (
                <Megaphone className="h-4 w-4 text-amber-400" />
              )}
            </div>
            <p className="text-sm text-white">{t.msg}</p>
          </div>
        ))}
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Today's Revenue (All Devices)"
          value={formatUGX(todayRevenue)}
          delta={`${todaySales.length} sales`}
          icon={DollarSign}
          tone="gold"
        />
        <KpiCard
          label="Gross Profit"
          value={formatUGX(todayGrossProfit)}
          delta={`${margin}% margin`}
          icon={TrendingUp}
          tone="green"
        />
        <KpiCard
          label="Items Sold"
          value={formatNumber(todayQty)}
          delta={`avg ${formatUGX(avgSale)}`}
          icon={Package}
          tone="gold"
        />
        <KpiCard
          label="Online Now"
          value={`${presence.filter((p) => p.status === "online").length}`}
          delta={`${presence.length} total today`}
          icon={Users}
          tone="green"
        />
      </div>

      {/* Main grid */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* LIVE SALES FEED */}
        <Card className="lg:col-span-2 bg-card-gradient border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                </span>
                Live Sales Feed
              </CardTitle>
              <CardDescription>Most recent sales across all devices</CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">
              {recentSales.length} shown
            </Badge>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[420px] px-6 pb-4">
              {recentSales.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted-foreground">
                  No sales yet today. When a cashier completes a sale, it will appear here instantly.
                </p>
              ) : (
                <div className="space-y-2">
                  {recentSales.map((s) => {
                    const age = Date.now() - new Date(s.createdAt).getTime();
                    const ageMin = Math.floor(age / 60000);
                    const ageStr =
                      ageMin < 1 ? "just now" : ageMin < 60 ? `${ageMin}m ago` : `${Math.floor(ageMin / 60)}h ago`;
                    return (
                      <div
                        key={s.receiptNo + s.createdAt}
                        className={`flex items-center justify-between rounded-lg border p-3 transition-colors ${
                          ageMin < 1
                            ? "border-emerald-500/50 bg-emerald-500/5 animate-in fade-in"
                            : s.status === "voided"
                              ? "border-red-500/30 bg-red-950/20"
                              : "border-border bg-background/30"
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{s.receiptNo}</p>
                            <Badge variant="outline" className="text-[9px] h-4 px-1">
                              {s.paymentMethod.replace("_", " ").toUpperCase()}
                            </Badge>
                            {ageMin < 1 && (
                              <Badge className="bg-emerald-500/20 text-emerald-400 text-[9px] h-4 px-1">
                                NEW
                              </Badge>
                            )}
                            {s.status === "voided" && (
                              <Badge variant="destructive" className="text-[9px] h-4 px-1">
                                VOIDED
                              </Badge>
                            )}
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">
                            <span className="text-amber-400">{s.cashierName}</span>
                            {s.waiterName ? ` / waiter: ${s.waiterName}` : ""} · {ageStr}
                            {s.deviceId ? ` · ${s.deviceId.slice(0, 8)}` : ""}
                          </p>
                          <p className="mt-0.5 truncate text-[10px] text-muted-foreground">
                            {s.items.map((it: any) => `${it.qty}× ${it.productName}`).join(", ")}
                          </p>
                        </div>
                        <div className="ml-3 flex flex-col items-end gap-1">
                          <p className="text-sm font-bold text-primary">{formatUGX(s.total)}</p>
                          {s.status !== "voided" && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px] text-red-400 hover:bg-red-950/30"
                              onClick={() => handleRemoteVoid(s)}
                            >
                              Void
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        {/* ONLINE STAFF */}
        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="h-4 w-4 text-primary" /> Online Staff
            </CardTitle>
            <CardDescription>Devices currently connected</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {presence.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No staff online. When someone logs in from another phone, they'll show up here.
              </p>
            ) : (
              presence
                .slice()
                .sort((a, b) =>
                  a.status === b.status ? 0 : a.status === "online" ? -1 : 1,
                )
                .map((p) => (
                  <div
                    key={p.deviceId}
                    className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            p.status === "online" ? "bg-emerald-500" : "bg-muted-foreground"
                          }`}
                        />
                        <p className="truncate text-sm font-medium">{p.userName}</p>
                      </div>
                      <p className="truncate text-[10px] text-muted-foreground">
                        {p.role.toUpperCase()} · {p.deviceLabel || p.deviceId.slice(0, 12)}
                      </p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[9px] ${
                        p.status === "online"
                          ? "border-emerald-500/40 text-emerald-400"
                          : "text-muted-foreground"
                      }`}
                    >
                      {p.status === "online" ? "ONLINE" : "OFFLINE"}
                    </Badge>
                  </div>
                ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff leaderboard + payment breakdown + low stock */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Crown className="h-4 w-4 text-primary" /> Cashier Leaderboard — Today
            </CardTitle>
            <CardDescription>Revenue by staff member</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffPerf.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No cashier sales yet today.
              </p>
            ) : (
              staffPerf.map((s, i) => {
                const max = staffPerf[0].revenue || 1;
                return (
                  <div key={s.name} className="flex items-center gap-3">
                    <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex items-center justify-between">
                        <p className="truncate text-sm font-medium">{s.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.count} sales · {formatUGX(s.revenue)}
                        </p>
                      </div>
                      <Progress value={(s.revenue / max) * 100} className="h-1.5" />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Payment Methods Today</CardTitle>
            <CardDescription>Across all devices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {paymentBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales yet</p>
            ) : (
              paymentBreakdown.map((p) => (
                <div key={p.key} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: paymentColors[p.key] }} />
                    <span className="text-muted-foreground">{p.name}</span>
                  </div>
                  <span className="font-medium">{formatUGX(p.value)}</span>
                </div>
              ))
            )}
            <div className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
              <div className="flex justify-between">
                <span>Total processed</span>
                <span className="font-semibold text-primary">{formatUGX(todayRevenue)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="h-4 w-4 text-amber-500" /> Stock Alerts
            </CardTitle>
            <Badge variant="secondary" className="text-xs">{lowStock.length}</Badge>
          </CardHeader>
          <CardContent className="space-y-2 max-h-72 overflow-y-auto">
            {lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">All stock levels OK</p>
            ) : (
              lowStock.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">Reorder at {p.reorderLevel}</p>
                  </div>
                  <Badge
                    variant={p.stock === 0 ? "destructive" : "secondary"}
                    className="ml-2"
                  >
                    {p.stock === 0 ? "OUT" : p.stock <= p.reorderLevel / 2 ? "CRITICAL" : "LOW"} · {p.stock}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Broadcast composer + audit feed */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-primary" /> Broadcast a Message
            </CardTitle>
            <CardDescription>Send instantly to logged-in devices</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Audience</Label>
              <Select
                value={bcAudience}
                onValueChange={(v: "all" | "staff" | "owner") => setBcAudience(v)}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All devices</SelectItem>
                  <SelectItem value="staff">Staff only (no owners)</SelectItem>
                  <SelectItem value="owner">Owners only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground" htmlFor="bc-message">Message</Label>
              <Input
                id="bc-message"
                value={bcMessage}
                onChange={(e) => setBcMessage(e.target.value)}
                placeholder="e.g. 'Happy hour starts in 10 minutes — push beer promos!'"
                className="mt-1"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleBroadcast();
                  }
                }}
              />
            </div>
            <Button
              onClick={handleBroadcast}
              disabled={!bcMessage.trim()}
              className="w-full bg-gold-gradient text-black hover:opacity-90"
            >
              <Send className="mr-2 h-4 w-4" /> Send Broadcast
            </Button>

            <div className="mt-4 space-y-2">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Recent broadcasts
              </p>
              {broadcasts.length === 0 ? (
                <p className="py-2 text-xs text-muted-foreground">No broadcasts yet</p>
              ) : (
                broadcasts.slice(0, 5).map((b) => (
                  <div key={b.id} className="rounded-lg border border-border bg-background/30 p-2">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                      <span>{b.senderName}</span>
                      <Badge variant="outline" className="text-[9px] h-4 px-1">{b.audience}</Badge>
                    </div>
                    <p className="mt-1 text-sm">{b.message}</p>
                    <p className="mt-0.5 text-[10px] text-muted-foreground">
                      {new Date(b.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="h-4 w-4 text-primary" /> Activity Stream
            </CardTitle>
            <CardDescription>Logins, sales, voids, stock changes — live</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <ScrollArea className="h-[300px] px-6 pb-4">
              {recentAudits.length === 0 && recentMovements.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No activity yet. As staff log in and make sales, you'll see the stream here.
                </p>
              ) : (
                <div className="space-y-1">
                  {/* Merge audits and movements into a single timeline */}
                  {[
                    ...recentAudits.map((a) => ({
                      kind: "audit" as const,
                      when: a.createdAt,
                      who: a.userName,
                      what: a.detail,
                      tag: a.action,
                    })),
                    ...recentMovements.map((m) => ({
                      kind: "movement" as const,
                      when: m.createdAt,
                      who: m.userName ?? "Unknown",
                      what: `${m.type === "sale" ? "Sold" : m.type === "receiving" ? "Received" : m.type === "adjustment" ? "Adjusted" : m.type}: ${m.quantityChange > 0 ? "+" : ""}${m.quantityChange} × ${m.productName}${m.reason ? ` — ${m.reason}` : ""}`,
                      tag: m.type,
                    })),
                  ]
                    .sort((a, b) => b.when.localeCompare(a.when))
                    .slice(0, 25)
                    .map((evt, i) => {
                      const when = new Date(evt.when);
                      return (
                        <div
                          key={i}
                          className="flex items-start gap-3 border-b border-border/40 py-2 last:border-0"
                        >
                          <div className="mt-0.5">
                            {evt.kind === "audit" ? (
                              <Activity className="h-3.5 w-3.5 text-blue-400" />
                            ) : (
                              <Package className="h-3.5 w-3.5 text-amber-400" />
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm">
                              <span className="font-medium text-amber-300">{evt.who}</span>{" "}
                              <span className="text-muted-foreground">{evt.what}</span>
                            </p>
                            <p className="text-[10px] text-muted-foreground">
                              {when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                              {" · "}
                              <Badge variant="outline" className="ml-1 text-[9px] h-4 px-1">
                                {evt.tag}
                              </Badge>
                            </p>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  delta,
  icon: Icon,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  icon: any;
  tone: "gold" | "green" | "red";
}) {
  const toneClass = {
    gold: "text-primary bg-primary/10",
    green: "text-emerald-400 bg-emerald-500/10",
    red: "text-red-400 bg-red-500/10",
  }[tone];
  return (
    <Card className="bg-card-gradient border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{delta}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
