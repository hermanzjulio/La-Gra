"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type Customer } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatUGX, formatDate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, Search, Users, Phone, Mail, X } from "lucide-react";
import { toast } from "sonner";

export function Customers() {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Customer | null>(null);
  const [form, setForm] = useState<Partial<Customer>>({});
  const [search, setSearch] = useState("");

  const customers = useLiveQuery(() => db.customers.toArray(), []);
  const sales = useLiveQuery(() => db.sales.toArray(), []);

  if (!customers) return null;

  const filtered = customers.filter((c) =>
    !search || c.name.toLowerCase().includes(search.toLowerCase()) || (c.phone ?? "").includes(search));

  const totalCredit = customers.reduce((s, c) => s + c.creditBalance, 0);

  function openNew() {
    setEditing(null);
    setForm({ name: "", phone: "", email: "", creditBalance: 0, notes: "" });
    setOpen(true);
  }
  function openEdit(c: Customer) {
    setEditing(c);
    setForm(c);
    setOpen(true);
  }

  async function save() {
    if (!currentUser) return;
    if (!form.name) { toast.error("Name is required"); return; }
    const data = {
      name: form.name!,
      phone: form.phone || "",
      email: form.email || "",
      creditBalance: Number(form.creditBalance) || 0,
      notes: form.notes || "",
      createdAt: form.createdAt ?? new Date().toISOString(),
    };
    if (editing) {
      await db.customers.update(editing.id!, data);
      await logAudit(currentUser.id!, "customer_update", `Updated customer: ${data.name}`, "customer", String(editing.id));
    } else {
      const id = await db.customers.add(data as Customer);
      await logAudit(currentUser.id!, "customer_create", `Created customer: ${data.name}`, "customer", String(id));
    }
    toast.success(editing ? "Customer updated" : "Customer added");
    setOpen(false);
  }

  async function remove(id: number, name: string) {
    const count = sales?.filter(s => s.customerId === id).length ?? 0;
    if (count > 0) {
      toast.error(`Cannot delete — ${count} sales linked. Settle or void them first.`);
      return;
    }
    if (!confirm(`Delete customer "${name}"?`)) return;
    await db.customers.delete(id);
    if (currentUser) await logAudit(currentUser.id!, "customer_delete", `Deleted customer: ${name}`, "customer", String(id));
    toast.success("Customer deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Customers</h1>
          <p className="text-sm text-muted-foreground">{customers.length} customers · {formatUGX(totalCredit)} in outstanding credit</p>
        </div>
        <Button onClick={openNew} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Plus className="mr-2 h-4 w-4" /> Add Customer
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or phone…" className="pl-10" />
      </div>

      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead>Email</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Credit Balance</TableHead>
              <TableHead>Since</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((c) => {
              const saleCount = sales?.filter(s => s.customerId === c.id).length ?? 0;
              return (
                <TableRow key={c.id} className="border-border">
                  <TableCell className="font-medium">{c.name}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.phone || "—"}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.email || "—"}</TableCell>
                  <TableCell className="text-right text-xs">{saleCount}</TableCell>
                  <TableCell className="text-right">
                    {c.creditBalance > 0 ? (
                      <Badge variant="destructive">{formatUGX(c.creditBalance)}</Badge>
                    ) : (
                      <span className="text-emerald-400 text-xs">Settled</span>
                    )}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{c.createdAt ? formatDate(c.createdAt) : "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(c.id!, c.name)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
        {filtered.length === 0 && (
          <div className="py-12 text-center text-sm text-muted-foreground"><Users className="mx-auto mb-2 h-8 w-8 opacity-30" /> No customers yet</div>
        )}
      </div>

      {/* Dialog */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md rounded-xl border border-border bg-card-gradient p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editing ? "Edit Customer" : "Add Customer"}</h2>
              <Button size="icon" variant="ghost" onClick={() => setOpen(false)}><X className="h-4 w-4" /></Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">Name *</Label>
                <Input value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Phone</Label>
                  <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+256…" />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Email</Label>
                  <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Outstanding Credit Balance (UGX)</Label>
                <Input type="number" value={form.creditBalance ?? 0} onChange={(e) => setForm({ ...form, creditBalance: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
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
