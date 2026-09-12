"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Search, ScrollText } from "lucide-react";

const ACTION_COLORS: Record<string, string> = {
  login: "border-blue-500/30 text-blue-400",
  logout: "border-muted-foreground text-muted-foreground",
  sale: "border-emerald-500/30 text-emerald-400",
  void: "border-red-500/30 text-red-400",
  discount: "border-amber-500/30 text-amber-400",
  stock_receive: "border-cyan-500/30 text-cyan-400",
  stock_adjust: "border-purple-500/30 text-purple-400",
  product_create: "border-primary text-primary",
  product_update: "border-primary text-primary",
  product_delete: "border-destructive text-destructive",
  category_create: "border-primary text-primary",
  category_update: "border-primary text-primary",
  category_delete: "border-destructive text-destructive",
  expense_create: "border-red-500/30 text-red-400",
  expense_delete: "border-destructive text-destructive",
  customer_create: "border-primary text-primary",
  customer_update: "border-primary text-primary",
  customer_delete: "border-destructive text-destructive",
  user_create: "border-primary text-primary",
  user_update: "border-primary text-primary",
  user_delete: "border-destructive text-destructive",
  user_status: "border-amber-500/30 text-amber-400",
};

export function AuditLog() {
  const [search, setSearch] = useState("");
  const [actionFilter, setActionFilter] = useState("all");

  const logs = useLiveQuery(() => db.auditLogs.reverse().sortBy("createdAt"), []);

  if (!logs) return null;

  const actions = Array.from(new Set(logs.map((l) => l.action)));
  const filtered = logs
    .filter((l) => actionFilter === "all" || l.action === actionFilter)
    .filter((l) => !search || l.userName.toLowerCase().includes(search.toLowerCase()) || l.detail.toLowerCase().includes(search.toLowerCase()))
    .slice(0, 500);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Audit Log</h1>
        <p className="text-sm text-muted-foreground">Complete trail of every action — for security & accountability</p>
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search user or detail…" className="pl-10" />
        </div>
        <Select value={actionFilter} onValueChange={setActionFilter}>
          <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Actions</SelectItem>
            {actions.sort().map((a) => (
              <SelectItem key={a} value={a}>{a.replace(/_/g, " ")}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="rounded-lg border border-border bg-card-gradient">
        <ScrollArea className="h-[calc(100vh-260px)]">
          <div className="divide-y divide-border">
            {filtered.map((l) => (
              <div key={l.id} className="flex items-start gap-3 p-3 hover:bg-background/30 transition">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {l.userName.slice(0, 1)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{l.userName}</span>
                    <Badge variant="outline" className={`text-[10px] ${ACTION_COLORS[l.action] || ""}`}>
                      {l.action.replace(/_/g, " ")}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">{formatDateTime(l.createdAt)}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted-foreground">{l.detail}</p>
                </div>
              </div>
            ))}
          </div>
          {filtered.length === 0 && (
            <div className="py-12 text-center text-sm text-muted-foreground">
              <ScrollText className="mx-auto mb-2 h-8 w-8 opacity-30" /> No audit entries
            </div>
          )}
        </ScrollArea>
      </div>
    </div>
  );
}
