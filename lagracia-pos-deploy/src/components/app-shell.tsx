"use client";

import { useEffect, useState } from "react";
import { useStore, can, type ViewKey } from "@/lib/store";
import { db, logAudit } from "@/lib/db";
import { getSocket, pushAuditLog, joinSession } from "@/lib/sync";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Tags,
  Boxes,
  Truck,
  SlidersHorizontal,
  Receipt,
  Users,
  Undo2,
  UserCog,
  BarChart3,
  ScrollText,
  Settings as SettingsIcon,
  DatabaseBackup,
  LogOut,
  Menu,
  Clock,
  Radio,
} from "lucide-react";

interface NavItem {
  key: ViewKey;
  label: string;
  icon: any;
  permission: string;
}

const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "Operations",
    items: [
      { key: "dashboard", label: "Dashboard", icon: LayoutDashboard, permission: "view.dashboard" },
      { key: "live-ops", label: "Live Ops · Remote", icon: Radio, permission: "view.live_ops" },
      { key: "pos", label: "POS / Sell", icon: ShoppingCart, permission: "pos.sell" },
    ],
  },
  {
    label: "Inventory",
    items: [
      { key: "products", label: "Products", icon: Package, permission: "products.manage" },
      { key: "categories", label: "Categories", icon: Tags, permission: "categories.manage" },
      { key: "inventory", label: "Stock Levels", icon: Boxes, permission: "inventory.view" },
      { key: "stock-receiving", label: "Stock Receiving", icon: Truck, permission: "inventory.receive" },
      { key: "stock-adjustments", label: "Stock Adjustments", icon: SlidersHorizontal, permission: "inventory.adjust" },
    ],
  },
  {
    label: "Finance",
    items: [
      { key: "expenses", label: "Expenses", icon: Receipt, permission: "expenses.manage" },
      { key: "voids", label: "Voids / Refunds", icon: Undo2, permission: "pos.void" },
    ],
  },
  {
    label: "People",
    items: [
      { key: "customers", label: "Customers", icon: Users, permission: "customers.manage" },
      { key: "staff", label: "Staff", icon: UserCog, permission: "view.staff" },
    ],
  },
  {
    label: "Insights & System",
    items: [
      { key: "reports", label: "Reports", icon: BarChart3, permission: "view.reports" },
      { key: "audit", label: "Audit Log", icon: ScrollText, permission: "view.audit" },
      { key: "settings", label: "Settings", icon: SettingsIcon, permission: "view.settings" },
      { key: "backup", label: "Backup / Restore", icon: DatabaseBackup, permission: "view.backup" },
    ],
  },
];

function NavList({ onNavigate }: { onNavigate?: () => void }) {
  const { currentUser, view, setView } = useStore();
  if (!currentUser) return null;

  return (
    <nav className="flex flex-col gap-6 px-3 py-4">
      {NAV_GROUPS.map((group) => {
        const items = group.items.filter((it) => can(currentUser, it.permission));
        if (items.length === 0) return null;
        return (
          <div key={group.label}>
            <p className="px-3 pb-2 text-[10px] uppercase tracking-widest text-muted-foreground/70 font-semibold">
              {group.label}
            </p>
            <div className="flex flex-col gap-1">
              {items.map((it) => {
                const Icon = it.icon;
                const active = view === it.key;
                return (
                  <button
                    key={it.key}
                    onClick={() => {
                      setView(it.key);
                      onNavigate?.();
                    }}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all",
                      active
                        ? "bg-gold-gradient text-black shadow-gold"
                        : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    <span className="truncate">{it.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-3 px-5 py-5 border-b border-sidebar-border">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-gold-gradient shadow-gold">
        <span className="text-lg font-bold text-black">LG</span>
      </div>
      <div>
        <p className="text-sm font-bold text-gold-gradient tracking-wide">LA GRACIA</p>
        <p className="text-[10px] uppercase tracking-[0.2em] text-muted-foreground">Lounge POS</p>
      </div>
    </div>
  );
}

function UserCard() {
  const { currentUser, logout } = useStore();
  if (!currentUser) return null;
  return (
    <div className="border-t border-sidebar-border p-3">
      <div className="flex items-center gap-3 rounded-lg bg-sidebar-accent p-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-gradient text-sm font-bold text-black">
          {currentUser.fullName.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{currentUser.fullName}</p>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{currentUser.role}</p>
        </div>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-destructive"
          onClick={async () => {
            await logAudit(currentUser.id!, "logout", `User ${currentUser.username} logged out`);
            try {
              pushAuditLog({
                userId: currentUser.id,
                userName: currentUser.fullName,
                action: "logout",
                detail: `User ${currentUser.username} logged out`,
                entity: "user",
                entityId: String(currentUser.id),
                createdAt: new Date().toISOString(),
              });
              const s = getSocket();
              s.disconnect();
            } catch (e) {
              console.warn("sync disconnect failed", e);
            }
            logout();
          }}
        >
          <LogOut className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SyncStatus() {
  const online = useOnlineStatus();
  const color = online === null ? "bg-muted-foreground" : online ? "bg-emerald-500" : "bg-red-500";
  const label =
    online === null
      ? "Connecting…"
      : online
        ? "Live · Synced"
        : "Offline · Local Only";
  return (
    <div className="flex items-center gap-2">
      <span className={`relative flex h-2 w-2`}>
        <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${color} opacity-60`} />
        <span className={`relative inline-flex h-2 w-2 rounded-full ${color}`} />
      </span>
      <span className="hidden text-xs text-muted-foreground sm:inline">{label}</span>
      <span className="text-xs text-primary sm:hidden">{online ? "Live" : "Off"}</span>
    </div>
  );
}

/**
 * useOnlineStatus — tracks socket connection state and re-emits
 * `session:join` whenever the socket (re)connects. This ensures the
 * owner's presence shows up on every other device's dashboard.
 */
function useOnlineStatus() {
  const { currentUser } = useStore();
  const [online, setOnline] = useState<boolean | null>(null);
  useEffect(() => {
    let mounted = true;
    let s: ReturnType<typeof getSocket> | null = null;
    const onConnect = () => {
      if (!mounted) return;
      setOnline(true);
      // Re-announce our presence on every (re)connect
      if (currentUser) {
        try {
          joinSession(currentUser);
        } catch (e) {
          console.warn("joinSession on reconnect failed", e);
        }
      }
    };
    const onDisconnect = () => mounted && setOnline(false);
    try {
      s = getSocket();
      s.on("connect", onConnect);
      s.on("disconnect", onDisconnect);
      const t = setTimeout(() => {
        if (mounted) setOnline(s?.connected ?? false);
      }, 0);
      return () => {
        mounted = false;
        clearTimeout(t);
        s?.off("connect", onConnect);
        s?.off("disconnect", onDisconnect);
      };
    } catch {
      const t = setTimeout(() => mounted && setOnline(false), 0);
      return () => {
        mounted = false;
        clearTimeout(t);
      };
    }
  }, [currentUser]);
  return online;
}

function ClockBadge() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-1.5 text-sm">
      <Clock className="h-4 w-4 text-primary" />
      <span className="font-mono tabular-nums">
        {now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false })}
      </span>
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{now.toLocaleDateString("en-GB", { day: "2-digit", month: "short" })}</span>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { currentUser, sidebarOpen, setSidebarOpen } = useStore();
  if (!currentUser) return null;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
        <Brand />
        <div className="flex-1 overflow-y-auto">
          <NavList />
        </div>
        <UserCard />
      </aside>

      {/* Mobile sidebar (sheet) */}
      <Sheet open={sidebarOpen} onOpenChange={setSidebarOpen}>
        <SheetContent side="left" className="w-72 border-sidebar-border bg-sidebar p-0">
          <Brand />
          <div className="flex h-[calc(100%-160px)] flex-col">
            <div className="flex-1 overflow-y-auto">
              <NavList onNavigate={() => setSidebarOpen(false)} />
            </div>
            <UserCard />
          </div>
        </SheetContent>
      </Sheet>

      {/* Main */}
      <div className="flex flex-1 flex-col min-w-0">
        {/* Top bar */}
        <header className="flex h-16 shrink-0 items-center justify-between gap-4 border-b border-border bg-card/50 px-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </Button>
            <SyncStatus />
          </div>
          <ClockBadge />
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
