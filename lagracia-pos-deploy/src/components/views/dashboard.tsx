"use client";

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX, isSameDay, isThisWeek, isThisMonth, formatNumber } from "@/lib/format";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  TrendingUp,
  TrendingDown,
  DollarSign,
  ShoppingCart,
  Package,
  AlertTriangle,
  Wallet,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  Clock,
  Crown,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
  Cell,
} from "recharts";

export function Dashboard() {
  const { currentUser, setView } = useStore();

  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const users = useLiveQuery(() => db.users.toArray(), []);

  if (!sales || !products || !expenses) {
    return <div className="flex h-64 items-center justify-center text-muted-foreground">Loading dashboard…</div>;
  }

  const today = new Date();
  const todaySales = sales.filter(
    (s) => s.status === "completed" && isSameDay(s.createdAt, today),
  );
  const weekSales = sales.filter((s) => s.status === "completed" && isThisWeek(s.createdAt));
  const monthSales = sales.filter((s) => s.status === "completed" && isThisMonth(s.createdAt));

  const todayRevenue = todaySales.reduce((sum, s) => sum + s.total, 0);
  const todayCost = todaySales.reduce((sum, s) => sum + s.cost, 0);
  const todayGrossProfit = todayRevenue - todayCost;
  const todayExpenses = expenses
    .filter((e) => isSameDay(e.date, today.toISOString().slice(0, 10)))
    .reduce((sum, e) => sum + e.amount, 0);
  const todayNetProfit = todayGrossProfit - todayExpenses;
  const todayQty = todaySales.reduce((sum, s) => sum + s.items.reduce((a, b) => a + b.qty, 0), 0);

  // 7-day revenue trend
  const last7Days: { label: string; revenue: number; profit: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dayS = sales.filter((s) => s.status === "completed" && isSameDay(s.createdAt, d));
    const rev = dayS.reduce((sum, s) => sum + s.total, 0);
    const cost = dayS.reduce((sum, s) => sum + s.cost, 0);
    last7Days.push({
      label: d.toLocaleDateString("en-GB", { weekday: "short" }),
      revenue: rev,
      profit: rev - cost,
    });
  }

  // Top products today
  const productSales: Record<string, { name: string; qty: number; revenue: number }> = {};
  for (const s of todaySales) {
    for (const it of s.items) {
      if (!productSales[it.productId]) {
        productSales[it.productId] = { name: it.productName, qty: 0, revenue: 0 };
      }
      productSales[it.productId].qty += it.qty;
      productSales[it.productId].revenue += it.lineTotal;
    }
  }
  const topProducts = Object.values(productSales).sort((a, b) => b.qty - a.qty).slice(0, 5);

  // Payment breakdown
  const paymentBreakdown: Record<string, number> = { cash: 0, mobile_money: 0, card: 0, credit: 0 };
  for (const s of todaySales) {
    paymentBreakdown[s.paymentMethod] = (paymentBreakdown[s.paymentMethod] || 0) + s.total;
  }
  const paymentData = Object.entries(paymentBreakdown)
    .filter(([_, v]) => v > 0)
    .map(([k, v]) => ({ name: k.replace("_", " ").toUpperCase(), value: v, key: k }));
  const paymentColors: Record<string, string> = {
    cash: "#c9a227",
    mobile_money: "#4a9eff",
    card: "#a855f7",
    credit: "#ef4444",
  };

  // Low stock alerts
  const lowStock = products
    .filter((p) => p.active && p.reorderLevel > 0 && p.stock <= p.reorderLevel)
    .sort((a, b) => a.stock - b.stock);

  // Recent sales
  const recent = [...sales].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6);

  // Staff performance
  const staffSales: Record<string, { name: string; count: number; revenue: number }> = {};
  for (const s of todaySales) {
    const key = s.cashierName;
    if (!staffSales[key]) staffSales[key] = { name: key, count: 0, revenue: 0 };
    staffSales[key].count += 1;
    staffSales[key].revenue += s.total;
  }
  const staffRanking = Object.values(staffSales).sort((a, b) => b.revenue - a.revenue);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Welcome back, <span className="text-gold-gradient">{currentUser?.fullName.split(" ")[0]}</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            {today.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
        <Button onClick={() => setView("pos")} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <ShoppingCart className="mr-2 h-4 w-4" /> New Sale
        </Button>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Today's Sales"
          value={formatUGX(todayRevenue)}
          delta={`${todaySales.length} sales`}
          icon={DollarSign}
          tone="gold"
        />
        <KpiCard
          label="Gross Profit"
          value={formatUGX(todayGrossProfit)}
          delta={`${todayRevenue > 0 ? Math.round((todayGrossProfit / todayRevenue) * 100) : 0}% margin`}
          icon={TrendingUp}
          tone="green"
        />
        <KpiCard
          label="Expenses"
          value={formatUGX(todayExpenses)}
          delta={`${expenses.filter((e) => isSameDay(e.date, today.toISOString().slice(0, 10))).length} entries`}
          icon={Receipt}
          tone="red"
        />
        <KpiCard
          label="Est. Net Profit"
          value={formatUGX(todayNetProfit)}
          delta={todayNetProfit >= 0 ? "Profit" : "Loss"}
          icon={Wallet}
          tone={todayNetProfit >= 0 ? "green" : "red"}
        />
      </div>

      {/* Secondary KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStat label="Items Sold Today" value={formatNumber(todayQty)} icon={Package} />
        <MiniStat label="Avg. Sale Value" value={formatUGX(todaySales.length ? todayRevenue / todaySales.length : 0)} icon={TrendingUp} />
        <MiniStat label="This Week Revenue" value={formatUGX(weekSales.reduce((s, x) => s + x.total, 0))} icon={DollarSign} />
        <MiniStat label="This Month Revenue" value={formatUGX(monthSales.reduce((s, x) => s + x.total, 0))} icon={DollarSign} />
      </div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base">7-Day Revenue & Profit</CardTitle>
            <CardDescription>Daily performance overview</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={last7Days} margin={{ left: -10, right: 10, top: 10 }}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#c9a227" stopOpacity={0.6} />
                    <stop offset="95%" stopColor="#c9a227" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="profitGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.5} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="label" stroke="#888" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} />
                <Tooltip
                  contentStyle={{
                    background: "#1a1612",
                    border: "1px solid rgba(201,162,39,0.3)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => formatUGX(v)}
                />
                <Area type="monotone" dataKey="revenue" stroke="#c9a227" strokeWidth={2} fill="url(#revGrad)" name="Revenue" />
                <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#profitGrad)" name="Profit" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base">Payment Methods</CardTitle>
            <CardDescription>Today's breakdown</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentData.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">No sales yet today</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={paymentData} layout="vertical" margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis type="category" dataKey="name" stroke="#aaa" fontSize={11} tickLine={false} axisLine={false} width={80} />
                    <Tooltip
                      contentStyle={{ background: "#1a1612", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 8, fontSize: 12 }}
                      formatter={(v: number) => formatUGX(v)}
                    />
                    <Bar dataKey="value" radius={4}>
                      {paymentData.map((d) => (
                        <Cell key={d.key} fill={paymentColors[d.key] || "#888"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="mt-4 space-y-2">
                  {paymentData.map((p) => (
                    <div key={p.key} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: paymentColors[p.key] }} />
                        <span className="text-muted-foreground">{p.name}</span>
                      </div>
                      <span className="font-medium">{formatUGX(p.value)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Bottom row */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="bg-card-gradient border-border">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
            <CardTitle className="text-base">Stock Alerts</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => setView("inventory")} className="h-7 text-xs">
              View all
            </Button>
          </CardHeader>
          <CardContent className="space-y-2">
            {lowStock.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">All stock levels OK</p>
            ) : (
              lowStock.slice(0, 6).map((p) => (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-border bg-background/30 p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">Reorder at {p.reorderLevel}</p>
                  </div>
                  <Badge
                    variant={p.stock === 0 ? "destructive" : p.stock <= p.reorderLevel / 2 ? "destructive" : "secondary"}
                    className="ml-2"
                  >
                    {p.stock === 0 ? "OUT" : p.stock <= p.reorderLevel / 2 ? "CRITICAL" : "LOW"} · {p.stock}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Crown className="h-4 w-4 text-primary" /> Top Sellers Today</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales yet today</p>
            ) : (
              topProducts.map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/15 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-[10px] text-muted-foreground">{p.qty} sold · {formatUGX(p.revenue)}</p>
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Recent Sales</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {recent.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales recorded yet</p>
            ) : (
              recent.map((s) => (
                <div key={s.id} className="flex items-center justify-between border-b border-border/50 pb-2 last:border-0 last:pb-0">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{s.receiptNo}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {s.cashierName} · {new Date(s.createdAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold">{formatUGX(s.total)}</p>
                    {s.status === "voided" && <Badge variant="destructive" className="text-[9px] h-4 px-1">VOID</Badge>}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff performance */}
      {staffRanking.length > 0 && (
        <Card className="bg-card-gradient border-border">
          <CardHeader>
            <CardTitle className="text-base">Staff Performance — Today</CardTitle>
            <CardDescription>Revenue by cashier</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {staffRanking.map((s, i) => {
              const max = staffRanking[0].revenue || 1;
              return (
                <div key={s.name} className="flex items-center gap-3">
                  <span className="w-6 text-xs text-muted-foreground">{i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-1 flex items-center justify-between">
                      <p className="truncate text-sm font-medium">{s.name}</p>
                      <p className="text-xs text-muted-foreground">{s.count} sales · {formatUGX(s.revenue)}</p>
                    </div>
                    <Progress value={(s.revenue / max) * 100} className="h-1.5" />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
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

function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/50 px-4 py-3">
      <Icon className="h-4 w-4 text-muted-foreground" />
      <div>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="text-sm font-semibold">{value}</p>
      </div>
    </div>
  );
}
