"use client";

import { useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { db, logAudit, type User, type UserRole } from "@/lib/db";
import { useStore } from "@/lib/store";
import { formatDateTime, isSameDay } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Plus, Pencil, Trash2, UserCog, Shield } from "lucide-react";
import { toast } from "sonner";

const ROLE_LABELS: Record<UserRole, string> = {
  owner: "Owner",
  manager: "Manager",
  cashier: "Cashier",
  waiter: "Waiter",
};

export function Staff() {
  const { currentUser } = useStore();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const [form, setForm] = useState<Partial<User>>({});

  const users = useLiveQuery(() => db.users.toArray(), []);
  const sales = useLiveQuery(() => db.sales.toArray(), []);

  if (!users || !sales) return null;

  function openNew() {
    setEditing(null);
    setForm({ username: "", password: "", fullName: "", role: "waiter", pin: "", active: true });
    setOpen(true);
  }
  function openEdit(u: User) {
    setEditing(u);
    setForm(u);
    setOpen(true);
  }

  async function save() {
    if (!currentUser) return;
    if (!form.username || !form.fullName || !form.password) { toast.error("Username, full name, and password required"); return; }
    if (!form.pin || form.pin.length < 4) { toast.error("PIN must be at least 4 digits"); return; }

    // Check username uniqueness
    const existing = users.find(u => u.username.toLowerCase() === form.username!.toLowerCase() && u.id !== editing?.id);
    if (existing) { toast.error("Username already exists"); return; }

    const data = {
      username: form.username!.toLowerCase(),
      password: form.password!,
      fullName: form.fullName!,
      role: (form.role as UserRole) || "waiter",
      pin: form.pin!,
      active: form.active ?? true,
      createdAt: form.createdAt ?? new Date().toISOString(),
    };

    if (editing) {
      await db.users.update(editing.id!, data);
      await logAudit(currentUser.id!, "user_update", `Updated user: ${data.fullName} (${data.role})`, "user", String(editing.id));
    } else {
      const id = await db.users.add(data as User);
      await logAudit(currentUser.id!, "user_create", `Created user: ${data.fullName} (${data.role})`, "user", String(id));
    }
    toast.success(editing ? "Staff updated" : "Staff added");
    setOpen(false);
  }

  async function remove(id: number, name: string) {
    if (id === currentUser?.id) { toast.error("Cannot delete yourself"); return; }
    const owners = users.filter(u => u.role === "owner" && u.active);
    if (users.find(u => u.id === id)?.role === "owner" && owners.length <= 1) {
      toast.error("Cannot delete the last owner");
      return;
    }
    if (!confirm(`Delete staff member "${name}"? This will revoke their access immediately.`)) return;
    await db.users.delete(id);
    if (currentUser) await logAudit(currentUser.id!, "user_delete", `Deleted user: ${name}`, "user", String(id));
    toast.success("Staff deleted");
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Staff Management</h1>
          <p className="text-sm text-muted-foreground">{users.length} staff members · {users.filter(u => u.active).length} active</p>
        </div>
        <Button onClick={openNew} className="bg-gold-gradient text-black hover:opacity-90 shadow-gold">
          <Plus className="mr-2 h-4 w-4" /> Add Staff
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card-gradient overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead>Name</TableHead>
              <TableHead>Username</TableHead>
              <TableHead>Role</TableHead>
              <TableHead>PIN</TableHead>
              <TableHead className="text-right">Today's Sales</TableHead>
              <TableHead className="text-center">Active</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {users.map((u) => {
              const todayCount = sales.filter(s => s.cashierId === u.id && isSameDay(s.createdAt, new Date()) && s.status === "completed").length;
              return (
                <TableRow key={u.id} className="border-border">
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                        {u.fullName.slice(0, 1)}
                      </span>
                      {u.fullName}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">{u.username}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={u.role === "owner" ? "border-primary text-primary" : u.role === "manager" ? "border-emerald-500/30 text-emerald-400" : ""}>
                      <Shield className="mr-1 h-3 w-3" />{ROLE_LABELS[u.role]}
                    </Badge>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{u.pin ? "••••" : "—"}</TableCell>
                  <TableCell className="text-right text-sm">{todayCount}</TableCell>
                  <TableCell className="text-center">
                    <Switch checked={u.active} onCheckedChange={async (v) => {
                      await db.users.update(u.id!, { active: v });
                      if (currentUser) await logAudit(currentUser.id!, "user_status", `${v ? "Activated" : "Deactivated"} user: ${u.fullName}`, "user", String(u.id));
                    }} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => openEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => remove(u.id!, u.fullName)}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-card-gradient border-border max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Staff" : "Add Staff Member"}</DialogTitle>
            <DialogDescription>{editing ? "Update staff details" : "Create a new account"}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1">
              <Label className="text-xs">Full Name *</Label>
              <Input value={form.fullName ?? ""} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Username *</Label>
                <Input value={form.username ?? ""} onChange={(e) => setForm({ ...form, username: e.target.value })} autoCapitalize="off" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">PIN *</Label>
                <Input value={form.pin ?? ""} onChange={(e) => setForm({ ...form, pin: e.target.value.replace(/\D/g, "") })} maxLength={6} placeholder="4-6 digits" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Password *</Label>
                <Input value={form.password ?? ""} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Role</Label>
                <Select value={form.role ?? "waiter"} onValueChange={(v: any) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="owner">Owner</SelectItem>
                    <SelectItem value="manager">Manager</SelectItem>
                    <SelectItem value="cashier">Cashier</SelectItem>
                    <SelectItem value="waiter">Waiter</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="staff-active" checked={form.active ?? true} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label htmlFor="staff-active">Active (can log in)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} className="bg-gold-gradient text-black hover:opacity-90">Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
