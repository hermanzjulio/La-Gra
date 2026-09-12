"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type Expense } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX, formatDateTime, todayISO, isSameDay } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "sonner";

const CATEGORIES = ["Electricity", "Water", "Rent", "Transport", "Cleaning", "Entertainment", "Salaries", "Marketing", "Supplies", "Maintenance", "Security", "Taxes", "Other"];

export function Expenses() {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Partial<Expense>>({ date: todayISO(), category: "Electricity" });
  const [filter, setFilter] = useState<string>("today");

  const expenses = useLiveQuery(() => db.expenses.reverse().sortBy("createdAt"), []);

  if (!expenses) return null;

  const filtered = expenses.filter((e) => {
    if (filter === "today") return isSameDay(e.date, new Date());
    if (filter === "week") {
      const d = new Date(e.date);
      const weekAgo = new Date(); weekAgo.setDate(weekAgo.getDate() - 7);
      return d >= weekAgo;
    }
    if (filter === "month") {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }
    return true;
  });

  const total = filtered.reduce((s, e) => s + e.amount, 0);

  async function save() {
    if (!currentUser) return;
    if (!form.category || !form.amount || form.amount <= 0) {
      toast.error("Category and amount are required");
      return;
    }
    const data = {
      category: form.category!,
      description: form.description || "",
      amount: Number(form.amount),
      paidBy: form.paidBy || "",
      date: form.date || todayISO(),
      createdAt: new Date().toISOString(),
    };
    const id = await db.expenses.add(data as Expense);
    await logAudit(currentUser.id!, "expense_create", `Expense: ${data.category} ${formatUGX(data.amount)}`, "expense", String(id));
    toast.success("Expense recorded");
    setForm({ date: todayISO(), category: "Electricity" });
    setOpen(false);
  }

  async function remove(id: number, category: string, amount: number) {
    if (!confirm(`Delete expense ${category} ${formatUGX(amount)}?`)) return;
    await db.expenses.delete(id);
    if (currentUser) await logAudit(currentUser.id!, "expense_delete", `Deleted expense: ${category} ${formatUGX(amount)}`, "expense", String(id));
    toast.success("Expense deleted");
  }

  // Group totals by category
  const byCat: Record<string, number> = {};
  for (const e of filtered) byCat[e.category] = (byCat[e.category] || 0) + e.amount;
  const sortedCats = Object.entries(byCat).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Expenses</h1>
          <p className="text-sm text-muted-foreground">Track operational costs to estimate true profitability</p>
        </div>
        <Button onClick={() => setOpen(true)} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Plus className="mr-2 h-4 w-4" /> Add Expense
        </Button>
      </div>

      {/* Summary */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="bg-card-gradient border-border">
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total ({filter})</p>
            <p className="text-xl font-bold text-primary">{formatUGX(total)}</p>
          </CardContent>
        </Card>
        {sortedCats.slice(0, 3).map(([cat, amt]) => (
          <Card key={cat} className="bg-card-gradient border-border">
            <CardContent className="p-4">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{cat}</p>
              <p className="text-xl font-bold">{formatUGX(amt)}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2">
        <Select value={filter} onValueChange={setFilter}>
          <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="today">Today</SelectItem>
            <SelectItem value="week">This Week</SelectItem>
            <SelectItem value="month">This Month</SelectItem>
            <SelectItem value="all">All Time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Date</TableHead>
              <TableHead>Category</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Paid By</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="w-12"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((e) => (
              <TableRow key={e.id} className="border-border">
                <TableCell className="text-xs">{new Date(e.date).toLocaleDateString("en-GB")}</TableCell>
                <TableCell><Badge variant="outline">{e.category}</Badge></TableCell>
                <TableCell className="text-sm">{e.description || "—"}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{e.paidBy || "—"}</TableCell>
                <TableCell className="text-right font-semibold text-red-400">{formatUGX(e.amount)}</TableCell>
                <TableCell>
                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(e.id!, e.category, e.amount)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground"><Receipt className="mx-auto mb-2 h-8 w-8 opacity-30" /> No expenses recorded</div>
        )}
      </div>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card-gradient p-5" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-4 text-lg font-semibold">Add Expense</h2>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Category</Label>
                  <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Amount (UGX) *</Label>
                  <Input type="number" value={form.amount ?? ""} onChange={(e) => setForm({ ...form, amount: parseFloat(e.target.value) || 0 })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Input value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Optional notes" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input type="date" value={form.date ?? todayISO()} onChange={(e) => setForm({ ...form, date: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Paid By</Label>
                  <Input value={form.paidBy ?? ""} onChange={(e) => setForm({ ...form, paidBy: e.target.value })} placeholder="Name" />
                </div>
              </div>
            </div>
            <div className="mt-5 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setOpen(false)}>Cancel</Button>
              <Button onClick={save} className="flex-1 bg-gold-gradient text-black hover:opacity-90">Save</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
