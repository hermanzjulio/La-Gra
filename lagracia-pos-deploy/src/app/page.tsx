"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { seedDemoSales } from "@/lib/seed";
import { Login } from "@/components/login";
import { AppShell } from "@/components/app-shell";
import { Dashboard } from "@/components/views/dashboard";
import { LiveOps } from "@/components/views/live-ops";
import { Pos } from "@/components/views/pos";
import { Products } from "@/components/views/products";
import { Categories } from "@/components/views/categories";
import { Inventory } from "@/components/views/inventory";
import { StockReceiving } from "@/components/views/stock-receiving";
import { StockAdjustments } from "@/components/views/stock-adjustments";
import { Expenses } from "@/components/views/expenses";
import { Customers } from "@/components/views/customers";
import { Voids } from "@/components/views/voids";
import { Staff } from "@/components/views/staff";
import { Reports } from "@/components/views/reports";
import { AuditLog } from "@/components/views/audit";
import { Settings } from "@/components/views/settings";
import { Backup } from "@/components/views/backup";

export default function Home() {
  const { currentUser, view } = useStore();
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        await seedDemoSales();
      } catch (e) {
        console.error("Demo seed failed", e);
      } finally {
        setSeeded(true);
      }
    })();
  }, []);

  if (!currentUser) return <Login />;

  if (!seeded) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Loading…</div>
      </div>
    );
  }

  const views: Record<string, React.ReactNode> = {
    dashboard: <Dashboard />,
    "live-ops": <LiveOps />,
    pos: <Pos />,
    products: <Products />,
    categories: <Categories />,
    inventory: <Inventory />,
    "stock-receiving": <StockReceiving />,
    "stock-adjustments": <StockAdjustments />,
    expenses: <Expenses />,
    customers: <Customers />,
    voids: <Voids />,
    staff: <Staff />,
    reports: <Reports />,
    audit: <AuditLog />,
    settings: <Settings />,
    backup: <Backup />,
  };

  return (
    <AppShell>
      <div className="h-full">{views[view] ?? <Dashboard />}</div>
    </AppShell>
  );
}
