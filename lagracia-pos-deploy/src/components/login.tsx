"use client";

import { useEffect, useState } from "react";
import { useStore } from "@/lib/store";
import { db, logAudit, type User } from "@/lib/db";
import { seedIfEmpty } from "@/lib/seed";
import {
  getSocket,
  joinSession,
  pushAuditLog,
  pushLocalCatalogToServer,
} from "@/lib/sync";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Lock, User as UserIcon, Shield } from "lucide-react";
import { toast } from "sonner";

export function Login() {
  const { login } = useStore();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        await seedIfEmpty();
      } catch (e) {
        console.error("Seed error", e);
      } finally {
        setBooting(false);
      }
    })();
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!username || !password) return;
    setLoading(true);
    try {
      const u = await db.users.where("username").equals(username.trim().toLowerCase()).first();
      if (!u || u.password !== password) {
        toast.error("Invalid username or password");
        setLoading(false);
        return;
      }
      if (!u.active) {
        toast.error("This account is disabled. Contact your manager.");
        setLoading(false);
        return;
      }
      await logAudit(u.id!, "login", `User ${u.username} logged in`);
      // Open socket + announce presence so the owner dashboard shows this device online
      // Also push the local catalog (users, categories, products) up to the server
      // so the Owner Live Dashboard has stock data to display.
      try {
        getSocket();
        joinSession(u);
        pushAuditLog({
          userId: u.id,
          userName: u.fullName,
          action: "login",
          detail: `User ${u.username} logged in`,
          entity: "user",
          entityId: String(u.id),
          createdAt: new Date().toISOString(),
        });
        // Fire-and-forget catalog push
        (async () => {
          try {
            const [users, categories, products] = await Promise.all([
              db.users.toArray(),
              db.categories.toArray(),
              db.products.toArray(),
            ]);
            await pushLocalCatalogToServer({ users, categories, products });
          } catch (e) {
            console.warn("catalog push failed", e);
          }
        })();
      } catch (e) {
        console.warn("sync joinSession failed", e);
      }
      login(u);
      toast.success(`Welcome, ${u.fullName}`);
    } catch (err) {
      console.error(err);
      toast.error("Login failed — please try again");
    } finally {
      setLoading(false);
    }
  }

  function quickFill(u: string, p: string) {
    setUsername(u);
    setPassword(p);
  }

  if (booting) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">Initializing local database…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {/* Brand */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gold-gradient shadow-gold-lg">
            <span className="text-2xl font-bold text-black">LG</span>
          </div>
          <h1 className="text-3xl font-bold text-gold-gradient tracking-wide">LA GRACIA</h1>
          <p className="mt-1 text-xs uppercase tracking-[0.3em] text-muted-foreground">Lounge · POS System</p>
        </div>

        {/* Card */}
        <div className="bg-card-gradient rounded-2xl border border-border p-6 shadow-gold">
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username" className="text-xs uppercase tracking-wider text-muted-foreground">
                Username
              </Label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="pl-10 h-12 bg-background/50 border-border"
                  placeholder="Enter username"
                  autoComplete="off"
                  autoCapitalize="off"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-xs uppercase tracking-wider text-muted-foreground">
                Password
              </Label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="pl-10 h-12 bg-background/50 border-border"
                  placeholder="Enter password"
                />
              </div>
            </div>

            <Button
              type="submit"
              disabled={loading || !username || !password}
              className="h-12 w-full bg-gold-gradient text-black font-semibold hover:opacity-90 shadow-gold"
            >
              {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "LOGIN"}
            </Button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 border-t border-border pt-4">
            <p className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Shield className="h-3 w-3" /> Demo Accounts — tap to autofill
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { r: "Owner", u: "owner", p: "owner123" },
                { r: "Manager", u: "manager", p: "manager123" },
                { r: "Cashier", u: "mary", p: "cashier123" },
                { r: "Waiter", u: "john", p: "waiter123" },
              ].map((a) => (
                <button
                  key={a.u}
                  onClick={() => quickFill(a.u, a.p)}
                  className="rounded-lg border border-border bg-background/30 p-2 text-left transition hover:border-primary/50 hover:bg-background/60"
                >
                  <p className="text-xs font-semibold text-primary">{a.r}</p>
                  <p className="text-[10px] text-muted-foreground">{a.u} / {a.p}</p>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-[10px] text-muted-foreground">
          Offline-first · Data stored on this device · v1.0
        </p>
      </div>
    </div>
  );
}
