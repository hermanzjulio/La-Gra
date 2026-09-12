"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { formatUGX, isSameDay, isThisWeek, isThisMonth, formatDate } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, PieChart, Pie, Legend,
} from "recharts";
import { TrendingUp, DollarSign, Package, Receipt, Wallet } from "lucide-react";

export function Reports() {
  const [range, setRange] = useState<string>("today");

  const sales = useLiveQuery(() => db.sales.toArray(), []);
  const expenses = useLiveQuery(() => db.expenses.toArray(), []);
  const products = useLiveQuery(() => db.products.toArray(), []);

  if (!sales || !expenses || !products) return null;

  const filterFn = (iso: string) => {
    if (range === "today") return isSameDay(iso, new Date());
    if (range === "week") return isThisWeek(iso);
    if (range === "month") return isThisMonth(iso);
    return true;
  };

  const rangeSales = sales.filter(s => s.status === "completed" && filterFn(s.createdAt));
  const rangeExpenses = expenses.filter(e => filterFn(e.date));
  const revenue = rangeSales.reduce((s, x) => s + x.total, 0);
  const cost = rangeSales.reduce((s, x) => s + x.cost, 0);
  const grossProfit = revenue - cost;
  const expTotal = rangeExpenses.reduce((s, e) => s + e.amount, 0);
  const netProfit = grossProfit - expTotal;
  const qtySold = rangeSales.reduce((s, x) => s + x.items.reduce((a, b) => a + b.qty, 0), 0);
  const avgSale = rangeSales.length ? revenue / rangeSales.length : 0;

  // Daily trend (last 14 days)
  const trend: { date: string; revenue: number; profit: number; expenses: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dayS = sales.filter(s => s.status === "completed" && isSameDay(s.createdAt, d));
    const dayE = expenses.filter(e => isSameDay(e.date, d.toISOString().slice(0, 10)));
    trend.push({
      date: d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      revenue: dayS.reduce((s, x) => s + x.total, 0),
      profit: dayS.reduce((s, x) => s + x.total - x.cost, 0),
      expenses: dayE.reduce((s, e) => s + e.amount, 0),
    });
  }

  // Product performance
  const prodPerf: Record<string, { name: string; qty: number; revenue: number; profit: number }> = {};
  for (const s of rangeSales) {
    for (const it of s.items) {
      if (!prodPerf[it.productId]) prodPerf[it.productId] = { name: it.productName, qty: 0, revenue: 0, profit: 0 };
      prodPerf[it.productId].qty += it.qty;
      prodPerf[it.productId].revenue += it.lineTotal;
      prodPerf[it.productId].profit += it.lineTotal - it.costPrice * it.qty;
    }
  }
  const topByRevenue = Object.values(prodPerf).sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  // Payment breakdown
  const payByMethod: Record<string, number> = { cash: 0, mobile_money: 0, card: 0, credit: 0 };
  for (const s of rangeSales) payByMethod[s.paymentMethod] = (payByMethod[s.paymentMethod] || 0) + s.total;
  const payData = Object.entries(payByMethod).filter(([_, v]) => v > 0).map(([k, v]) => ({ name: k.replace("_", " ").toUpperCase(), value: v }));
  const payColors = ["#c9a227", "#4a9eff", "#a855f7", "#ef4444"];

  // Staff performance
  const staffPerf: Record<string, { name: string; sales: number; revenue: number }> = {};
  for (const s of rangeSales) {
    if (!staffPerf[s.cashierName]) staffPerf[s.cashierName] = { name: s.cashierName, sales: 0, revenue: 0 };
    staffPerf[s.cashierName].sales += 1;
    staffPerf[s.cashierName].revenue += s.total;
  }
  const staffData = Object.values(staffPerf).sort((a, b) => b.revenue - a.revenue);

  // Hourly distribution
  const hourly: { hour: string; sales: number }[] = [];
  for (let h = 0; h < 24; h++) {
    hourly.push({ hour: `${String(h).padStart(2, "0")}:00`, sales: 0 });
  }
  for (const s of rangeSales) {
    const h = new Date(s.createdAt).getHours();
    hourly[h].sales += s.total;
  }
  const activeHours = hourly.filter(h => h.sales > 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Reports</h1>
          <p className="text-sm text-muted-foreground">Business intelligence & performance analysis</p>
        </div>
        <Select value={range} onValueChange={setRange}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Revenue" value={formatUGX(revenue)} sub={`${rangeSales.length} sales`} icon={DollarSign} tone="gold" />
        <KpiCard label="Gross Profit" value={formatUGX(grossProfit)} sub={`${revenue > 0 ? Math.round((grossProfit / revenue) * 100) : 0}% margin`} icon={TrendingUp} tone="green" />
        <KpiCard label="Expenses" value={formatUGX(expTotal)} sub={`${rangeExpenses.length} entries`} icon={Receipt} tone="red" />
        <KpiCard label="Net Profit" value={formatUGX(netProfit)} sub={netProfit >= 0 ? "Profit" : "Loss"} icon={Wallet} tone={netProfit >= 0 ? "green" : "red"} />
      </div>

      {/* Trend chart */}
      <Card className="bg-card-gradient border-border">
        <CardHeader>
          <CardTitle className="text-base">14-Day Trend</CardTitle>
          <CardDescription>Revenue, profit and expenses over time</CardDescription>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={trend} margin={{ left: -10, right: 10 }}>
              <defs>
                <linearGradient id="r" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#c9a227" stopOpacity={0.5} /><stop offset="95%" stopColor="#c9a227" stopOpacity={0} /></linearGradient>
                <linearGradient id="p" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#10b981" stopOpacity={0.5} /><stop offset="95%" stopColor="#10b981" stopOpacity={0} /></linearGradient>
                <linearGradient id="e" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#ef4444" stopOpacity={0.4} /><stop offset="95%" stopColor="#ef4444" stopOpacity={0} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
              <XAxis dataKey="date" stroke="#888" fontSize={11} tickLine={false} axisLine={false} />
              <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} />
              <Tooltip contentStyle={{ background: "#1a1612", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatUGX(v)} />
              <Area type="monotone" dataKey="revenue" stroke="#c9a227" strokeWidth={2} fill="url(#r)" name="Revenue" />
              <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#p)" name="Profit" />
              <Area type="monotone" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fill="url(#e)" name="Expenses" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Two-up */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Product performance */}
        <Card className="bg-card-gradient border-border">
          <CardHeader><CardTitle className="text-base">Top Products by Revenue</CardTitle></CardHeader>
          <CardContent>
            {topByRevenue.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Product</TableHead>
                    <TableHead className="text-right">Qty</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Profit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {topByRevenue.map((p, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="font-medium text-sm">{p.name}</TableCell>
                      <TableCell className="text-right text-sm">{p.qty}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{formatUGX(p.revenue)}</TableCell>
                      <TableCell className="text-right text-sm text-emerald-400">{formatUGX(p.profit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        {/* Payment methods pie */}
        <Card className="bg-card-gradient border-border">
          <CardHeader><CardTitle className="text-base">Payment Method Breakdown</CardTitle></CardHeader>
          <CardContent>
            {payData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={payData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={90} paddingAngle={3}>
                      {payData.map((_, i) => <Cell key={i} fill={payColors[i % payColors.length]} />)}
                    </Pie>
                    <Tooltip contentStyle={{ background: "#1a1612", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatUGX(v)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Staff + hourly */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="bg-card-gradient border-border">
          <CardHeader><CardTitle className="text-base">Staff Performance</CardTitle></CardHeader>
          <CardContent>
            {staffData.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-border hover:bg-transparent">
                    <TableHead>Staff</TableHead>
                    <TableHead className="text-right">Sales</TableHead>
                    <TableHead className="text-right">Revenue</TableHead>
                    <TableHead className="text-right">Avg/Sale</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {staffData.map((s, i) => (
                    <TableRow key={i} className="border-border">
                      <TableCell className="font-medium text-sm">{s.name}</TableCell>
                      <TableCell className="text-right text-sm">{s.sales}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{formatUGX(s.revenue)}</TableCell>
                      <TableCell className="text-right text-sm text-muted-foreground">{formatUGX(s.revenue / s.sales)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card-gradient border-border">
          <CardHeader><CardTitle className="text-base">Sales by Hour</CardTitle></CardHeader>
          <CardContent>
            {activeHours.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">No sales in this period</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={activeHours} margin={{ left: -10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="hour" stroke="#888" fontSize={10} tickLine={false} axisLine={false} />
                  <YAxis stroke="#888" fontSize={11} tickFormatter={(v) => (v >= 1000 ? `${Math.round(v / 1000)}k` : v)} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ background: "#1a1612", border: "1px solid rgba(201,162,39,0.3)", borderRadius: 8, fontSize: 12 }} formatter={(v: number) => formatUGX(v)} />
                  <Bar dataKey="sales" fill="#c9a227" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Inventory valuation */}
      <Card className="bg-card-gradient border-border">
        <CardHeader><CardTitle className="text-base">Inventory Valuation</CardTitle></CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-3 mb-4">
            <Stat label="Total Products" value={String(products.length)} />
            <Stat label="Stock Value (Cost)" value={formatUGX(products.reduce((s, p) => s + p.stock * p.costPrice, 0))} />
            <Stat label="Retail Value" value={formatUGX(products.reduce((s, p) => s + p.stock * p.price, 0))} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ label, value, sub, icon: Icon, tone }: { label: string; value: string; sub: string; icon: any; tone: "gold" | "green" | "red" }) {
  const toneClass = {
    gold: "text-primary bg-primary/10",
    green: "text-emerald-400 bg-emerald-500/10",
    red: "text-red-400 bg-red-500/10",
  }[tone];
  return (
    <Card className="bg-card-gradient border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
          </div>
          <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}><Icon className="h-5 w-5" /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/30 p-3">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
